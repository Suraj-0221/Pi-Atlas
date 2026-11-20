/**
 * Image Gather Animation:
 * Exact subsequence reveal sequence (6 seconds, scrubber-controlled):
 * a. Reading level at start of span: chosen digits terracotta fill, skipped digits dimmed to 25%.
 * b. Zoom out to region level: chosen digits show as sparse scatter.
 * c. "Gather": chosen digits move to image grid cells, staggered row by row, cubic ease-in-out, no overshoot.
 * d. Final state: image grid with 10 grayscale levels (0=black, 9=white). Hover shows "digit X of pi = Y".
 * Drawn with typed arrays and fillRect on one canvas.
 */

import { Camera } from './camera.ts';
import { SubsequenceSearchResult } from '../encode/image.ts';
import { digitToWorld } from './levels.ts';
import { ACCENT_TERRACOTTA, BORDER_COLOR, TEXT_PRIMARY } from './palette.ts';

export class ImageGatherManager {
  private camera: Camera;
  private result: SubsequenceSearchResult | null = null;

  // Flattened buffers for fast 60fps rendering
  private worldX: Float32Array = new Float32Array(0);
  private worldY: Float32Array = new Float32Array(0);
  private targetScreenX: Float32Array = new Float32Array(0);
  private targetScreenY: Float32Array = new Float32Array(0);
  private cellSizes: Float32Array = new Float32Array(0);
  private grayColors: string[] = [];

  // Animation timeline state
  public progress: number = 0; // 0 to 1
  public isPlaying: boolean = false;
  private startTime: number = 0;
  private animDurationMs: number = 6000;
  private rafId: number | null = null;
  private onUpdateCallback?: (progress: number) => void;

  // Hover state
  public hoveredPixelIndex: number = -1;

  constructor(camera: Camera) {
    this.camera = camera;

    // Precompute 10 grayscale shades (Level 0 = black #000000, Level 9 = white #FFFFFF)
    for (let L = 0; L <= 9; L++) {
      const g = Math.round(L * 255 / 9);
      this.grayColors.push(`rgb(${g}, ${g}, ${g})`);
    }
  }

  public setResult(result: SubsequenceSearchResult | null) {
    this.stop();
    this.result = result;
    this.hoveredPixelIndex = -1;

    if (!result) {
      this.worldX = new Float32Array(0);
      this.worldY = new Float32Array(0);
      this.targetScreenX = new Float32Array(0);
      this.targetScreenY = new Float32Array(0);
      this.progress = 0;
      return;
    }

    const n = result.pixelCount;
    this.worldX = new Float32Array(n);
    this.worldY = new Float32Array(n);
    this.targetScreenX = new Float32Array(n);
    this.targetScreenY = new Float32Array(n);
    this.cellSizes = new Float32Array(n);

    // Precalculate world positions of each matched digit
    for (let k = 0; k < n; k++) {
      const digitIdx = result.positions[k];
      const pt = digitToWorld(digitIdx);
      this.worldX[k] = pt.x;
      this.worldY[k] = pt.y;
    }

    this.recomputeTargetLayout();
  }

  public getResult(): SubsequenceSearchResult | null {
    return this.result;
  }

