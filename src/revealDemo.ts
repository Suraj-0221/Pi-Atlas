/**
 * Isolated Reveal Window Demo Script (/reveal-demo)
 */

import { RevealWindow, RevealHitData } from './ui/revealWindow.ts';
import { loadPiDigits } from './data/loadPi.ts';

const SAMPLE_HITS: Record<string, RevealHitData> = {
  '14051998': {
    day: 14,
    month: 5,
    year: 1998,
    format: 'DDMMYY',
    patternStr: '140598',
    firstOccurrence: 1203448, // 0-based
    occurrences: [
      1203448, 1894210, 2450123, 3120950, 4850122, 5920311,
      6740291, 7150220, 8049102, 9123840, 9840192
    ],
    currentOccurrenceIndex: 0,
    totalOccurrences: 11,
    missedLongerFormat: 'DDMMYYYY',
    missedLongerPattern: '14051998'
  },
  '03141592': {
    day: 14,
    month: 3,
    year: 1592,
    format: 'MMDDYYYY',
    patternStr: '03141592',
    firstOccurrence: 0, // 0-based
    occurrences: [0],
    currentOccurrenceIndex: 0,
    totalOccurrences: 1
  },
  '01012000': {
    day: 1,
    month: 1,
    year: 2000,
    format: 'DDMMYY',
    patternStr: '010100',
    firstOccurrence: 54891, // 0-based
    occurrences: [54891, 142095, 304192, 492019, 810294, 950291],
    currentOccurrenceIndex: 0,
    totalOccurrences: 6,
    missedLongerFormat: 'DDMMYYYY',
    missedLongerPattern: '01012000'
  }
};

let piDigits: Uint8Array;
let revealWindow: RevealWindow;

async function initDemo() {
  const statusEl = document.getElementById('demo-status') as HTMLElement;
  const canvas = document.getElementById('demo-bg-canvas') as HTMLCanvasElement;

  if (statusEl) statusEl.textContent = 'Loading pi digits archive...';

  try {
    piDigits = await loadPiDigits(() => {});
  } catch (err) {
    console.warn('[Demo] Fallback to synthetic digits:', err);
    piDigits = new Uint8Array(10_000_000);
    // Fill first 100 digits of pi
    const sample = '1415926535897932384626433832795028841971693993751058209749445923078164062862089986280348253421170679';
    for (let i = 0; i < 10_000_000; i++) {
      piDigits[i] = parseInt(sample[i % sample.length], 10);
    }
  }

  // Draw background digit field
  drawBackgroundField(canvas);
  window.addEventListener('resize', () => drawBackgroundField(canvas));

  // Initialize Reveal Window component
  revealWindow = new RevealWindow({
    piDigits,
    callbacks: {
      onShowInField: (pos, _len, fmt, pat) => {
        if (statusEl) {
          statusEl.textContent = `Simulation: Flying camera to digit ${(pos + 1).toLocaleString()} (${fmt}: ${pat}).`;
        }
      },
      onClose: () => {
        if (statusEl) {
          statusEl.textContent = 'Window dismissed. Tap Play Reveal Sequence.';
        }
      },
      onStepOccurrence: (idx, pos) => {
        if (statusEl) {
          statusEl.textContent = `Occurrence ${idx + 1} at digit ${pos.toLocaleString()}`;
        }
      }
    }
  });

  setupControls();

  if (statusEl) statusEl.textContent = 'Ready. Tap Play Reveal Sequence or choose options below.';

  // Monitor frame rate
  startFpsMonitor();
}

