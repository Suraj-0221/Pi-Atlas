/**
 * 2D Camera for continuous pan and semantic zoom
 */

import { WORLD_WIDTH, WORLD_HEIGHT } from './levels.ts';

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export class Camera {
  public x: number = WORLD_WIDTH / 2;
  public y: number = WORLD_HEIGHT / 2;
  public zoom: number = 0.18; // Default overview zoom

  public minZoom: number = 0.02;
  public maxZoom: number = 64.0; // High zoom allows large 32px+ crystal-clear digits

  public viewportWidth: number = 1200;
  public viewportHeight: number = 800;

  private onChangeCallback?: () => void;

  constructor(onChange?: () => void) {
    this.onChangeCallback = onChange;
  }

  public setViewport(w: number, h: number) {
    this.viewportWidth = w;
    this.viewportHeight = h;
    this.notify();
  }

  public fitOverview() {
    this.x = WORLD_WIDTH / 2;
    this.y = WORLD_HEIGHT / 2;

    const topInset = 48 + 24 + 18; // 48px top bar + 24px padding + 18px label clearance
    const bottomInset = 32 + 24;   // 32px readout bar + 24px padding
    const sidePad = 24;            // 24px side padding

    const availW = Math.max(100, this.viewportWidth - sidePad * 2);
    const availH = Math.max(100, this.viewportHeight - (topInset + bottomInset));

    this.zoom = Math.min(availW / WORLD_WIDTH, availH / WORLD_HEIGHT);

    // Center camera Y optically in the unobstructed viewport area
    const screenCenterY = this.viewportHeight / 2;
    const unobstructedCenterY = topInset + availH / 2;
    const screenOffsetY = unobstructedCenterY - screenCenterY;
    this.y = (WORLD_HEIGHT / 2) - (screenOffsetY / this.zoom);

    this.notify();
  }

  public zoomToTiles1to1() {
    this.zoom = 1.0;
    this.x = 500;
    this.y = 500;
    this.notify();
  }

  public fitSpan(startRow: number, endRow: number): { targetX: number; targetY: number; targetZoom: number } {
    const rowSpan = Math.max(1, endRow - startRow + 1);
    const targetZoom = Math.max(this.minZoom, Math.min(this.maxZoom, Math.min(
      (this.viewportWidth - 48) / 1000,
      (this.viewportHeight * 0.8) / (rowSpan + 2)
    )));
    const targetX = 500;
    const targetY = startRow + rowSpan / 2;
    this.x = targetX;
    this.y = targetY;
    this.zoom = targetZoom;
    this.notify();
    return { targetX, targetY, targetZoom };
  }

  public set(x: number, y: number, zoom: number) {
    this.x = x;
    this.y = y;
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
    this.notify();
  }

  public panBy(screenDeltaX: number, screenDeltaY: number) {
    this.x -= screenDeltaX / this.zoom;
    this.y -= screenDeltaY / this.zoom;
    this.notify();
  }

  public zoomAt(screenX: number, screenY: number, factor: number) {
    const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));
    if (newZoom === this.zoom) return;

    // Keep world position under cursor invariant
    const wx = this.x + (screenX - this.viewportWidth / 2) / this.zoom;
    const wy = this.y + (screenY - this.viewportHeight / 2) / this.zoom;

    this.zoom = newZoom;
    this.x = wx - (screenX - this.viewportWidth / 2) / this.zoom;
    this.y = wy - (screenY - this.viewportHeight / 2) / this.zoom;
    this.notify();
  }

  public worldToScreen(wx: number, wy: number): { sx: number; sy: number } {
    return {
      sx: (wx - this.x) * this.zoom + this.viewportWidth / 2,
      sy: (wy - this.y) * this.zoom + this.viewportHeight / 2
    };
  }

  public screenToWorld(sx: number, sy: number): { wx: number; wy: number } {
    return {
      wx: (sx - this.viewportWidth / 2) / this.zoom + this.x,
      wy: (sy - this.viewportHeight / 2) / this.zoom + this.y
    };
  }

  public getVisibleWorldBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    const halfW = (this.viewportWidth / 2) / this.zoom;
    const halfH = (this.viewportHeight / 2) / this.zoom;
    return {
      minX: this.x - halfW,
      minY: this.y - halfH,
      maxX: this.x + halfW,
      maxY: this.y + halfH
    };
  }

  private notify() {
    this.onChangeCallback?.();
  }
}
