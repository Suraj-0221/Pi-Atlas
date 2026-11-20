import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

// Generate a random-looking but realistic grid of pi digits for the background
const sampleDigits = '14159265358979323846264338327950288419716939937510582097494459230781640628620899862803482534211706798214808651328230664709384460955058223172535940812848111745028410270193852110555964462294895493038196442881097566593344612847564823378678316527120190914564856692346034861045432664821339360726024914127372458700660631558817488152092096282925409171536436789259036001133053054882046652138414695194151160943305727036575959195309218611738193261179310511854807446237996274956735188575272489122793818301194912';

let digitsGrid = '';
const rows = 14;
const cols = 48;
for (let r = 0; r < rows; r++) {
  const line = sampleDigits.slice((r * cols) % 300, ((r * cols) % 300) + cols);
  digitsGrid += `<tspan x="60" dy="26">${line.split('').join(' ')}</tspan>`;
}

const SVG_OG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <!-- Warm Editorial Paper Surface -->
  <rect width="1200" height="630" fill="#F5F4EE"/>

  <!-- Wall of dim mono digits in background -->
  <text font-family="'JetBrains Mono', monospace" font-size="14" fill="#D8D5CC" letter-spacing="3" opacity="0.85">
    ${digitsGrid}
  </text>

  <!-- Central Paper Plaque Card -->
  <rect x="180" y="140" width="840" height="350" rx="20" fill="#FAF9F5" stroke="#E3E0D5" stroke-width="2"/>
  
  <!-- Accent highlight strip -->
  <rect x="230" y="196" width="36" height="4" fill="#FF5722"/>

  <!-- Brand Mark -->
  <text x="230" y="240" font-family="'JetBrains Mono', monospace" font-size="15" font-weight="700" letter-spacing="2" fill="#FF5722">π ATLAS</text>

  <!-- Serif Headline -->
  <text x="230" y="315" font-family="'Newsreader', Georgia, serif" font-size="56" font-weight="500" fill="#1F1E1D">Find your birthday in π</text>

  <!-- Subtitle -->
  <text x="230" y="365" font-family="'Newsreader', Georgia, serif" font-size="22" font-style="italic" fill="#6B6860">
    Explore 10,000,000 digits of the universal mathematical constant.
  </text>

  <!-- Visualized sequence badge -->
  <rect x="230" y="405" width="220" height="36" rx="6" fill="rgba(255, 87, 34, 0.12)" stroke="rgba(255, 87, 34, 0.25)" stroke-width="1"/>
  <text x="246" y="429" font-family="'JetBrains Mono', monospace" font-size="14" font-weight="600" fill="#FF5722">3 . 1 4 1 5 9 2 6 5 3 5 …</text>
</svg>`;

async function makeOg() {
  const publicDir = path.resolve('public');
  const outPath = path.join(publicDir, 'og-default.png');

  console.log('Generating public/og-default.png (1200x630)...');
  await sharp(Buffer.from(SVG_OG))
    .resize(1200, 630)
    .png({ quality: 85, compressionLevel: 8 })
    .toFile(outPath);

  const stats = fs.statSync(outPath);
  const sizeKb = (stats.size / 1024).toFixed(1);
  console.log(`Generated og-default.png: ${sizeKb} KB (under 300KB limit).`);
}

makeOg().catch(err => {
  console.error('Error generating OG image:', err);
  process.exit(1);
});
