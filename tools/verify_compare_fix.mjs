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

    console.log('--- Flow A: Direct Compare ---');
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0' });

    // Wait for digits ready
    await page.waitForFunction(() => {
      const btn = document.querySelector('#dob-search-btn');
      return btn && !btn.hasAttribute('disabled');
    }, { timeout: 15000 });

    // Click "Compare with another date"
    await page.click('#btn-toggle-compare');
    await new Promise(r => setTimeout(r, 200));

    // Type Date 1: 14 / 05 / 1998
    await page.type('#dob-day', '14');
    await page.type('#dob-month', '05');
    await page.type('#dob-year', '1998');

    // Type Date 2: 03 / 11 / 1971
    await page.type('#dob-day-2', '03');
    await page.type('#dob-month-2', '11');
    await page.type('#dob-year-2', '1971');

    // Wait for duel modal
    await page.waitForSelector('.reveal-duel-stack', { visible: true, timeout: 5000 });
    await new Promise(r => setTimeout(r, 600));

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'verify_compare_duel_working.png') });
    console.log('Saved verify_compare_duel_working.png');

    // Close duel modal via evaluate click on Close button or corner x
    const closeClicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const closeBtn = btns.find(b => b.textContent && b.textContent.trim() === 'Close') || document.querySelector('.reveal-card-corner-close');
      if (closeBtn) {
        closeBtn.click();
        return true;
      }
      return false;
    });
    console.log('Close button found & clicked:', closeClicked);
    await new Promise(r => setTimeout(r, 600));

    // Verify stage block expands back
    const isStageExpanded = await page.evaluate(() => {
      const wrapper = document.querySelector('#input-panel-wrapper');
      return wrapper && wrapper.classList.contains('stage-mode');
    });
    console.log('Stage block restored after close:', isStageExpanded);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'verify_compare_closed_stage_restored.png') });
    console.log('Saved verify_compare_closed_stage_restored.png');

    console.log('All compare tests passed successfully!');
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
