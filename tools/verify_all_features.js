import puppeteer from 'puppeteer-core';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function run() {
  console.log('[E2E Verifier] Launching headless Chrome...');
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  page.on('console', msg => console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`));
  page.on('pageerror', err => console.error(`[Browser Page Error] ${err.toString()}`));

  console.log('[E2E Verifier] Navigating to http://127.0.0.1:5173/...');
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  // --- 1. DATE OF BIRTH SEARCH (Phase 4) ---
  console.log('[E2E Verifier] Testing Date of Birth search (14/05/1998)...');
  const dobBtn = await page.$('#dob-search-btn');
  if (dobBtn) {
    await dobBtn.click();
    // Wait for search worker and fly-to animation (approx 2.5s)
    await new Promise(r => setTimeout(r, 3000));
    console.log('[E2E Verifier] Capturing Phase 4 Date search screenshot...');
    await page.screenshot({ path: 'phase4_date_search.png' });
  }

  // --- 2. NAME SEARCH & PATH VISUALIZATION (Phase 5) ---
  console.log('[E2E Verifier] Switching to Name tab and testing SURAJ...');
  const nameTab = await page.$('#tab-name');
  if (nameTab) {
    await nameTab.click();
    await new Promise(r => setTimeout(r, 500));
    const nameBtn = await page.$('#name-search-btn');
    if (nameBtn) {
      await nameBtn.click();
      await new Promise(r => setTimeout(r, 3000));
      console.log('[E2E Verifier] Capturing Phase 5 Name path screenshot...');
      await page.screenshot({ path: 'phase5_name_path.png' });
    }
  }

  // --- 3. IMAGE SEARCH (Phase 6) ---
  console.log('[E2E Verifier] Switching to Image tab...');
  const imageTab = await page.$('#tab-image');
  if (imageTab) {
    await imageTab.click();
    await new Promise(r => setTimeout(r, 500));

    // Load sample image
    const sampleBtn = await page.$('#load-sample-btn');
    if (sampleBtn) {
      await sampleBtn.click();
      await new Promise(r => setTimeout(r, 600));

      // Test closest resemblance
      const closestBtn = await page.$('#btn-closest-search');
      if (closestBtn) {
        console.log('[E2E Verifier] Running Closest Resemblance search...');
        await closestBtn.click();
        // Wait for worker sliding window scan (1M digits takes ~1-2s)
        await new Promise(r => setTimeout(r, 3500));
        console.log('[E2E Verifier] Capturing Phase 6 Image resemblance screenshot...');
        await page.screenshot({ path: 'phase6_image_search.png' });
      }

      // Expand mosaic section
      console.log('[E2E Verifier] Expanding mosaic section...');
      await page.evaluate(() => {
        const details = document.querySelector('details');
        if (details) details.open = true;
      });
      await new Promise(r => setTimeout(r, 600));
      await page.screenshot({ path: 'phase6_mosaic.png' });
    }
  }

  await browser.close();
  console.log('[E2E Verifier] All tests and screenshots completed successfully!');
}

run().catch(err => {
  console.error('[E2E Error]', err);
  process.exit(1);
});
