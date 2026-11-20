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

    console.log('--- Navigating to Pi Atlas ---');
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0' });

    // Wait for digits to finish loading
    await page.waitForFunction(() => {
      const btn = document.querySelector('#dob-search-btn');
      return btn && !btn.hasAttribute('disabled');
    }, { timeout: 15000 });

    console.log('--- Clicking Compare with another date ---');
    await page.click('#btn-toggle-compare');
    await new Promise(r => setTimeout(r, 200));

    console.log('--- Typing Date 1 ---');
    await page.type('#dob-day', '14');
    await page.type('#dob-month', '05');
    await page.type('#dob-year', '1998');

    console.log('--- Typing Date 2 ---');
    await page.type('#dob-day-2', '03');
    await page.type('#dob-month-2', '11');
    await page.type('#dob-year-2', '1971');

    console.log('--- Waiting 1.5s after typing 2nd date ---');
    await new Promise(r => setTimeout(r, 1500));

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'diagnose_compare_result.png') });
    console.log('Saved diagnose_compare_result.png');

    // Inspect modal state
    const modalState = await page.evaluate(() => {
      const overlay = document.querySelector('.reveal-overlay');
      const container = document.querySelector('.reveal-modal-container');
      const glass = document.querySelector('.reveal-glass-card');
      const duelStack = document.querySelector('.reveal-duel-stack');
      const panelWrapper = document.querySelector('#input-panel-wrapper');

      return {
        overlay: overlay ? { display: overlay.style.display, opacity: overlay.style.opacity, computedOpacity: window.getComputedStyle(overlay).opacity } : null,
        container: container ? { display: container.style.display, visibility: container.style.visibility, rect: container.getBoundingClientRect() } : null,
        glass: glass ? { display: glass.style.display, opacity: glass.style.opacity, computedOpacity: window.getComputedStyle(glass).opacity, rect: glass.getBoundingClientRect() } : null,
        duelStack: duelStack ? { display: duelStack.style.display, children: duelStack.children.length } : null,
        panelWrapper: panelWrapper ? { className: panelWrapper.className, rect: panelWrapper.getBoundingClientRect() } : null
      };
    });

    console.log('Modal State:', JSON.stringify(modalState, null, 2));

  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
