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

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  console.log('--- Test 1: Compare with another date ---');
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0' });

  // Wait for digits to finish loading
  await page.waitForFunction(() => {
    const btn = document.querySelector('#dob-search-btn');
    return btn && !btn.hasAttribute('disabled');
  }, { timeout: 15000 });

  // Click "Compare with another date"
  await page.click('#btn-toggle-compare');
  await new Promise(r => setTimeout(r, 200));

  // Enter Date 1: 14 / 05 / 1998
  await page.type('#dob-day', '14');
  await page.type('#dob-month', '05');
  await page.type('#dob-year', '1998');

  // Enter Date 2: 03 / 11 / 1971
  await page.type('#dob-day-2', '03');
  await page.type('#dob-month-2', '11');
  await page.type('#dob-year-2', '1971');

  // Wait for duel modal to show
  await page.waitForSelector('.reveal-modal-container', { visible: true, timeout: 5000 });
  await page.waitForSelector('.reveal-duel-stack', { visible: true, timeout: 5000 });
  await new Promise(r => setTimeout(r, 800));

  const verdictText = await page.$eval('.reveal-headline', el => el.textContent);
  console.log('Duel Verdict:', verdictText);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'task4_compare_duel_reveal.png') });
  console.log('Saved task4_compare_duel_reveal.png');

  // Dismiss modal
  await page.evaluate(() => {
    const el = document.querySelector('.reveal-card-corner-close');
    if (el) el.click();
    else if (window.__PI_ATLAS__) window.__PI_ATLAS__.revealWindow.dismiss();
  });
  await new Promise(r => setTimeout(r, 400));

  console.log('--- Test 2: ?vs=14051998 challenge URL ---');
  await page.goto('http://127.0.0.1:5173/?vs=14051998', { waitUntil: 'networkidle0' });

  // Wait for digits to load and headline to be computed
  await page.waitForFunction(() => {
    const hl = document.querySelector('#dob-headline');
    return hl && hl.textContent.includes("A friend's birthday is at digit");
  }, { timeout: 15000 });

  const vsHeadline = await page.$eval('#dob-headline', el => el.textContent);
  console.log('VS Headline on load:', vsHeadline);

  // Take screenshot of challenge landing headline
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'task4_vs_challenge_landing.png') });
  console.log('Saved task4_vs_challenge_landing.png');

  // Complete visitor's date: 03 / 11 / 1971
  await page.type('#dob-day', '03');
  await page.type('#dob-month', '11');
  await page.type('#dob-year', '1971');

  // Wait for duel modal to auto-trigger
  await page.waitForSelector('.reveal-modal-container', { visible: true, timeout: 5000 });
  await page.waitForSelector('.reveal-duel-stack', { visible: true, timeout: 5000 });
  await new Promise(r => setTimeout(r, 800));

  const autoDuelVerdict = await page.$eval('.reveal-headline', el => el.textContent);
  console.log('Auto-Duel Verdict:', autoDuelVerdict);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'task4_vs_challenge_duel_reveal.png') });
  console.log('Saved task4_vs_challenge_duel_reveal.png');

  // Dismiss and check single search "Challenge a friend" button
  await page.evaluate(() => {
    const el = document.querySelector('.reveal-card-corner-close');
    if (el) el.click();
    else if (window.__PI_ATLAS__) window.__PI_ATLAS__.revealWindow.dismiss();
  });
  await new Promise(r => setTimeout(r, 400));

  console.log('--- Test 3: Single search "Challenge a friend" ---');
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => {
    const btn = document.querySelector('#dob-search-btn');
    return btn && !btn.hasAttribute('disabled');
  }, { timeout: 15000 });

  await page.type('#dob-day', '14');
  await page.type('#dob-month', '05');
  await page.type('#dob-year', '1998');

  await page.waitForSelector('#reveal-btn-challenge', { visible: true, timeout: 5000 });
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'task4_single_search_challenge_btn.png') });
  console.log('Saved task4_single_search_challenge_btn.png');

  await browser.close();
  console.log('All Task 4 tests passed successfully!');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
