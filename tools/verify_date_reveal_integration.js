import puppeteer from 'puppeteer-core';
import path from 'path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:/Users/Suraj/.gemini/antigravity/brain/c24a6b2c-de6d-4ea6-8150-f0676e8020ef';

async function run() {
  console.log('[Verify] Launching Chrome via puppeteer-core...');
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  page.on('console', msg => {
    console.log(`[Browser Console ${msg.type()}]:`, msg.text());
  });

  console.log('[Verify] Navigating to http://127.0.0.1:5173/ ...');
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0' });

  // Wait for loading overlay to vanish
  await page.waitForFunction(() => {
    const el = document.getElementById('loading-overlay');
    return el && el.classList.contains('hidden');
  }, { timeout: 20000 });

  console.log('[Verify] App loaded. Verifying Date input fields...');
  const dayVal = await page.$eval('#dob-day', el => el.value);
  const monthVal = await page.$eval('#dob-month', el => el.value);
  const yearVal = await page.$eval('#dob-year', el => el.value);
  console.log(`[Verify] Form inputs: ${dayVal}/${monthVal}/${yearVal}`);

  // Trigger search
  console.log('[Verify] Submitting Date search...');
  await page.click('#dob-search-btn');

  // Wait 700ms to capture mid-slide
  await new Promise(r => setTimeout(r, 700));
  const slidingPath = path.join(ARTIFACT_DIR, 'live_date_reveal_sliding.png');
  await page.screenshot({ path: slidingPath });
  console.log('[Verify] Saved mid-slide screenshot:', slidingPath);

  // Wait until reveal finishes and result block is visible (~2800ms)
  await page.waitForFunction(() => {
    const resBlock = document.querySelector('.reveal-results-block');
    return resBlock && window.getComputedStyle(resBlock).visibility === 'visible' && parseFloat(window.getComputedStyle(resBlock).opacity) > 0.8;
  }, { timeout: 12000 });

  const headlineText = await page.$eval('.reveal-headline', el => el.textContent);
  const metaText = await page.$eval('.reveal-meta-line', el => el.textContent);
  const counterVal = await page.$eval('.reveal-counter-number', el => el.textContent);
  console.log('[Verify] Headline:', headlineText);
  console.log('[Verify] Meta:', metaText);
  console.log('[Verify] Counter:', counterVal);

  const settledPath = path.join(ARTIFACT_DIR, 'live_date_reveal_settled.png');
  await page.screenshot({ path: settledPath });
  console.log('[Verify] Saved settled screenshot:', settledPath);

  // Now click "Show in the field" button
  console.log('[Verify] Clicking "Show in the field"...');
  await page.click('.reveal-btn-fly');

  // Wait for camera flight to complete (~2500ms)
  await new Promise(r => setTimeout(r, 3200));

  const readoutText = await page.$eval('#readout-bar', el => el.textContent);
  console.log('[Verify] Readout bar after fly-to:', readoutText);

  const fieldLandedPath = path.join(ARTIFACT_DIR, 'live_date_field_landed.png');
  await page.screenshot({ path: fieldLandedPath });
  console.log('[Verify] Saved field landed screenshot:', fieldLandedPath);

  await browser.close();
  console.log('[Verify] Verification completed successfully.');
}

run().catch(err => {
  console.error('[Verify Failed]', err);
  process.exit(1);
});
