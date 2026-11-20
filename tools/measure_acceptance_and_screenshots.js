import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:/Users/Suraj/.gemini/antigravity/brain/c24a6b2c-de6d-4ea6-8150-f0676e8020ef';

function parseTraceTopCosts(traceEvents) {
  const durationByName = {};

  let mainThreadTid = null;
  for (const evt of traceEvents) {
    if (evt.name === 'thread_name' && evt.args?.name === 'CrRendererMain') {
      mainThreadTid = evt.tid;
      break;
    }
  }

  for (const evt of traceEvents) {
    if (mainThreadTid && evt.tid !== mainThreadTid) continue;
    if (evt.ph === 'X') {
      const dur = (evt.dur || 0) / 1000;
      durationByName[evt.name] = (durationByName[evt.name] || 0) + dur;
    }
  }

  const meaningful = [
    'FunctionCall', 'EvaluateScript', 'v8.callFunction', 'v8.run',
    'Layout', 'Paint', 'UpdateLayoutTree', 'HitTest', 'Commit',
    'CompositeLayers', 'MajorGC', 'MinorGC', 'FireAnimationFrame',
    'TimerFire', 'EventDispatch', 'RasterTask'
  ];

  return Object.entries(durationByName)
    .filter(([name]) => meaningful.includes(name))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
}

function computeFrameStats(traceEvents) {
  // Find BeginFrame or DrawFrame intervals
  const frameTimestamps = [];
  for (const evt of traceEvents) {
    if (evt.name === 'BeginFrame' || evt.name === 'DrawFrame') {
      frameTimestamps.push(evt.ts / 1000); // ms
    }
  }
  const frameDurations = [];
  for (let i = 1; i < frameTimestamps.length; i++) {
    const diff = frameTimestamps[i] - frameTimestamps[i - 1];
    if (diff > 4 && diff < 100) {
      frameDurations.push(diff);
    }
  }
  const avg = frameDurations.length > 0 ? (frameDurations.reduce((a, b) => a + b, 0) / frameDurations.length) : 16.6;
  const max = frameDurations.length > 0 ? Math.max(...frameDurations) : 16.6;
  return { avg: avg.toFixed(2), max: max.toFixed(2), count: frameDurations.length };
}

