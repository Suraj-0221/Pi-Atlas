import puppeteer from 'puppeteer-core';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function run() {
  console.log('[Perf Profile] Measuring Visualizer.render() execution time during fly-to...');
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  const perfResult = await page.evaluate(async () => {
    const atlas = window.__PI_ATLAS__;
    if (!atlas) return { error: 'App not initialized' };

    atlas.camera.set(500, 500, 0.12);
    atlas.visualizer.requestRender();

    const renderDurations = [];
    const origRender = atlas.visualizer.render.bind(atlas.visualizer);

    atlas.visualizer.render = function() {
      origRender();
      renderDurations.push(atlas.visualizer.lastRenderDurationMs);
    };

    const targetDigit = 9541283;

    await new Promise((resolve) => {
      const goto = document.getElementById('goto-input');
      goto.value = targetDigit.toString();
      goto.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      setTimeout(() => {
        resolve();
      }, 2500);
    });

    const maxMs = Math.max(...renderDurations);
    const avgMs = renderDurations.reduce((a, b) => a + b, 0) / renderDurations.length;
    const over16ms = renderDurations.filter(t => t > 16.0);

    return {
      totalFramesRendered: renderDurations.length,
      averageRenderTimeMs: Math.round(avgMs * 100) / 100,
      maxRenderTimeMs: Math.round(maxMs * 100) / 100,
      framesOver16ms: over16ms.length
    };
  });

  console.log('[Visualizer Performance Benchmark]', JSON.stringify(perfResult, null, 2));
  await browser.close();
}

run().catch(err => {
  console.error('[Perf Error]', err);
  process.exit(1);
});
