import puppeteer from 'puppeteer-core';
import path from 'node:path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function run() {
  console.log('[Verifier] Launching browser to verify zoom levels and go-to...');
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  page.on('console', msg => console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`));
  page.on('pageerror', err => console.error(`[Browser Page Error] ${err.toString()}`));

  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0', timeout: 30000 });

  // Wait for loading to complete and canvas ready
  await new Promise(r => setTimeout(r, 2000));

  // 1. Overview screenshot
  console.log('[Verifier] Taking Level 1 Overview screenshot...');
  await page.screenshot({ path: 'phase2_level1_overview.png' });

  // 2. Zoom to Region (Level 2)
  console.log('[Verifier] Zooming to Level 2 Region...');
  await page.evaluate(() => {
    const atlas = window.__PI_ATLAS__;
    if (atlas) {
      atlas.camera.set(2500, 1000, 0.6);
      atlas.visualizer.requestRender();
    }
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: 'phase2_level2_region.png' });

  // 3. Test "Go to position" -> fly to digit 3,141,592 (Level 3 Reading)
  console.log('[Verifier] Testing Go-To position 3,141,592...');
  const gotoInput = await page.$('#goto-input');
  if (gotoInput) {
    await gotoInput.type('3141592');
    await gotoInput.press('Enter');
  }

  // Wait for fly-to animation to finish (approx 1.8s)
  await new Promise(r => setTimeout(r, 2400));
  console.log('[Verifier] Taking Level 3 Reading & Highlight screenshot...');
  await page.screenshot({ path: 'phase2_level3_reading.png' });

  await browser.close();
  console.log('[Verifier] All phase 2 & 3 checks complete.');
}

run().catch(err => {
  console.error('[Verifier Failed]', err);
  process.exit(1);
});
