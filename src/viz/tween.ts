/**
 * Camera Animator using van Wijk and Nuij smooth zoom-and-pan interpolation (rho = 1.42)
 * Capped strictly at 1.2s (600ms glide if within 3 screen widths).
 */

import { Camera } from './camera.ts';
import { interpolateZoomPan } from './vanWijkZoom.ts';

export interface FlyToOptions {
  targetX: number;
  targetY: number;
  targetZoom?: number;
  durationMs?: number;
  highlightLength?: number;
  onComplete?: () => void;
  onUpdate?: () => void;
}

export class CameraAnimator {
  private camera: Camera;
  private animId: number | null = null;

  constructor(camera: Camera) {
    this.camera = camera;
  }

  public flyTo(options: FlyToOptions) {
    if (this.animId !== null) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }

    const { targetX, targetY, onComplete, onUpdate } = options;
    const targetZoom = options.targetZoom ?? 32.0;

    const startX = this.camera.x;
    const startY = this.camera.y;
    const startZoom = this.camera.zoom;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      const duration = 200;
      const startTime = performance.now();
      const dx = targetX - startX;
      const dy = targetY - startY;

      const step = (now: number) => {
        const elapsed = now - startTime;
        const p = Math.min(1, elapsed / duration);
        const ease = p * p * (3 - 2 * p);

        this.camera.set(
          startX + dx * ease,
          startY + dy * ease,
          startZoom + (targetZoom - startZoom) * ease
        );
        onUpdate?.();

        if (p < 1) {
          this.animId = requestAnimationFrame(step);
        } else {
          this.animId = null;
          onComplete?.();
        }
      };
      this.animId = requestAnimationFrame(step);
      return;
    }

    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1440;
    const { duration: durSec, interpolate } = interpolateZoomPan(
      { x: startX, y: startY, zoom: startZoom },
      { x: targetX, y: targetY, zoom: targetZoom },
      viewportWidth,
      1.42
    );

    const durationMs = options.durationMs ?? (durSec * 1000);
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const p = Math.min(1.0, elapsed / durationMs);
      const state = interpolate(p);

      this.camera.set(state.x, state.y, state.zoom);
      onUpdate?.();

      if (p < 1.0) {
        this.animId = requestAnimationFrame(step);
      } else {
        this.animId = null;
        onComplete?.();
      }
    };

    this.animId = requestAnimationFrame(step);
  }

  public stop() {
    if (this.animId !== null) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  public isAnimating(): boolean {
    return this.animId !== null;
  }
}
