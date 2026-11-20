import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';

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
    await page.setViewport({ width: 1366, height: 850 });

    console.log('--- Test 1: Image Tab Detail Options ---');
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0' });

    // Switch to Image tab
    await page.click('#tab-image');
    await new Promise(r => setTimeout(r, 400));

    // Click π symbol sample chip
    await page.click('#chip-img-pi');
    await new Promise(r => setTimeout(r, 1200));

  // Click Adjust link to show detail options
  await page.click('#img-adjust-toggle');
  await new Promise(r => setTimeout(r, 400));

  // Click "Ultra 192" detail button
  const ultraBtn = await page.$('.detail-btn[data-sz="192"]');
  if (ultraBtn) await ultraBtn.click();
  await new Promise(r => setTimeout(r, 1500));

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'feature_image_high_detail.png') });
  console.log('Saved feature_image_high_detail.png');

  console.log('--- Test 2: Curiosity does not get obstructed by image ---');
  // Open Curiosities modal
  await page.click('#btn-open-curiosities');
  await new Promise(r => setTimeout(r, 600));

  // Click Feynman Point (999999) curiosity card
  const feynmanCard = await page.$('.curiosity-item-card[data-curiosity-id="feynman"]');
  if (feynmanCard) {
    await feynmanCard.click();
  } else {
    // fallback close
    await page.click('#btn-close-curiosities');
  }
  await new Promise(r => setTimeout(r, 2200)); // wait for flight to Feynman point (pos 761)

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'feature_curiosity_unobstructed.png') });
  console.log('Saved feature_curiosity_unobstructed.png');

  console.log('--- Test 3: π Challenge Game ---');
  // Open π Game
  await page.evaluate(() => {
    const btn = document.getElementById('btn-open-game');
    if (btn) btn.click();
  });
  await page.waitForSelector('#pi-game-modal', { visible: true });
  await new Promise(r => setTimeout(r, 800));

  // Submit digits 1, 4, 1, 5, 9, 2
  const keys = ['1', '4', '1', '5', '9', '2'];
  for (const k of keys) {
    await page.evaluate((digit) => {
      const btn = document.querySelector(`.pi-key-btn[data-key="${digit}"]`);
      if (btn) btn.click();
    }, k);
    await new Promise(r => setTimeout(r, 200));
  }

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'feature_pi_game_playing.png') });
  console.log('Saved feature_pi_game_playing.png');

  // Submit a wrong digit (8 instead of 6) to trigger rank card
  await page.evaluate(() => {
    const wrongBtn = document.querySelector('.pi-key-btn[data-key="8"]');
    if (wrongBtn) wrongBtn.click();
  });
  await new Promise(r => setTimeout(r, 600));

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'feature_pi_game_results.png') });
  console.log('Saved feature_pi_game_results.png');
  console.log('All feature tests completed successfully!');
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
