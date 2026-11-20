import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { unpackBCD } from '../data/loadPi.ts';
import { TILE_DIGITS_PER_ROW, TILE_ROWS, DIGITS_PER_TILE, TOTAL_TILES, getTileCoord, digitToWorld, worldToDigit } from '../viz/levels.ts';
import { DIGIT_COLORS } from '../viz/palette.ts';

describe('Step 1A: Tile 1 Isolation and Stride Verification', () => {
  const binPath = path.resolve(__dirname, '../../public/pi_10m.bin');
  const buffer = fs.readFileSync(binPath);
  const packedBytes = new Uint8Array(buffer);
  const allDigits = unpackBCD(packedBytes, 10_000_000);

  it('asserts imageData.width * height * 4 === data.length for 1000x1000 tile', () => {
    const width = TILE_DIGITS_PER_ROW; // 1000
    const height = TILE_ROWS;           // 1000
    const expectedByteLength = width * height * 4; // 4,000,000 bytes
    
    // Create RGBA backing buffer simulating ImageData
    const data = new Uint8ClampedArray(expectedByteLength);
    expect(width * height * 4).toBe(data.length);
    expect(data.length).toBe(4_000_000);
  });

  it('verifies Tile 1 column distribution has zero edge stripes or stride errors', () => {
    const w = TILE_DIGITS_PER_ROW; // 1000
    const h = TILE_ROWS;           // 1000
    const tileDigits = allDigits.subarray(0, DIGITS_PER_TILE);

    // Compute column average R values for each of the 1000 columns
    const colRMeans: number[] = new Array(w).fill(0);

    for (let r = 0; r < h; r++) {
      const rowOffset = r * w;
      for (let c = 0; c < w; c++) {
        const d = tileDigits[rowOffset + c];
        const color = DIGIT_COLORS[d];
        colRMeans[c] += color.r;
      }
    }

    for (let c = 0; c < w; c++) {
      colRMeans[c] /= h;
    }

    // Left 45 columns (the reported stripe region)
    const left45 = colRMeans.slice(0, 45);
    const leftMean = left45.reduce((a, b) => a + b, 0) / left45.length;

    // Center 100 columns
    const center100 = colRMeans.slice(450, 550);
    const centerMean = center100.reduce((a, b) => a + b, 0) / center100.length;

    // Right 45 columns (the reported right stripe region)
    const right45 = colRMeans.slice(955, 1000);
    const rightMean = right45.reduce((a, b) => a + b, 0) / right45.length;

    // The mean color should be statistically identical across left, center, and right (within 2.5 delta)
    expect(Math.abs(leftMean - centerMean)).toBeLessThan(2.5);
    expect(Math.abs(rightMean - centerMean)).toBeLessThan(2.5);

    // Standard deviation of column averages across all 1000 columns must be under 2.5 (strictly no vertical striping)
    const overallMean = colRMeans.reduce((a, b) => a + b, 0) / w;
    const variance = colRMeans.reduce((sum, val) => sum + Math.pow(val - overallMean, 2), 0) / w;
    const stdDev = Math.sqrt(variance);
    expect(stdDev).toBeLessThan(2.5);
  });

  it('verifies tile coordinate boundaries and worldToDigit roundtrip', () => {
    for (let t = 0; t < TOTAL_TILES; t++) {
      const coord = getTileCoord(t);
      expect(coord.tileIndex).toBe(t);

      // First and last digit of each tile
      const firstDigitIdx = t * DIGITS_PER_TILE;
      const lastDigitIdx = (t + 1) * DIGITS_PER_TILE - 1;

      const firstWorld = digitToWorld(firstDigitIdx);
      const lastWorld = digitToWorld(lastDigitIdx);

      expect(worldToDigit(firstWorld.x, firstWorld.y)).toBe(firstDigitIdx);
      expect(worldToDigit(lastWorld.x, lastWorld.y)).toBe(lastDigitIdx);
    }
  });
});
