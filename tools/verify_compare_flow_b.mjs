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

    page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
    page.on('pageerror', err => console.error('PAGE ERROR:', err));

    console.log('--- Flow B: Search Date 1 -> Reveal -> Click "Compare with another date" chip ---');
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0' });

    await page.waitForFunction(() => {
      const btn = document.querySelector('#dob-search-btn');
      return btn && !btn.hasAttribute('disabled');
    }, { timeout: 15000 });

    // Type Date 1: 14 / 05 / 1998
    await page.type('#dob-day', '14');
    await page.type('#dob-month', '05');
    await page.type('#dob-year', '1998');

    // Wait for reveal modal to appear
    await page.waitForSelector('.reveal-results-block', { visible: true, timeout: 5000 });
    await new Promise(r => setTimeout(r, 800));

    // Click "Compare with another date" chip inside reveal window
    console.log('Clicking #reveal-chip-compare-date in reveal window...');
    await page.evaluate(() => {
      const chip = document.getElementById('reveal-chip-compare-date');
      if (chip) chip.click();
    });
    await new Promise(r => setTimeout(r, 600));

    // Now type Date 2: 03 / 11 / 1971
    console.log('Typing Date 2 into secondary input...');
    await page.type('#dob-day-2', '03');
    await page.type('#dob-month-2', '11');
    await page.type('#dob-year-2', '1971');

    // Wait for duel modal
    await page.waitForSelector('.reveal-duel-stack', { visible: true, timeout: 5000 });
    await new Promise(r => setTimeout(r, 600));

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'flow_b_compare_from_chip.png') });
    console.log('Saved flow_b_compare_from_chip.png');

    console.log('All Flow B tests passed successfully!');
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
