import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const targetUrl = process.argv[2] || 'http://127.0.0.1:5173/';
const screenshotPath = process.argv[3] || 'phase1_screenshot.png';

async function run() {
  console.log(`[Verifier] Launching Chrome from ${chromePath}...`);
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  page.on('console', msg => console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`));
  page.on('pageerror', err => console.error(`[Browser Page Error] ${err.toString()}`));

  console.log(`[Verifier] Navigating to ${targetUrl}...`);
  await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: 30000 });

  // Wait for loading to finish or verify
  await page.waitForTimeout ? page.waitForTimeout(2000) : new Promise(r => setTimeout(r, 2500));

  console.log(`[Verifier] Taking screenshot to ${screenshotPath}...`);
  await page.screenshot({ path: screenshotPath });

  await browser.close();
  console.log('[Verifier] Done.');
}

run().catch(err => {
  console.error('[Verifier Error]', err);
  process.exit(1);
});
