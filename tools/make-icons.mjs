import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const SVG_FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="96" fill="#F5F4EE"/>
  <text x="256" y="352" font-family="'Newsreader', Georgia, serif" font-size="320" font-weight="500" fill="#1F1E1D" text-anchor="middle">π</text>
</svg>`;

const SVG_MASKABLE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#F5F4EE"/>
  <text x="256" y="340" font-family="'Newsreader', Georgia, serif" font-size="280" font-weight="500" fill="#1F1E1D" text-anchor="middle">π</text>
</svg>`;

async function generateIcons() {
  const publicDir = path.resolve('public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // Ensure favicon.svg exists
  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), SVG_FAVICON, 'utf8');

  // Render icons
  console.log('Generating public/icon-192.png...');
  await sharp(Buffer.from(SVG_FAVICON))
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'icon-192.png'));

  console.log('Generating public/icon-512.png...');
  await sharp(Buffer.from(SVG_FAVICON))
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'icon-512.png'));

  console.log('Generating public/apple-touch-icon.png (180px)...');
  await sharp(Buffer.from(SVG_FAVICON))
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));

  console.log('Generating public/icon-maskable-512.png...');
  await sharp(Buffer.from(SVG_MASKABLE))
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'icon-maskable-512.png'));

  console.log('All icons generated successfully!');
}

generateIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
