/**
 * Coordinate mapping and layout for 10M digits:
 * Row-major with 1000 digits per world row (1000 x 10,000 grid).
 */

export const DIGITS_PER_ROW = 1000;
export const TOTAL_ROWS = 10000;
export const TOTAL_DIGITS = 10_000_000;

export const WORLD_WIDTH = DIGITS_PER_ROW; // 1000
export const WORLD_HEIGHT = TOTAL_ROWS;    // 10000

// Legacy tile constants for backwards compatibility with tests and tile cache
export const TILE_DIGITS_PER_ROW = 1000;
export const TILE_ROWS = 1000;
export const DIGITS_PER_TILE = 1_000_000;
export const TILE_COLS = 5;
export const TILE_GRID_ROWS = 2;
export const TOTAL_TILES = 10;
export const TILE_GAP = 80;

export function getTileCoord(tileIndex: number) {
  const tileCol = tileIndex % TILE_COLS;
  const tileRow = Math.floor(tileIndex / TILE_COLS);
  const tileWorldX = tileCol * (TILE_DIGITS_PER_ROW + TILE_GAP);
  const tileWorldY = tileRow * (TILE_ROWS + TILE_GAP);
  return { tileIndex, tileCol, tileRow, tileWorldX, tileWorldY };
}

/**
 * Converts a 0-based digit index (0 to 9,999,999) to world coordinates (x, y)
 */
export function digitToWorld(digitIndex: number): { x: number; y: number } {
  const clamped = Math.max(0, Math.min(TOTAL_DIGITS - 1, digitIndex));
  const x = clamped % DIGITS_PER_ROW;
  const y = Math.floor(clamped / DIGITS_PER_ROW);
  return { x, y };
}

/**
 * Converts world coordinates (x, y) back to the closest digit index (0 to 9,999,999)
 */
export function worldToDigit(x: number, y: number): number {
  const col = Math.max(0, Math.min(DIGITS_PER_ROW - 1, Math.floor(x)));
  const row = Math.max(0, Math.min(TOTAL_ROWS - 1, Math.floor(y)));
  return row * DIGITS_PER_ROW + col;
}
