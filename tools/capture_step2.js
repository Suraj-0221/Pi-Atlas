import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import os from 'os';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function capture() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'step2_verify_'));
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    userDataDir: tmpDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();

  // ==========================================
  // DESKTOP: 1440x900
  // ==========================================
  await page.setViewport({ width: 1440, height: 900 });
  console.log('[Capture Step 2] Navigating to http://127.0.0.1:5173/...');
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0', timeout: 30000 });

  // Wait for loading overlay to be hidden
  await page.waitForFunction(() => {
    const el = document.getElementById('loading-overlay');
    return el && el.classList.contains('hidden');
  }, { timeout: 20000 });

  console.log('[Capture Step 2] App loaded. Waiting 1000ms for Walk render...');
  await new Promise(r => setTimeout(r, 1200));

  // 1. Walk Mode Overview (Desktop default)
  const walkDesktop = 'step2_walk_desktop.png';
  await page.screenshot({ path: walkDesktop });
  console.log(`[Capture Step 2] Saved ${walkDesktop}`);

  // 2. Search Date to verify terracotta marker on walk
  console.log('[Capture Step 2] Triggering date search to check terracotta marker on walk...');
  const searchBtn = await page.$('#dob-search-btn');
  if (searchBtn) {
    await searchBtn.click();
    // Wait briefly for worker search to complete and set highlight before camera flies away,
    // or capture at start of flight
    await new Promise(r => setTimeout(r, 400));
  }
  const walkSearchHit = 'step2_walk_search_hit.png';
  await page.screenshot({ path: walkSearchHit });
  console.log(`[Capture Step 2] Saved ${walkSearchHit}`);

  // Let camera flight finish
  await new Promise(r => setTimeout(r, 3200));

  // 3. Switch to Tiles Mode via readout bar toggle
  console.log('[Capture Step 2] Clicking "Tiles" mode button in readout bar...');
  const tilesBtn = await page.$('#btn-mode-tiles');
  if (tilesBtn) {
    await tilesBtn.click();
    await new Promise(r => setTimeout(r, 1000));
    const tilesDesktop = 'step2_tiles_desktop.png';
    await page.screenshot({ path: tilesDesktop });
    console.log(`[Capture Step 2] Saved ${tilesDesktop}`);
  }

  // ==========================================
  // MOBILE: 390x844
  // ==========================================
  await page.setViewport({ width: 390, height: 844 });
  await page.evaluate(() => {
    window.dispatchEvent(new Event('resize'));
  });
  await new Promise(r => setTimeout(r, 800));

  // Mobile Tiles mode
  const tilesMobile = 'step2_tiles_mobile.png';
  await page.screenshot({ path: tilesMobile });
  console.log(`[Capture Step 2] Saved ${tilesMobile}`);

  // Switch back to Walk Mode on mobile
  const walkBtn = await page.$('#btn-mode-walk');
  if (walkBtn) {
    await walkBtn.click();
    await new Promise(r => setTimeout(r, 800));
    const walkMobile = 'step2_walk_mobile.png';
    await page.screenshot({ path: walkMobile });
    console.log(`[Capture Step 2] Saved ${walkMobile}`);
  }

  await browser.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

capture().catch(err => {
  console.error('[Capture Step 2 Error]', err);
  process.exit(1);
});
