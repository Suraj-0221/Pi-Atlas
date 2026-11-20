import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:/Users/Suraj/.gemini/antigravity/brain/c24a6b2c-de6d-4ea6-8150-f0676e8020ef';

function parseTraceTopCosts(traceEvents) {
  const durationByName = {};

  let mainThreadPid = null;
  let mainThreadTid = null;

  for (const evt of traceEvents) {
    if (evt.name === 'thread_name' && evt.args?.name === 'CrRendererMain') {
      mainThreadPid = evt.pid;
      mainThreadTid = evt.tid;
      break;
    }
  }

  const stack = [];
  for (const evt of traceEvents) {
    if (mainThreadPid && (evt.pid !== mainThreadPid || evt.tid !== mainThreadTid)) {
      continue;
    }

    if (evt.ph === 'X') {
      const dur = (evt.dur || 0) / 1000; // ms
      durationByName[evt.name] = (durationByName[evt.name] || 0) + dur;
    } else if (evt.ph === 'B') {
      stack.push(evt);
    } else if (evt.ph === 'E' && stack.length > 0) {
      const beginEvt = stack.pop();
      const dur = ((evt.ts - beginEvt.ts) || 0) / 1000;
      durationByName[beginEvt.name] = (durationByName[beginEvt.name] || 0) + dur;
    }
  }

  const meaningfulCategories = [
    'FunctionCall', 'EvaluateScript', 'v8.callFunction', 'v8.run',
    'Layout', 'Paint', 'UpdateLayoutTree', 'HitTest', 'Commit',
    'CompositeLayers', 'MajorGC', 'MinorGC', 'FireAnimationFrame',
    'TimerFire', 'EventDispatch', 'RasterTask'
  ];

  const sorted = Object.entries(durationByName)
    .filter(([name]) => meaningfulCategories.includes(name) || name.includes('Draw') || name.includes('Render') || name.includes('Canvas'))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return sorted;
}

async function run() {
  console.log('[Step 0] Launching Chrome for baseline measurements...');
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

  console.log('[Step 0] Navigating to http://127.0.0.1:5173/ ...');
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0' });

  // Wait for loading overlay to vanish
  await page.waitForFunction(() => {
    const el = document.getElementById('loading-overlay');
    return el && el.classList.contains('hidden');
  }, { timeout: 25000 });

  const client = await page.target().createCDPSession();
  console.log('[Step 0] Applying 4x CPU Throttling...');
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  const results = {};

  // ========================================================
  // 1. DATE FLY-TO INTO THE FIELD
  // ========================================================
  console.log('\n[Step 0] --- (1) Measuring Date Fly-To ---');
  await page.click('#dob-search-btn');
  await page.waitForFunction(() => {
    const btn = document.querySelector('.reveal-btn-fly');
    return btn && window.getComputedStyle(btn).display !== 'none';
  }, { timeout: 10000 });

  const dateTracePath = path.join(ARTIFACT_DIR, 'baseline_trace_date.json');
  console.log('[Step 0] Starting trace for Date Fly-To...');
  await page.tracing.start({
    path: dateTracePath,
    categories: ['devtools.timeline', 'v8', 'blink.user_timing', 'disabled-by-default-devtools.timeline']
  });

  await page.click('.reveal-btn-fly');
  await new Promise(r => setTimeout(r, 2800));

  await page.tracing.stop();
  console.log('[Step 0] Stopped Date Fly-To trace.');
  const dateEvents = JSON.parse(fs.readFileSync(dateTracePath, 'utf8')).traceEvents;
  results.dateFlyTo = parseTraceTopCosts(dateEvents);

  // ========================================================
  // 2. NAME SEARCH
  // ========================================================
  console.log('\n[Step 0] --- (2) Measuring Name Search ---');
  await page.evaluate(() => {
    const tabBtns = Array.from(document.querySelectorAll('.tab-btn'));
    const nameTab = tabBtns.find(b => b.textContent.includes('Name'));
    if (nameTab) nameTab.click();
  });
  await new Promise(r => setTimeout(r, 500));

  await page.waitForSelector('#name-input');
  await page.evaluate(() => {
    const input = document.querySelector('#name-input');
    input.value = 'SURAJ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  const nameTracePath = path.join(ARTIFACT_DIR, 'baseline_trace_name.json');
  console.log('[Step 0] Starting trace for Name Search...');
  await page.tracing.start({
    path: nameTracePath,
    categories: ['devtools.timeline', 'v8', 'blink.user_timing', 'disabled-by-default-devtools.timeline']
  });

  await page.click('#name-search-btn');
  await page.waitForFunction(() => {
    const note = document.querySelector('#name-results');
    return note && note.style.display !== 'none' && !note.textContent.includes('Searching');
  }, { timeout: 10000 });
  await new Promise(r => setTimeout(r, 1200));

  await page.tracing.stop();
  console.log('[Step 0] Stopped Name Search trace.');
  const nameEvents = JSON.parse(fs.readFileSync(nameTracePath, 'utf8')).traceEvents;
  results.nameSearch = parseTraceTopCosts(nameEvents);

  // ========================================================
  // 3. IMAGE GATHER
  // ========================================================
  console.log('\n[Step 0] --- (3) Measuring Image Gather ---');
  await page.evaluate(() => {
    const tabBtns = Array.from(document.querySelectorAll('.tab-btn'));
    const imgTab = tabBtns.find(b => b.textContent.includes('Image'));
    if (imgTab) imgTab.click();
  });
  await new Promise(r => setTimeout(r, 500));

  // Click load sample button
  await page.waitForSelector('#load-sample-btn');
  await page.click('#load-sample-btn');
  await new Promise(r => setTimeout(r, 500));

  // Select size 64 for quick search
  await page.evaluate(() => {
    const size64Btn = document.querySelector('.size-opt[data-size="64"]');
    if (size64Btn) size64Btn.click();
  });
  await new Promise(r => setTimeout(r, 500));

  // Click search subsequence
  console.log('[Step 0] Triggering image locate in pi...');
  await page.click('#btn-search-subsequence');

  // Wait for result container to appear
  await page.waitForFunction(() => {
    const res = document.querySelector('#image-step-result');
    return res && res.style.display !== 'none';
  }, { timeout: 20000 });

  const imageTracePath = path.join(ARTIFACT_DIR, 'baseline_trace_image.json');
  console.log('[Step 0] Starting trace for Image Gather replay animation...');
  await page.tracing.start({
    path: imageTracePath,
    categories: ['devtools.timeline', 'v8', 'blink.user_timing', 'disabled-by-default-devtools.timeline']
  });

  // Replay gather animation during trace
  await page.click('#img-replay-btn');
  await new Promise(r => setTimeout(r, 2600));

  await page.tracing.stop();
  console.log('[Step 0] Stopped Image Gather trace.');
  const imageEvents = JSON.parse(fs.readFileSync(imageTracePath, 'utf8')).traceEvents;
  results.imageGather = parseTraceTopCosts(imageEvents);

  await browser.close();

  console.log('\n========================================================');
  console.log('STEP 0 BASELINE MEASUREMENTS (4x CPU THROTTLING)');
  console.log('========================================================');
  console.log(JSON.stringify(results, null, 2));

  const reportPath = path.join(ARTIFACT_DIR, 'step0_baseline_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), 'utf8');
  console.log('[Step 0] Saved baseline report to:', reportPath);
}

run().catch(err => {
  console.error('[Step 0 Measurement Failed]', err);
  process.exit(1);
});