async function run() {
  console.log('[Acceptance] Launching Chrome...');
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-background-timer-throttling'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  console.log('[Acceptance] Navigating to http://127.0.0.1:5173/ ...');
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0' });

  await page.waitForFunction(() => {
    const el = document.getElementById('loading-overlay');
    return el && el.classList.contains('hidden');
  }, { timeout: 25000 });

  const client = await page.target().createCDPSession();
  console.log('[Acceptance] Applying 4x CPU Throttling...');
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  const postResults = {};

  // ========================================================
  // 1. DATE FLY-TO (van Wijk & Nuij <= 1.2s)
  // ========================================================
  console.log('\n[Acceptance] --- 1. Testing Date Fly-To ---');
  await page.click('#dob-search-btn');
  await page.waitForFunction(() => {
    const btn = document.querySelector('.reveal-btn-fly');
    return btn && window.getComputedStyle(btn).display !== 'none';
  }, { timeout: 10000 });

  const dateTracePath = path.join(ARTIFACT_DIR, 'post_trace_date.json');
  console.log('[Acceptance] Starting trace for Date Fly-To...');
  await page.tracing.start({
    path: dateTracePath,
    categories: ['devtools.timeline', 'v8', 'blink.user_timing', 'disabled-by-default-devtools.timeline']
  });

  const flightStart = Date.now();
  await page.click('.reveal-btn-fly');

  // Wait for camera flight to complete via animator state
  await page.waitForFunction(() => {
    return window.__PI_ATLAS__ && !window.__PI_ATLAS__.animator.isAnimating();
  }, { timeout: 10000 });
  const flightDuration = (Date.now() - flightStart) / 1000;
  console.log(`[Acceptance] Measured flight duration: ${flightDuration.toFixed(2)}s`);

  await page.tracing.stop();
  console.log('[Acceptance] Stopped Date Fly-To trace.');
  const dateEvents = JSON.parse(fs.readFileSync(dateTracePath, 'utf8')).traceEvents;
  postResults.dateFlyTo = {
    topCosts: parseTraceTopCosts(dateEvents),
    frameStats: computeFrameStats(dateEvents),
    durationSeconds: flightDuration
  };

  // ========================================================
  // 2. NAME REDESIGN & MEASUREMENT
  // ========================================================
  console.log('\n[Acceptance] --- 2. Testing Name Redesign ---');
  await page.evaluate(() => {
    const tabBtns = Array.from(document.querySelectorAll('.tab-btn'));
    const nameTab = tabBtns.find(b => b.textContent.includes('Name'));
    if (nameTab) nameTab.click();
  });
  await new Promise(r => setTimeout(r, 600));

  // Screenshot 1: Name Idle State
  const nameIdlePath = path.join(ARTIFACT_DIR, 'name_redesign_idle.png');
  await page.screenshot({ path: nameIdlePath });
  console.log('[Acceptance] Saved name idle screenshot:', nameIdlePath);

  // Type a custom name e.g. "ANNA"
  await page.evaluate(() => {
    const input = document.querySelector('#name-input-large');
    input.value = 'ANNA';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 400));

  const nameTypedPath = path.join(ARTIFACT_DIR, 'name_redesign_typed_anna.png');
  await page.screenshot({ path: nameTypedPath });
  console.log('[Acceptance] Saved name typed screenshot:', nameTypedPath);

  // Trace name search from Enter to reveal start
  const nameTracePath = path.join(ARTIFACT_DIR, 'post_trace_name.json');
  console.log('[Acceptance] Starting trace for Name Search...');
  await page.tracing.start({
    path: nameTracePath,
    categories: ['devtools.timeline', 'v8', 'blink.user_timing', 'disabled-by-default-devtools.timeline']
  });

  const enterStart = Date.now();
  await page.click('#name-locate-btn');

  // Wait for Reveal Window to appear
  await page.waitForFunction(() => {
    const glass = document.querySelector('.reveal-glass-card');
    return glass && window.getComputedStyle(glass).opacity !== '0';
  }, { timeout: 10000 });
  const enterToRevealMs = Date.now() - enterStart;
  console.log(`[Acceptance] Enter to Reveal Window start: ${enterToRevealMs}ms`);

  // Wait for slide to settle and highlight sweep
  await new Promise(r => setTimeout(r, 2600));
  await page.tracing.stop();
  console.log('[Acceptance] Stopped Name Search trace.');

  const nameSettledPath = path.join(ARTIFACT_DIR, 'name_redesign_reveal_settled.png');
  await page.screenshot({ path: nameSettledPath });
  console.log('[Acceptance] Saved name reveal settled screenshot:', nameSettledPath);

  const nameEvents = JSON.parse(fs.readFileSync(nameTracePath, 'utf8')).traceEvents;
  postResults.nameSearch = {
    topCosts: parseTraceTopCosts(nameEvents),
    enterToRevealMs,
    frameStats: computeFrameStats(nameEvents)
  };

  // Close reveal window
  await page.evaluate(() => {
    const closeBtn = document.querySelector('.reveal-btn-secondary');
    if (closeBtn) closeBtn.click();
  });
  await new Promise(r => setTimeout(r, 400));

  // ========================================================
  // 3. IMAGE REDESIGN & GPU GATHER
  // ========================================================
  console.log('\n[Acceptance] --- 3. Testing Image Redesign & GPU Gather ---');
  await page.evaluate(() => {
    const tabBtns = Array.from(document.querySelectorAll('.tab-btn'));
    const imgTab = tabBtns.find(b => b.textContent.includes('Image'));
    if (imgTab) imgTab.click();
  });
  await new Promise(r => setTimeout(r, 600));

  // Screenshot: Image Stage 1 (Choose)
  const imgStage1Path = path.join(ARTIFACT_DIR, 'image_redesign_stage1_choose.png');
  await page.screenshot({ path: imgStage1Path });
  console.log('[Acceptance] Saved Image Stage 1 screenshot:', imgStage1Path);

  // Click "Try the π symbol"
  await page.click('#img-try-pi-link');
  await new Promise(r => setTimeout(r, 600));

  // Screenshot: Image Stage 2 (Prepare)
  const imgStage2Path = path.join(ARTIFACT_DIR, 'image_redesign_stage2_prepare.png');
  await page.screenshot({ path: imgStage2Path });
  console.log('[Acceptance] Saved Image Stage 2 screenshot:', imgStage2Path);

  // Set size to 64 for snappy gather verification
  await page.evaluate(() => {
    const btn64 = document.querySelector('.size-btn[data-sz="64"]');
    if (btn64) btn64.click();
  });
  await new Promise(r => setTimeout(r, 400));

  // Trace Place in π and GPU gather
  const imgTracePath = path.join(ARTIFACT_DIR, 'post_trace_image.json');
  console.log('[Acceptance] Starting trace for Image GPU Gather...');
  await page.tracing.start({
    path: imgTracePath,
    categories: ['devtools.timeline', 'v8', 'blink.user_timing', 'disabled-by-default-devtools.timeline']
  });

  // Click "Place in π"
  await page.evaluate(() => {
    const btn = document.querySelector('#img-place-in-pi-btn');
    if (btn) btn.click();
  });

  // Wait for gather animation to finish (~2800ms)
  await page.waitForFunction(() => {
    const label = document.querySelector('#img-scrubber-label');
    return label && label.textContent.includes('100%');
  }, { timeout: 25000 });

  await new Promise(r => setTimeout(r, 500));
  await page.tracing.stop();
  console.log('[Acceptance] Stopped Image GPU Gather trace.');

  // Screenshot: Image Stage 3 (Final Settled Image centered in field)
  const imgStage3Path = path.join(ARTIFACT_DIR, 'image_redesign_stage3_settled.png');
  await page.screenshot({ path: imgStage3Path });
  console.log('[Acceptance] Saved Image Stage 3 screenshot:', imgStage3Path);

  const imgEvents = JSON.parse(fs.readFileSync(imgTracePath, 'utf8')).traceEvents;
  postResults.imageGather = {
    topCosts: parseTraceTopCosts(imgEvents),
    frameStats: computeFrameStats(imgEvents)
  };

  // ========================================================
  // 4. MOBILE VIEWPORT VERIFICATION (390x844)
  // ========================================================
  console.log('\n[Acceptance] --- 4. Mobile Viewport (390x844) ---');
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await new Promise(r => setTimeout(r, 500));

  const mobilePath = path.join(ARTIFACT_DIR, 'redesign_mobile_390.png');
  await page.screenshot({ path: mobilePath });
  console.log('[Acceptance] Saved mobile screenshot:', mobilePath);

  await browser.close();

  console.log('\n========================================================');
  console.log('ACCEPTANCE RESULTS (POST-REBUILD, 4x CPU THROTTLING)');
  console.log('========================================================');
  console.log(JSON.stringify(postResults, null, 2));

  const reportPath = path.join(ARTIFACT_DIR, 'acceptance_performance_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(postResults, null, 2), 'utf8');
  console.log('[Acceptance] Saved acceptance report to:', reportPath);
}

run().catch(err => {
  console.error('[Acceptance Failed]', err);
  process.exit(1);
});
