/**
 * Image Preprocessing and Subsequence Digit Search:
 * - Grayscale luminance (ITU-R BT.601)
 * - Auto-levels (histogram stretching across all 10 levels 0..9)
 * - Proportional aspect-ratio resizing to target long side (64, 96, 128, 192, 256)
 * - Floyd-Steinberg dithering to 10 levels (Level 0 = black, 9 = white)
 * - Subsequence search across pi digits
 */

export interface PreprocessOptions {
  targetLongSide: number; // 64, 96, 128, 192, 256
  dither: boolean;
  invert: boolean;
}

export interface PreprocessResult {
  width: number;
  height: number;
  levels: Uint8Array;
  originalWidth: number;
  originalHeight: number;
}

export interface SubsequenceSearchResult {
  positions: Uint32Array;
  totalSpan: number;
  span: number;
  avgGap: number;
  averageGap: number;
  startPosition: number;
  endPosition: number;
  pixelCount: number;
  width: number;
  height: number;
  levels: Uint8Array;
}

/**
 * Preprocesses an image: resize, auto-levels, invert option, Floyd-Steinberg dithering to 10 levels (0..9).
 */
export function preprocessImage(
  source: CanvasImageSource & { width?: number; height?: number },
  options: PreprocessOptions
): PreprocessResult {
  const origW = (source as any).naturalWidth || (source as any).videoWidth || source.width || 100;
  const origH = (source as any).naturalHeight || (source as any).videoHeight || source.height || 100;

  let targetW: number;
  let targetH: number;

  if (origW >= origH) {
    targetW = options.targetLongSide;
    targetH = Math.max(1, Math.round(options.targetLongSide * (origH / origW)));
  } else {
    targetH = options.targetLongSide;
    targetW = Math.max(1, Math.round(options.targetLongSide * (origW / origH)));
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not create offscreen canvas context for image preprocessing');

  ctx.drawImage(source as CanvasImageSource, 0, 0, targetW, targetH);
  const imgData = ctx.getImageData(0, 0, targetW, targetH);
  const data = imgData.data;
  const numPixels = targetW * targetH;

  // 1. Grayscale luminance (0..255)
  const luma = new Float32Array(numPixels);
  let minY = 255;
  let maxY = 0;

  for (let i = 0; i < numPixels; i++) {
    const idx = i << 2;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    luma[i] = y;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  // 2. Auto-levels: stretch histogram so all 10 levels are accessible
  const range = maxY - minY;
  for (let i = 0; i < numPixels; i++) {
    let stretched = range > 0 ? ((luma[i] - minY) / range) * 255 : luma[i];
    if (options.invert) {
      stretched = 255 - stretched;
    }
    luma[i] = Math.max(0, Math.min(255, stretched));
  }

  // 3. Quantize / Dither to 10 levels (Level 0 = black, Level 9 = white)
  const levels = new Uint8Array(numPixels);
  const step = 255 / 9; // ~28.333

  if (!options.dither) {
    for (let i = 0; i < numPixels; i++) {
      levels[i] = Math.max(0, Math.min(9, Math.round(luma[i] / step)));
    }
  } else {
    // Floyd-Steinberg error diffusion
    // Create 2D buffer for error propagation
    const buf = new Float32Array(numPixels);
    buf.set(luma);

    for (let y = 0; y < targetH; y++) {
      for (let x = 0; x < targetW; x++) {
        const idx = y * targetW + x;
        const oldVal = buf[idx];
        const quant = Math.max(0, Math.min(9, Math.round(oldVal / step)));
        levels[idx] = quant;
        const newVal = quant * step;
        const err = oldVal - newVal;

        if (x + 1 < targetW) {
          buf[idx + 1] += err * (7 / 16);
        }
        if (x - 1 >= 0 && y + 1 < targetH) {
          buf[(y + 1) * targetW + (x - 1)] += err * (3 / 16);
        }
        if (y + 1 < targetH) {
          buf[(y + 1) * targetW + x] += err * (5 / 16);
        }
        if (x + 1 < targetW && y + 1 < targetH) {
          buf[(y + 1) * targetW + (x + 1)] += err * (1 / 16);
        }
      }
    }
  }

  return {
    width: targetW,
    height: targetH,
    levels,
    originalWidth: origW,
    originalHeight: origH
  };
}

/**
 * Scans forward through pi digits starting at startDigitIndex:
 * for each pixel level in raster order, find next matching digit, record position, continue.
 * O(span), deterministic, strictly increasing positions.
 */
export function subsequenceSearch(
  digits: Uint8Array,
  levels: Uint8Array,
  startDigitIndex: number = 0,
  width: number = 0,
  height: number = 0,
  onProgress?: (percent: number) => void
): SubsequenceSearchResult {
  const pixelCount = levels.length;
  const positions = new Uint32Array(pixelCount);
  const digitsLen = digits.length;

  let cur = Math.max(0, startDigitIndex);
  const reportInterval = Math.max(100, Math.floor(pixelCount / 20));

  for (let k = 0; k < pixelCount; k++) {
    const target = levels[k];
    while (cur < digitsLen && digits[cur] !== target) {
      cur++;
    }

    if (cur >= digitsLen) {
      throw new Error(`Subsequence search exceeded bundled digit capacity at pixel ${k} of ${pixelCount}`);
    }

    positions[k] = cur;
    cur++; // Advance to next digit position

    if (onProgress && k % reportInterval === 0) {
      onProgress(Math.round((k / pixelCount) * 100));
    }
  }

  onProgress?.(100);

  const startPosition = positions[0];
  const endPosition = positions[pixelCount - 1];
  const totalSpan = endPosition - startPosition + 1;
  const avgGap = pixelCount > 1 ? (endPosition - startPosition) / (pixelCount - 1) : 1;

  return {
    positions,
    totalSpan,
    span: totalSpan,
    avgGap,
    averageGap: avgGap,
    startPosition,
    endPosition,
    pixelCount,
    width,
    height,
    levels
  };
}