function drawBackgroundField(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.scale(dpr, dpr);

  ctx.fillStyle = '#F5F4EE';
  ctx.fillRect(0, 0, w, h);

  // Draw a grid of simulated reading digits across the viewport
  ctx.font = '500 13px "JetBrains Mono", monospace';
  ctx.fillStyle = '#1F1E1D';
  ctx.globalAlpha = 0.35;

  const colWidth = 24;
  const rowHeight = 22;
  const cols = Math.ceil(w / colWidth);
  const rows = Math.ceil(h / rowHeight);

  let idx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const d = piDigits ? piDigits[idx % piDigits.length] : (idx % 10);
      ctx.fillText(d.toString(), c * colWidth + 8, r * rowHeight + 16);
      idx++;
    }
  }
}

function setupControls() {
  const slowmoGroup = document.getElementById('slowmo-group');
  const slowmoValue = document.getElementById('slowmo-value');
  const durationSlider = document.getElementById('duration-slider') as HTMLInputElement;
  const durationValue = document.getElementById('duration-value');
  const easingSelect = document.getElementById('easing-select') as HTMLSelectElement;
  const triggerBtn = document.getElementById('btn-trigger-reveal');

  // Slow-Motion Toggle
  slowmoGroup?.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      slowmoGroup.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mult = parseFloat(btn.dataset.mult || '1.0');
      revealWindow.setDurationMultiplier(mult);
      if (slowmoValue) {
        slowmoValue.textContent = mult === 1.0 ? '1x (Normal)' : mult === 4.0 ? '4x (Slow)' : '10x (Ultra)';
      }
    });
  });

  // Duration Slider
  durationSlider?.addEventListener('input', () => {
    const val = parseInt(durationSlider.value, 10);
    if (durationValue) durationValue.textContent = `${val.toLocaleString()} ms`;
  });

  // Easing Selector
  easingSelect?.addEventListener('change', () => {
    const val = easingSelect.value;
    if (val.startsWith('cubic-bezier')) {
      const match = val.match(/cubic-bezier\(([^)]+)\)/);
      if (match) {
        const parts = match[1].split(',').map(s => parseFloat(s.trim()));
        if (parts.length === 4) {
          revealWindow.setEasing([parts[0], parts[1], parts[2], parts[3]], val);
        }
      }
    } else if (val === 'ease-out') {
      revealWindow.setEasing([0, 0, 0.58, 1], 'ease-out');
    } else if (val === 'ease-in-out') {
      revealWindow.setEasing([0.42, 0, 0.58, 1], 'ease-in-out');
    } else if (val === 'linear') {
      revealWindow.setEasing([0, 0, 1, 1], 'linear');
    }
  });

  // Trigger Button
  triggerBtn?.addEventListener('click', () => {
    playCurrentSelection();
  });
}

function playCurrentSelection() {
  const sampleSelect = document.getElementById('sample-date-select') as HTMLSelectElement;
  const key = sampleSelect?.value || '14051998';
  const hit = SAMPLE_HITS[key] || SAMPLE_HITS['14051998'];

  // Reset occurrence index to 0
  hit.currentOccurrenceIndex = 0;
  hit.firstOccurrence = hit.occurrences[0];

  revealWindow.startReveal(hit);
}

function startFpsMonitor() {
  const fpsEl = document.getElementById('fps-counter');
  let frameCount = 0;
  let lastTime = performance.now();

  const loop = (now: number) => {
    frameCount++;
    if (now - lastTime >= 500) {
      const fps = Math.round((frameCount * 1000) / (now - lastTime));
      if (fpsEl) {
        fpsEl.textContent = `${fps} FPS`;
        fpsEl.style.color = fps >= 55 ? '#8E9B6B' : fps >= 30 ? '#D9A441' : '#C96442';
      }
      frameCount = 0;
      lastTime = now;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// Global hook for Puppeteer and automated tests
(window as any).__REVEAL_DEMO__ = {
  getRevealWindow: () => revealWindow,
  playHit: (key: string) => {
    const hit = SAMPLE_HITS[key] || SAMPLE_HITS['14051998'];
    revealWindow.startReveal(hit);
  },
  setSlowMo: (mult: number) => {
    revealWindow.setDurationMultiplier(mult);
  }
};

initDemo();
