import puppeteer from 'puppeteer-core';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function run() {
  console.log('[Redesign Verifier] Launching Chrome...');
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // ==========================================
  // DESKTOP SUITE (1440x900)
  // ==========================================
  await page.setViewport({ width: 1440, height: 900 });

  console.log('[Redesign Verifier] Loading http://127.0.0.1:5173/...');
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForSelector('#dob-search-btn', { timeout: 15000 });
  await new Promise(r => setTimeout(r, 800));

  // --- STATE 1 & 2: First Load ---
  console.log('[Redesign Verifier] Capturing State 2: First Load (Idle Overview)...');
  await page.screenshot({ path: 'state_first_load.png' });

  // --- STATE 3 & 4: Date Search (14/05/1998) ---
  console.log('[Redesign Verifier] Triggering Date Search (14/05/1998)...');
  const dobBtn = await page.$('#dob-search-btn');
  if (dobBtn) {
    await dobBtn.click();
    await new Promise(r => setTimeout(r, 3200));
    console.log('[Redesign Verifier] Capturing State 3: Date Hit (with 55% dimmed context & steppers)...');
    await page.screenshot({ path: 'state_date_hit.png' });
  }

  // --- STATE 6: Name Path (SURAJ) ---
  console.log('[Redesign Verifier] Switching to Name Tab...');
  const nameTab = await page.$('#tab-name');
  if (nameTab) {
    await nameTab.click();
    await new Promise(r => setTimeout(r, 600));

    const nameBtn = await page.$('#name-search-btn');
    if (nameBtn) {
      await nameBtn.click();
      await new Promise(r => setTimeout(r, 3200));
      console.log('[Redesign Verifier] Capturing State 6: Name Consecutive & Chromatic Walk...');
      await page.screenshot({ path: 'state_name_consecutive_path.png' });
    }
  }

  // --- STATE 8 & 11: Image Prepare & Tone Mode Reveal ---
  console.log('[Redesign Verifier] Switching to Image Tab...');
  const imageTab = await page.$('#tab-image');
  if (imageTab) {
    await imageTab.click();
    await new Promise(r => setTimeout(r, 600));

    // Load sample Greek letter Pi
    const sampleBtn = await page.$('#load-sample-pi-btn');
    if (sampleBtn) {
      await sampleBtn.click();
      await new Promise(r => setTimeout(r, 600));

      console.log('[Redesign Verifier] Capturing State 8: Image Prepared (8x8, 2 tones)...');
      await page.screenshot({ path: 'state_image_prepare.png' });

      // Run closest search
      const startSearchBtn = await page.$('#btn-start-search');
      if (startSearchBtn) {
        await startSearchBtn.click();
        // Wait for worker search + smooth reveal
        await new Promise(r => setTimeout(r, 4500));
        console.log('[Redesign Verifier] Capturing State 11: Image Tone Mode Reveal...');
        await page.screenshot({ path: 'state_image_tone_reveal.png' });
      }
    }
  }

  // --- STATE: About Sheet ---
  console.log('[Redesign Verifier] Opening About Sheet...');
  const aboutBtn = await page.$('#btn-open-about');
  if (aboutBtn) {
    await aboutBtn.click();
    await new Promise(r => setTimeout(r, 500));
    console.log('[Redesign Verifier] Capturing About Sheet...');
    await page.screenshot({ path: 'state_about_sheet.png' });

    // Press Escape to close
    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 400));
  }

  // ==========================================
  // MOBILE SUITE (390x844)
  // ==========================================
  console.log('[Redesign Verifier] Testing Mobile Viewport (390x844)...');
  await page.setViewport({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForSelector('#dob-search-btn', { timeout: 15000 });
  await new Promise(r => setTimeout(r, 800));

  // --- Mobile Collapsed Handle ---
  await page.evaluate(() => {
    const wrapper = document.getElementById('input-panel-wrapper');
    if (wrapper) wrapper.classList.add('collapsed');
  });
  await new Promise(r => setTimeout(r, 500));
  console.log('[Redesign Verifier] Capturing State 13: Mobile Bottom Sheet Collapsed (56px)...');
  await page.screenshot({ path: 'state_mobile_collapsed.png' });

  // --- Mobile Expanded Handle ---
  await page.evaluate(() => {
    const wrapper = document.getElementById('input-panel-wrapper');
    if (wrapper) wrapper.classList.remove('collapsed');
  });
  await new Promise(r => setTimeout(r, 500));
  console.log('[Redesign Verifier] Capturing State 14: Mobile Bottom Sheet Expanded...');
  await page.screenshot({ path: 'state_mobile_expanded.png' });

  await browser.close();
  console.log('[Redesign Verifier] All state screenshots captured successfully!');
}

run().catch(err => {
  console.error('[Redesign Verifier Error]', err);
  process.exit(1);
});
