/**
 * Desktop Minimap (Task 2f):
 * A 20px-wide vertical strip at the right edge from y=48 to the readout bar.
 * - Base canvas drawn ONCE: for each of 10,000 rows, 20 sampled digits (column i*50) colored by ramp.
 * - Overlay canvas: 2px accent line (#FF5722) for each result and a translucent rectangle for current viewport.
 * - Click or drag to fly to that row using CameraAnimator.flyTo.
 */

import { Camera } from './camera.ts';
import { CameraAnimator } from './tween.ts';
import { DIGIT_COLORS } from './palette.ts';

export class Minimap {
  private container: HTMLElement;
  private bgCanvas: HTMLCanvasElement;
  private overlayCanvas: HTMLCanvasElement;
  private camera: Camera;
  private animator: CameraAnimator;
  private onRequestRender: () => void;

  private isDragging = false;
  private activeResultIndices: number[] = [];

  constructor(
    container: HTMLElement,
    camera: Camera,
    animator: CameraAnimator,
    digits: Uint8Array,
    onRequestRender: () => void
  ) {
    this.container = container;
    this.camera = camera;
    this.animator = animator;
    this.onRequestRender = onRequestRender;

    this.container.innerHTML = `
      <canvas id="minimap-bg" width="20" height="10000" style="position: absolute; top: 0; left: 0; width: 20px; height: 100%; image-rendering: pixelated;"></canvas>
      <canvas id="minimap-overlay" style="position: absolute; top: 0; left: 0; width: 20px; height: 100%; pointer-events: none;"></canvas>
    `;

    this.bgCanvas = this.container.querySelector('#minimap-bg') as HTMLCanvasElement;
    this.overlayCanvas = this.container.querySelector('#minimap-overlay') as HTMLCanvasElement;

    this.drawBaseCanvas(digits);
    this.setupInteractions();
    this.resize();
  }

  public updateDigits(digits: Uint8Array) {
    this.drawBaseCanvas(digits);
    this.update();
  }

  /**
   * Draw the 10,000 rows x 20 columns base representation ONCE.
   */
  private drawBaseCanvas(digits: Uint8Array) {
    const ctx = this.bgCanvas.getContext('2d');
    if (!ctx) return;

    const imgData = ctx.createImageData(20, 10000);
    const data = imgData.data;

    for (let r = 0; r < 10000; r++) {
      const rowOffset = r * 1000;
      const imgRowOffset = r * 20 * 4;
      for (let c = 0; c < 20; c++) {
        const digitIndex = rowOffset + c * 50;
        const d = (digitIndex < digits.length ? digits[digitIndex] : 0) % 10;
        const color = DIGIT_COLORS[d];
        const pixelIdx = imgRowOffset + c * 4;
        data[pixelIdx] = color.r;
        data[pixelIdx + 1] = color.g;
        data[pixelIdx + 2] = color.b;
        data[pixelIdx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }

  public resize() {
    const h = this.container.clientHeight || (window.innerHeight - 80);
    this.overlayCanvas.width = 20;
    this.overlayCanvas.height = Math.max(10, h);
    this.update();
  }

  public setResultIndices(indices: number[]) {
    this.activeResultIndices = indices;
    this.update();
  }

  /**
   * Updates overlay: 2px accent lines for results and viewport rectangle
   */
  public update() {
    const ctx = this.overlayCanvas.getContext('2d');
    if (!ctx) return;

    const w = this.overlayCanvas.width;
    const h = this.overlayCanvas.height;
    ctx.clearRect(0, 0, w, h);

    // 1. Result accent lines (2px #FF5722)
    ctx.fillStyle = '#FF5722';
    for (const digitIdx of this.activeResultIndices) {
      const row = Math.floor(digitIdx / 1000);
      const y = Math.floor((row / 10000) * h);
      ctx.fillRect(0, Math.max(0, Math.min(h - 2, y)), w, 2);
    }

    // 2. Viewport indicator rectangle
    const bounds = this.camera.getVisibleWorldBounds();
    const yTop = Math.max(0, (bounds.minY / 10000) * h);
    const yBottom = Math.min(h, (bounds.maxY / 10000) * h);
    const vHeight = Math.max(3, yBottom - yTop);

    ctx.fillStyle = 'rgba(255, 87, 34, 0.18)';
    ctx.fillRect(0, yTop, w, vHeight);
    ctx.strokeStyle = 'rgba(255, 87, 34, 0.75)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, yTop, w - 1, vHeight);
  }

  private setupInteractions() {
    const onPointer = (e: PointerEvent) => {
      const rect = this.container.getBoundingClientRect();
      const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      const targetRow = Math.floor(normY * 10000);

      this.animator.flyTo({
        targetX: 500,
        targetY: targetRow + 0.5,
        targetZoom: this.camera.zoom,
        onUpdate: () => this.onRequestRender()
      });
    };

    this.container.addEventListener('pointerdown', (e) => {
      this.isDragging = true;
      this.container.setPointerCapture(e.pointerId);
      onPointer(e);
    });

    this.container.addEventListener('pointermove', (e) => {
      if (this.isDragging) {
        onPointer(e);
      }
    });

    const stopDrag = (e: PointerEvent) => {
      if (this.isDragging) {
        this.isDragging = false;
        try {
          this.container.releasePointerCapture(e.pointerId);
        } catch {}
      }
    };

    this.container.addEventListener('pointerup', stopDrag);
    this.container.addEventListener('pointercancel', stopDrag);
  }
}