  public recomputeTargetLayout() {
    if (!this.result) return;
    const w = this.result.width;
    const h = this.result.height;
    const n = this.result.pixelCount;

    const vw = this.camera.viewportWidth;
    const vh = this.camera.viewportHeight;

    // Place grid in center-right region unobstructed by bottom-left input panel (360px)
    const availLeft = vw > 768 ? 390 : 20;
    const availRight = vw - 24;
    const availTop = 48 + 24;
    const availBottom = vh - 32 - 24;

    const availW = Math.max(100, availRight - availLeft);
    const availH = Math.max(100, availBottom - availTop);

    const cellSize = Math.max(1, Math.min(availW / w, availH / h));
    const gridW = w * cellSize;
    const gridH = h * cellSize;
    const originX = availLeft + (availW - gridW) / 2;
    const originY = availTop + (availH - gridH) / 2;

    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const k = r * w + c;
        if (k < n) {
          this.targetScreenX[k] = originX + c * cellSize;
          this.targetScreenY[k] = originY + r * cellSize;
          this.cellSizes[k] = cellSize;
        }
      }
    }
  }

  public play(onUpdate?: (progress: number) => void) {
    this.stop();
    this.onUpdateCallback = onUpdate;
    this.isPlaying = true;
    this.startTime = performance.now();

    // Check prefers-reduced-motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.setProgress(1.0);
      this.isPlaying = false;
      return;
    }

    const loop = (now: number) => {
      if (!this.isPlaying) return;
      const elapsed = now - this.startTime;
      const p = Math.min(1.0, elapsed / this.animDurationMs);
      this.setProgress(p);

      if (p < 1.0) {
        this.rafId = requestAnimationFrame(loop);
      } else {
        this.isPlaying = false;
        this.rafId = null;
      }
    };

    this.rafId = requestAnimationFrame(loop);
  }

  public stop() {
    this.isPlaying = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  public setProgress(p: number) {
    this.progress = Math.max(0, Math.min(1, p));
    this.updateCameraForProgress(this.progress);
    this.onUpdateCallback?.(this.progress);
  }

  /**
   * Smoothly drives camera:
   * 0.0 - 0.22: Reading level at span start (zoom = 28)
   * 0.22 - 0.45: Zoom out to region/overview scatter (zoom = 0.50)
   * 0.45 - 1.0: Holds camera in region while gather animation moves digits into grid
   */
  private updateCameraForProgress(p: number) {
    if (!this.result) return;
    const startX = this.worldX[0];
    const startY = this.worldY[0];
    const endX = this.worldX[this.worldX.length - 1];
    const endY = this.worldY[this.worldY.length - 1];
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;

    if (p <= 0.22) {
      this.camera.x = startX;
      this.camera.y = startY;
      this.camera.zoom = 28.0;
    } else if (p <= 0.45) {
      const t = (p - 0.22) / (0.45 - 0.22);
      // Smooth cubic ease out
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      this.camera.x = startX + (midX - startX) * ease;
      this.camera.y = startY + (midY - startY) * ease;
      this.camera.zoom = 28.0 + (0.50 - 28.0) * ease;
    } else {
      this.camera.x = midX;
      this.camera.y = midY;
      this.camera.zoom = 0.50;
    }
  }

  /**
   * Renders the subsequence scatter, gather, and final grid onto canvas.
   */
  public render(ctx: CanvasRenderingContext2D) {
    if (!this.result || this.worldX.length === 0) return;

    const n = this.result.pixelCount;
    const h = this.result.height;
    const w = this.result.width;
    const p = this.progress;

    // Stage 1 & 2: Before gather (p <= 0.45)
    // Draw matched positions as terracotta markers at their world locations
    if (p <= 0.45) {
      ctx.save();
      const dotSize = p <= 0.22 ? 8 : 4;
      ctx.fillStyle = ACCENT_TERRACOTTA.hex;

      for (let k = 0; k < n; k++) {
        const { sx, sy } = this.camera.worldToScreen(this.worldX[k], this.worldY[k]);
        if (sx >= -10 && sx <= this.camera.viewportWidth + 10 && sy >= -10 && sy <= this.camera.viewportHeight + 10) {
          ctx.fillRect(sx - dotSize / 2, sy - dotSize / 2, dotSize, dotSize);
        }
      }
      ctx.restore();
      return;
    }

    // Stage 3: Gather (0.45 < p <= 0.85)
    if (p <= 0.85) {
      ctx.save();
      const g = (p - 0.45) / 0.40; // 0 to 1

      for (let r = 0; r < h; r++) {
        // Staggered by row
        const rowDelay = (r / h) * 0.35;
        const rowG = Math.max(0, Math.min(1, (g - rowDelay) / (1 - 0.35)));
        const t = rowG < 0.5 ? 4 * rowG * rowG * rowG : 1 - Math.pow(-2 * rowG + 2, 3) / 2;

        for (let c = 0; c < w; c++) {
          const k = r * w + c;
          if (k >= n) break;

          const startScreen = this.camera.worldToScreen(this.worldX[k], this.worldY[k]);
          const targetX = this.targetScreenX[k];
          const targetY = this.targetScreenY[k];
          const cellSize = this.cellSizes[k];

          const curX = startScreen.sx + (targetX - startScreen.sx) * t;
          const curY = startScreen.sy + (targetY - startScreen.sy) * t;
          const curSize = 4 + (cellSize - 4) * t;

          // Color interpolates from terracotta to target gray level
          if (t >= 0.8) {
            ctx.fillStyle = this.grayColors[this.result.levels[k]];
          } else {
            ctx.fillStyle = ACCENT_TERRACOTTA.hex;
          }

          ctx.fillRect(curX, curY, curSize, curSize);
        }
      }
      ctx.restore();
      return;
    }

    // Stage 4: Final Image Grid (0.85 < p <= 1.0)
    ctx.save();
    for (let k = 0; k < n; k++) {
      const x = this.targetScreenX[k];
      const y = this.targetScreenY[k];
      const size = this.cellSizes[k];
      const level = this.result.levels[k];

      ctx.fillStyle = this.grayColors[level];
      ctx.fillRect(x, y, size, size);
    }

    // Thin border around the image grid
    if (n > 0) {
      const x0 = this.targetScreenX[0];
      const y0 = this.targetScreenY[0];
      const x1 = this.targetScreenX[n - 1] + this.cellSizes[n - 1];
      const y1 = this.targetScreenY[n - 1] + this.cellSizes[n - 1];
      ctx.strokeStyle = BORDER_COLOR;
      ctx.lineWidth = 1;
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    }

    // Hover tooltip: "digit 4,812 of pi = 7"
    if (this.hoveredPixelIndex >= 0 && this.hoveredPixelIndex < n) {
      const k = this.hoveredPixelIndex;
      const hx = this.targetScreenX[k];
      const hy = this.targetScreenY[k];
      const size = this.cellSizes[k];
      const digitPos = this.result.positions[k];
      const digitVal = this.result.levels[k];

      // Highlight cell
      ctx.strokeStyle = ACCENT_TERRACOTTA.hex;
      ctx.lineWidth = 2;
      ctx.strokeRect(hx - 1, hy - 1, size + 2, size + 2);

      // Tooltip
      const text = `digit ${(digitPos + 1).toLocaleString()} of π = ${digitVal}`;
      ctx.font = '500 11px var(--font-mono)';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(text).width;
      const tooltipX = Math.min(this.camera.viewportWidth - tw - 16, Math.max(16, hx + size / 2 - tw / 2));
      const tooltipY = Math.max(54, hy - 20);

      ctx.fillStyle = 'rgba(250, 249, 245, 0.96)';
      ctx.fillRect(tooltipX - 6, tooltipY - 10, tw + 12, 20);
      ctx.strokeStyle = BORDER_COLOR;
      ctx.lineWidth = 1;
      ctx.strokeRect(tooltipX - 6, tooltipY - 10, tw + 12, 20);

      ctx.fillStyle = TEXT_PRIMARY;
      ctx.fillText(text, tooltipX, tooltipY);
    }

    ctx.restore();
  }

  public handlePointerMove(screenX: number, screenY: number): boolean {
    if (!this.result || this.progress < 0.85) {
      if (this.hoveredPixelIndex !== -1) {
        this.hoveredPixelIndex = -1;
        return true;
      }
      return false;
    }

    const n = this.result.pixelCount;
    let found = -1;

    for (let k = 0; k < n; k++) {
      const x = this.targetScreenX[k];
      const y = this.targetScreenY[k];
      const size = this.cellSizes[k];
      if (screenX >= x && screenX <= x + size && screenY >= y && screenY <= y + size) {
        found = k;
        break;
      }
    }

    if (found !== this.hoveredPixelIndex) {
      this.hoveredPixelIndex = found;
      return true;
    }

    return false;
  }
}

