import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import os from 'os';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function testIsolation() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi_test_'));
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    userDataDir: tmpDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1040, height: 1040 });

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  // Read binary file directly
  const binBuffer = fs.readFileSync('public/pi_10m.bin');
  const base64Data = binBuffer.subarray(0, 500000).toString('base64');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { margin: 0; padding: 20px; background: #fff; }
        canvas { display: block; image-rendering: pixelated; }
      </style>
    </head>
    <body>
      <canvas id="c" width="1000" height="1000"></canvas>
      <script>
        const DIGIT_COLORS = [
          { r: 0x34, g: 0x31, b: 0x2c },
          { r: 0x7a, g: 0x4e, b: 0x36 },
          { r: 0xb9, g: 0x8a, b: 0x5e },
          { r: 0xe0, g: 0xc9, b: 0xa0 },
          { r: 0xd9, g: 0xa4, b: 0x41 },
          { r: 0x8e, g: 0x9b, b: 0x6b },
          { r: 0x4f, g: 0x6b, b: 0x5b },
          { r: 0x7c, g: 0x94, b: 0xa6 },
          { r: 0x3f, g: 0x5a, b: 0x73 },
          { r: 0xa8, g: 0xa3, b: 0x9a }
        ];

        function unpackBCD(packed, targetCount = 1000000) {
          const digits = new Uint8Array(targetCount);
          for (let i = 0; i < packed.length; i++) {
            const byte = packed[i];
            const idx = i << 1;
            if (idx < targetCount) digits[idx] = (byte >> 4) & 0x0f;
            if (idx + 1 < targetCount) digits[idx + 1] = byte & 0x0f;
          }
          return digits;
        }

        async function run() {
          const b64 = "${base64Data}";
          const binStr = atob(b64);
          const bytes = new Uint8Array(binStr.length);
          for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);

          const digits = unpackBCD(bytes, 1000000);

          const canvas = document.getElementById('c');
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = false;

          const w = 1000;
          const h = 1000;
          const imgData = new ImageData(w, h);
          console.log('assert imageData.width * height * 4 === data.length:', imgData.width * imgData.height * 4 === imgData.data.length);

          for (let i = 0; i < 1000000; i++) {
            const d = digits[i];
            const color = DIGIT_COLORS[d] || DIGIT_COLORS[0];
            const idx = i << 2;
            imgData.data[idx] = color.r;
            imgData.data[idx+1] = color.g;
            imgData.data[idx+2] = color.b;
            imgData.data[idx+3] = 255;
          }

          const bmp = await createImageBitmap(imgData);
          ctx.drawImage(bmp, 0, 0);

          window._isReady = true;
        }
        run();
      </script>
    </body>
    </html>
  `;

  await page.setContent(htmlContent);
  await page.waitForFunction(() => window._isReady === true, { timeout: 15000 });
  await page.screenshot({ path: 'tile1_isolation.png' });
  console.log('tile1_isolation.png captured');
  await browser.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

testIsolation().catch(console.error);
