import puppeteer from 'puppeteer-core';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function run() {
  console.log('[UI Test] Launching Chrome...');
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 850 });

  page.on('console', msg => console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`));
  page.on('pageerror', err => console.error(`[Browser Page Error] ${err.toString()}`));

  console.log('[UI Test] Navigating to http://127.0.0.1:5173/...');
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0', timeout: 30000 });

  // Wait for loading overlay to be hidden and date search button to appear
  console.log('[UI Test] Waiting for app to initialize and search button to appear...');
  await page.waitForSelector('#dob-search-btn', { timeout: 15000 });
  await new Promise(r => setTimeout(r, 800));

  console.log('[UI Test] Capturing improved overview screenshot...');
  await page.screenshot({ path: 'improved_overview.png' });

  // Click the search button on the Date panel
  console.log('[UI Test] Clicking Search Date button to trigger smooth zoom...');
  const searchBtn = await page.$('#dob-search-btn');
  if (searchBtn) {
    await searchBtn.click();
    // Wait for worker search + smooth camera flight (approx 3s)
    await new Promise(r => setTimeout(r, 3800));

    console.log('[UI Test] Capturing zoomed-in reading view with ORANGE date & GREY rest digits...');
    await page.screenshot({ path: 'improved_date_zoomed_orange.png' });
  }

  await browser.close();
  console.log('[UI Test] All improved screenshots captured successfully!');
}

run().catch(err => {
  console.error('[UI Test Error]', err);
  process.exit(1);
});
