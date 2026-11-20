import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import os from 'os';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function capture() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'step1_verify_'));
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    userDataDir: tmpDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();

  // Desktop view (1440x900)
  await page.setViewport({ width: 1440, height: 900 });
  console.log('[Capture] Navigating to http://127.0.0.1:5173/...');
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0', timeout: 30000 });

  // Wait for loading overlay to be hidden
  await page.waitForFunction(() => {
    const el = document.getElementById('loading-overlay');
    return el && el.classList.contains('hidden');
  }, { timeout: 15000 });

  console.log('[Capture] App loaded, waiting 800ms for stable render...');
  await new Promise(r => setTimeout(r, 800));

  const desktopScreenshot = 'step1_desktop_fixed.png';
  await page.screenshot({ path: desktopScreenshot });
  console.log(`[Capture] Saved ${desktopScreenshot}`);

  // Mobile view (390x844)
  await page.setViewport({ width: 390, height: 844 });
  // Trigger window resize event in page so camera re-fits
  await page.evaluate(() => {
    window.dispatchEvent(new Event('resize'));
  });
  await new Promise(r => setTimeout(r, 800));

  const mobileScreenshot = 'step1_mobile_fixed.png';
  await page.screenshot({ path: mobileScreenshot });
  console.log(`[Capture] Saved ${mobileScreenshot}`);

  await browser.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

capture().catch(err => {
  console.error('[Capture Error]', err);
  process.exit(1);
});
