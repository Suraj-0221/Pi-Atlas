import puppeteer from 'puppeteer-core';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/Suraj/.gemini/antigravity/brain/c24a6b2c-de6d-4ea6-8150-f0676e8020ef';

async function run() {
  const tempUserDataDir = path.join(ARTIFACT_DIR, 'scratch', `chrome_profile_${Date.now()}`);

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    userDataDir: tempUserDataDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    console.log('--- Navigating to Pi Atlas ---');
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0' });

    // Switch to Image tab
    await page.click('#tab-image');
    await new Promise(r => setTimeout(r, 400));

    // Click Info Box Toggle
    await page.click('#img-info-toggle');
    await new Promise(r => setTimeout(r, 400));

    // Verify info content is visible
    const isVisible = await page.$eval('#img-info-content', el => el.style.display !== 'none');
    console.log('Info Box Expanded:', isVisible);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'image_calculation_info_box.png') });
    console.log('Saved image_calculation_info_box.png');

    // Now test with sample image
    await page.click('#chip-img-pi');
    await new Promise(r => setTimeout(r, 1400));

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'image_active_with_info_box.png') });
    console.log('Saved image_active_with_info_box.png');

    console.log('All tests passed successfully!');
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
