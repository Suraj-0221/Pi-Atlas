import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/Suraj/.gemini/antigravity/brain/c24a6b2c-de6d-4ea6-8150-f0676e8020ef';

async function run() {
  console.log('Starting Vite server programmatically...');
  const server = await createServer({
    server: { port: 5173 }
  });
  await server.listen();
  console.log('Vite server running on port 5173');

  const tempUserDataDir = path.join(ARTIFACT_DIR, 'scratch', `chrome_mobile_${Date.now()}`);

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    userDataDir: tempUserDataDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

    console.log('--- Navigating to Pi Atlas on Mobile (390x844) ---');
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });

    await page.waitForFunction(() => {
      const btn = document.querySelector('#dob-search-btn');
      return btn && !btn.hasAttribute('disabled');
    }, { timeout: 15000 });

    // 1. Mobile Date Tab (initial)
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'mobile_01_date_initial.png') });
    console.log('Saved mobile_01_date_initial.png');

    // 2. Open Compare on mobile
    await page.click('#btn-toggle-compare');
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'mobile_02_date_compare.png') });
    console.log('Saved mobile_02_date_compare.png');

    // 3. Switch to Name tab
    await page.click('#tab-name');
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'mobile_03_name_tab.png') });
    console.log('Saved mobile_03_name_tab.png');

    // 4. Switch to Image tab
    await page.click('#tab-image');
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'mobile_04_image_choose.png') });
    console.log('Saved mobile_04_image_choose.png');

    // Expand Image info box
    await page.click('#img-info-toggle');
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'mobile_05_image_info_expanded.png') });
    console.log('Saved mobile_05_image_info_expanded.png');

    // 5. Open Curiosities
    await page.click('#btn-open-curiosities');
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'mobile_06_curiosities_modal.png') });
    console.log('Saved mobile_06_curiosities_modal.png');
    await page.click('#btn-close-curiosities');
    await new Promise(r => setTimeout(r, 300));

    // 6. Open Pi Game
    await page.click('#btn-open-game');
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'mobile_07_pi_game.png') });
    console.log('Saved mobile_07_pi_game.png');

    console.log('All mobile screenshots captured successfully!');
  } finally {
    await browser.close();
    await server.close();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
