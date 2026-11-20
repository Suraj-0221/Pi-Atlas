import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT_DIR = process.cwd();
const OUTPUT_MD = path.join(ROOT_DIR, 'pi_atlas_codebase.md');
const OUTPUT_ZIP = path.join(ROOT_DIR, 'pi_atlas_source.zip');

const filesToInclude = [
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
  'index.html',
  'reveal-demo.html',
  'src/main.ts',
  'src/revealDemo.ts',
  'src/data/loadPi.ts',
  'src/encode/date.ts',
  'src/encode/name.ts',
  'src/encode/chunking.ts',
  'src/encode/image.ts',
  'src/viz/glField.ts',
  'src/viz/glImageGather.ts',
  'src/viz/sdfAtlas.ts',
  'src/viz/vanWijkZoom.ts',
  'src/viz/renderer.ts',
  'src/viz/camera.ts',
  'src/viz/tween.ts',
  'src/viz/levels.ts',
  'src/viz/palette.ts',
  'src/viz/easing.ts',
  'src/ui/datePanel.ts',
  'src/ui/namePanel.ts',
  'src/ui/imagePanel.ts',
  'src/ui/revealWindow.ts',
  'src/ui/aboutSheet.ts',
  'src/ui/readout.ts',
  'src/ui/tabs.ts',
  'src/workers/searchProtocol.ts',
  'src/workers/search.worker.ts',
  'src/styles/base.css',
  'src/styles/revealWindow.css',
  'src/test/encoders.test.ts',
  'src/test/nameImageFlows.test.ts',
  'src/test/pi50.test.ts',
  'src/test/revealWindow.test.ts',
  'src/test/search.test.ts',
  'src/test/tileIsolation.test.ts'
];

let md = `# Pi Atlas: Full Codebase & Architecture Specification

## Overview
Pi Atlas is a high-performance visual explorer for 10,000,000 decimal digits of π built with Vite, TypeScript, and WebGL2.

### Core Architecture Highlights:
1. **GPU Digit Field (WebGL2)**: Single fullscreen quad, 1 draw call per frame. Digits stored in a 4096x2442 R8UI texture. Fragment shader computes digit index and handles procedural semantic zoom (flat colors <1.5px -> 1px guttered cells 1.5-14px -> JetBrains Mono SDF glyphs >14px).
2. **van Wijk and Nuij Zoom & Pan**: Geodesic camera arc (rho = 1.42) capped at 1.2s (600ms glide if within 3 screen widths).
3. **Web Worker Search Engine**: Request-ID cancellation, immediate first-hit streaming for dates, contiguous name searches (full -> first name -> greedy chunks), and transferred typed array buffers.
4. **Reveal Window Component**: Pure Web Animations API (element.animate) with specular diagonal sweep, rolling lining tabular counter synchronized via Newton-Raphson cubic-bezier inversion, and staggered terracotta underline.
5. **GPU Instanced Image Gather**: Instanced draw calls for up to 65,536 instances at 60 FPS crossfading digits into grayscale pixels inside vertex/fragment shaders.

---

## File Tree
\`\`\`text
PieExplorer/
├── index.html                   # Main entry UI
├── reveal-demo.html             # Standalone Reveal Window interactive demo
├── vite.config.ts               # Multi-page Vite build config
├── package.json                 # Project dependencies & scripts
├── tsconfig.json                # TypeScript strict config
├── src/
│   ├── main.ts                  # Application coordinator & bus
│   ├── revealDemo.ts            # Demo harness script
│   ├── data/
│   │   └── loadPi.ts            # BCD 4-bit unpacking & pi50 verification
│   ├── encode/
│   │   ├── date.ts              # Multi-format date candidate generator
│   │   ├── name.ts              # Keypad & letter-number encodings + odds
│   │   ├── chunking.ts          # Greedy contiguous string chunking
│   │   └── image.ts             # Grayscale, auto-levels, Floyd-Steinberg dithering
│   ├── viz/
│   │   ├── glField.ts           # WebGL2 fullscreen quad + R8UI texture shader
│   │   ├── glImageGather.ts     # WebGL2 GPU instanced gather animation
│   │   ├── sdfAtlas.ts          # 10-glyph JetBrains Mono SDF atlas generator
│   │   ├── vanWijkZoom.ts       # van Wijk and Nuij zoom & pan interpolation
│   │   ├── renderer.ts          # Visualizer coordinator (WebGL2 wrapper)
│   │   ├── camera.ts            # 2D continuous pan & semantic zoom camera
│   │   ├── tween.ts             # Camera animator using van Wijk geodesic path
│   │   ├── levels.ts            # 1000x10000 coordinate mapping
│   │   ├── palette.ts           # Earth tone palette definition
│   │   └── easing.ts            # Exact numerical cubic-bezier solver
│   ├── ui/
│   │   ├── datePanel.ts         # Multi-format date search panel
│   │   ├── namePanel.ts         # Redesigned name panel with keypad & tiles
│   │   ├── imagePanel.ts        # Two-stage image panel (Choose -> Prepare)
│   │   ├── revealWindow.ts      # Glass reveal window component
│   │   ├── aboutSheet.ts        # About sheet with Reveal Style preference
│   │   ├── readout.ts           # Bottom instrument readout bar
│   │   └── tabs.ts              # Tab switcher
│   ├── workers/
│   │   ├── searchProtocol.ts    # Typed message protocol
│   │   └── search.worker.ts     # Search worker with cancellation & transfer
│   ├── styles/
│   │   ├── base.css             # Main theme and UI component styles
│   │   └── revealWindow.css     # Glass reveal window styles
│   └── test/                    # Comprehensive unit tests
\`\`\`

---

## Source Files

`;

for (const relPath of filesToInclude) {
  const fullPath = path.join(ROOT_DIR, relPath);
  if (!fs.existsSync(fullPath)) continue;

  const content = fs.readFileSync(fullPath, 'utf8');
  const ext = path.extname(relPath).replace('.', '') || 'text';
  const lang = ext === 'ts' ? 'typescript' : ext === 'js' ? 'javascript' : ext;

  md += `\n### \`${relPath}\`\n\n\`\`\`${lang}\n${content}\n\`\`\`\n\n---\n`;
}

fs.writeFileSync(OUTPUT_MD, md, 'utf8');
console.log(`[Bundle] Successfully generated: ${OUTPUT_MD} (${(fs.statSync(OUTPUT_MD).size / 1024).toFixed(1)} KB)`);

// Also create a zip file using powershell Compress-Archive
try {
  if (fs.existsSync(OUTPUT_ZIP)) fs.unlinkSync(OUTPUT_ZIP);
  const zipCmd = `Compress-Archive -Path "index.html", "reveal-demo.html", "package.json", "tsconfig.json", "vite.config.ts", "src" -DestinationPath "${OUTPUT_ZIP}"`;
  execSync(`powershell -Command "${zipCmd}"`, { stdio: 'inherit' });
  console.log(`[Bundle] Successfully generated zip: ${OUTPUT_ZIP} (${(fs.statSync(OUTPUT_ZIP).size / 1024).toFixed(1)} KB)`);
} catch (err) {
  console.warn('[Bundle] Note: zip creation skipped or failed:', err.message);
}
