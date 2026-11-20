import puppeteer from 'puppeteer-core';
import path from 'path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:/Users/Suraj/.gemini/antigravity/brain/c24a6b2c-de6d-4ea6-8150-f0676e8020ef';

async function run() {
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0' });

  await page.waitForFunction(() => {
    const el = document.getElementById('loading-overlay');
    return el && el.classList.contains('hidden');
  });

  // Switch to name tab
  await page.evaluate(() => {
    const tabBtns = Array.from(document.querySelectorAll('.tab-btn'));
    const nameTab = tabBtns.find(b => b.textContent.includes('Name'));
    if (nameTab) nameTab.click();
  });
  await new Promise(r => setTimeout(r, 400));

  // Enter very long name to trigger pieces fallback
  await page.evaluate(() => {
    const input = document.querySelector('#name-input-large');
    input.value = 'ALEXANDERTHEGREAT';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 400));

  await page.click('#name-locate-btn');

  // Wait for Reveal Window to appear with pieces stack
  await page.waitForFunction(() => {
    const stack = document.querySelector('.reveal-pieces-stack');
    return stack !== null;
  }, { timeout: 10000 });

  await new Promise(r => setTimeout(r, 1000));
  const piecesPath = path.join(ARTIFACT_DIR, 'name_pieces_fallback_redesign.png');
  await page.screenshot({ path: piecesPath });
  console.log('Saved:', piecesPath);

  await browser.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
