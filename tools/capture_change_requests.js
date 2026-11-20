import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import os from 'os';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function capture() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr_verify_'));
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    userDataDir: tmpDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    console.log('[Verify] Navigating to http://127.0.0.1:5173/...');
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0', timeout: 30000 });

    // Wait for loading overlay to be hidden
    await page.waitForFunction(() => {
      const el = document.getElementById('loading-overlay');
      return el && el.classList.contains('hidden');
    }, { timeout: 20000 });

    await new Promise(r => setTimeout(r, 1000));

    // ========================================================
    // 1. NAME FLOW: SURAJ (Keypad contiguous search)
    // ========================================================
    console.log('[Verify] Testing Name Tab: SURAJ in Keypad mode...');
    await page.click('#tab-name');
    await new Promise(r => setTimeout(r, 400));

    // Click search button
    await page.click('#name-search-btn');

    // Wait for search result and camera flight (~3.5s)
    await new Promise(r => setTimeout(r, 4000));

    await page.screenshot({ path: 'name_keypad_match.png' });
    console.log('[Verify] Saved name_keypad_match.png');

    // ========================================================
    // 2. NAME FLOW: Long name fallback into pieces
    // ========================================================
    console.log('[Verify] Testing Name Tab: Long name fallback pieces...');
    await page.click('#name-input', { clickCount: 3 });
    await page.type('#name-input', 'SUPERCALIFRAGILISTIC');
    await new Promise(r => setTimeout(r, 200));
    await page.click('#name-search-btn');

    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: 'name_pieces_fallback.png' });
    console.log('[Verify] Saved name_pieces_fallback.png');

    // ========================================================
    // 3. IMAGE FLOW: Exact Subsequence Search and Reveal
    // ========================================================
    console.log('[Verify] Testing Image Tab...');
    await page.click('#tab-image');
    await new Promise(r => setTimeout(r, 400));

    // Click sample button
    console.log('[Verify] Clicking sample: Greek letter pi...');
    await page.click('#load-sample-btn');
    await new Promise(r => setTimeout(r, 600));

    // Choose 64 for fast demo & crisp grid
    const size64Btn = await page.$('button.size-opt[data-size="64"]');
    if (size64Btn) {
      await size64Btn.click();
      await new Promise(r => setTimeout(r, 400));
    }

    // Click Search in pi
    console.log('[Verify] Clicking exact subsequence search...');
    await page.click('#btn-search-subsequence');

    // Wait for search to complete and results to render
    await page.waitForFunction(() => {
      const scrubber = document.getElementById('reveal-scrubber');
      return scrubber !== null;
    }, { timeout: 15000 });

    await new Promise(r => setTimeout(r, 1000));

    // 3A: Reading start (scrubber at 0.05)
    console.log('[Verify] Setting scrubber to 0.05 (Reading Start)...');
    await page.evaluate(() => {
      const atlas = window.__PI_ATLAS__;
      if (atlas) {
        atlas.visualizer.imageGather.stop();
        atlas.imagePanel.updateScrubber(0.05);
        atlas.visualizer.imageGather.setProgress(0.05);
        atlas.visualizer.requestRender();
      }
    });
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: 'image_reading_start.png' });
    console.log('[Verify] Saved image_reading_start.png');

    // 3B: Gather motion (scrubber at 0.55)
    console.log('[Verify] Setting scrubber to 0.55 (Gather Motion)...');
    await page.evaluate(() => {
      const atlas = window.__PI_ATLAS__;
      if (atlas) {
        atlas.visualizer.imageGather.stop();
        atlas.imagePanel.updateScrubber(0.55);
        atlas.visualizer.imageGather.setProgress(0.55);
        atlas.visualizer.requestRender();
      }
    });
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: 'image_gather_motion.png' });
    console.log('[Verify] Saved image_gather_motion.png');

    // 3C: Final grid (scrubber at 1.0) with hover tooltip
    console.log('[Verify] Setting scrubber to 1.0 (Final Grid) and hovering...');
    const hoverCoords = await page.evaluate(() => {
      const atlas = window.__PI_ATLAS__;
      if (atlas) {
        atlas.visualizer.imageGather.stop();
        atlas.imagePanel.updateScrubber(1.0);
        atlas.visualizer.imageGather.setProgress(1.0);
        const k = 1250;
        const gather = atlas.visualizer.imageGather;
        const sx = gather.targetScreenX[k] + 4;
        const sy = gather.targetScreenY[k] + 4;
        gather.handlePointerMove(sx, sy);
        atlas.visualizer.requestRender();
        return { sx, sy, hovered: gather.hoveredPixelIndex };
      }
      return null;
    });
    console.log('[Verify] Hover coords:', hoverCoords);
    if (hoverCoords) {
      await page.mouse.move(hoverCoords.sx, hoverCoords.sy);
    }
    await new Promise(r => setTimeout(r, 600));

    await page.screenshot({ path: 'image_final_grid_hover.png' });
    console.log('[Verify] Saved image_final_grid_hover.png');

    console.log('[Verify] All states captured successfully!');
  } finally {
    await browser.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}

capture().catch(err => {
  console.error('[Verify Failed]', err);
  process.exit(1);
});
