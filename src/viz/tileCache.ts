/**
 * Pre-renders Level 1 overview heat textures (1000x1000 pixels per tile)
 * using the 10-step earth tone ramp.
 */

import { DIGIT_COLORS } from './palette.ts';
import { TILE_DIGITS_PER_ROW, TILE_ROWS, DIGITS_PER_TILE, TOTAL_TILES } from './levels.ts';

export class TileCache {
  private tileBitmaps: (ImageBitmap | null)[] = new Array(TOTAL_TILES).fill(null);
  private isReady: boolean = false;

  public async buildCache(
    digits: Uint8Array,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    const w = TILE_DIGITS_PER_ROW;
    const h = TILE_ROWS;
    const pixelCount = w * h;

    for (let t = 0; t < TOTAL_TILES; t++) {
      const imageData = new ImageData(w, h);
      const data = imageData.data;
      const tileOffset = t * DIGITS_PER_TILE;

      for (let i = 0; i < pixelCount; i++) {
        const d = digits[tileOffset + i];
        const color = DIGIT_COLORS[d] || DIGIT_COLORS[0];
        const idx = i << 2;
        data[idx] = color.r;
        data[idx + 1] = color.g;
        data[idx + 2] = color.b;
        data[idx + 3] = 255;
      }

      this.tileBitmaps[t] = await createImageBitmap(imageData);
      onProgress?.(Math.round(((t + 1) / TOTAL_TILES) * 100));
    }

    this.isReady = true;
  }

  public getTileBitmap(tileIndex: number): ImageBitmap | null {
    return this.tileBitmaps[tileIndex] || null;
  }

  public ready(): boolean {
    return this.isReady;
  }
}
