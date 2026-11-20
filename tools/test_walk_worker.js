import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import os from 'os';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function testWalk() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'walk_test_'));
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    userDataDir: tmpDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  const binBuffer = fs.readFileSync('public/pi_10m.bin');
  const base64Data = binBuffer.toString('base64');

  const html = `
    <!DOCTYPE html>
    <html>
    <body>
    <script>
      const b64 = "${base64Data}";
      const binStr = atob(b64);
      const packed = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) packed[i] = binStr.charCodeAt(i);

      // unpack 10M
      const digits = new Uint8Array(10000000);
      for (let i = 0; i < packed.length; i++) {
        const b = packed[i];
        digits[i << 1] = (b >> 4) & 0x0f;
        digits[(i << 1) + 1] = b & 0x0f;
      }
      console.log('Unpacked 10M digits');

      const t0 = performance.now();

      // Precompute direction vectors
      const dx = new Float32Array(10);
      const dy = new Float32Array(10);
      for (let d = 0; d < 10; d++) {
        const rad = (d * 36 * Math.PI) / 180;
        dx[d] = Math.cos(rad);
        dy[d] = Math.sin(rad);
      }

      // First pass: bounding box
      let curX = 0, curY = 0;
      let minX = 0, maxX = 0, minY = 0, maxY = 0;
      for (let i = 0; i < 10000000; i++) {
        const d = digits[i];
        curX += dx[d];
        curY += dy[d];
        if (curX < minX) minX = curX;
        if (curX > maxX) maxX = curX;
        if (curY < minY) minY = curY;
        if (curY > maxY) maxY = curY;
      }
      console.log('Bounds:', minX, maxX, minY, maxY, 'Time:', (performance.now() - t0).toFixed(1) + 'ms');

      // Second pass: render to OffscreenCanvas
      const t1 = performance.now();
      const canvasW = 2800;
      const canvasH = 1600;
      const pad = 40;
      const scaleX = (canvasW - pad * 2) / (maxX - minX);
      const scaleY = (canvasH - pad * 2) / (maxY - minY);
      const scale = Math.min(scaleX, scaleY);

      const offscreen = new OffscreenCanvas(canvasW, canvasH);
      const ctx = offscreen.getContext('2d');
      ctx.fillStyle = '#F5F4EE';
      ctx.fillRect(0, 0, canvasW, canvasH);

      // Sand -> Clay -> Umber -> Charcoal
      // Sand: rgba(212, 197, 169, 0.25)
      // Clay: rgba(185, 138, 94, 0.25)
      // Umber: rgba(122, 78, 54, 0.25)
      // Charcoal: rgba(52, 49, 44, 0.25)

      const colors = [
        'rgba(212, 197, 169, 0.22)',
        'rgba(185, 138, 94, 0.22)',
        'rgba(122, 78, 54, 0.22)',
        'rgba(52, 49, 44, 0.22)'
      ];

      const chunkSize = 2500000; // 4 color segments
      curX = 0; curY = 0;
      let px = pad + (curX - minX) * scale;
      let py = pad + (curY - minY) * scale;

      ctx.lineWidth = 1;

      for (let seg = 0; seg < 4; seg++) {
        ctx.strokeStyle = colors[seg];
        ctx.beginPath();
        ctx.moveTo(px, py);

        const startI = seg * chunkSize;
        const endI = (seg + 1) * chunkSize;
        for (let i = startI; i < endI; i++) {
          const d = digits[i];
          curX += dx[d];
          curY += dy[d];
          px = pad + (curX - minX) * scale;
          py = pad + (curY - minY) * scale;
          ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      console.log('Rendering 10M stroke took:', (performance.now() - t1).toFixed(1) + 'ms');

      // Convert to bitmap
      const bmp = offscreen.transferToImageBitmap();
      window._bmpReady = true;
    </script>
    </body>
    </html>
  `;

  await page.setContent(html);
  await page.waitForFunction(() => window._bmpReady === true, { timeout: 30000 });
  console.log('Walk generated successfully');
  await browser.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

testWalk().catch(console.error);
