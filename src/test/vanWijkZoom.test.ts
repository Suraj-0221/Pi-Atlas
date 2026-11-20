import { describe, it, expect } from 'vitest';
import { interpolateZoomPan, CameraState } from '../viz/vanWijkZoom.ts';

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

describe('vanWijkZoom (1a)', () => {
  it('checks the frame at p = 0.25 has a zoom ratio close to (z1/z0)^ease in near glide mode', () => {
    const start: CameraState = { x: 500, y: 500, zoom: 0.1 };
    const target: CameraState = { x: 505, y: 505, zoom: 32.0 };
    const viewportWidth = 1200;

    const { duration, interpolate } = interpolateZoomPan(start, target, viewportWidth);

    expect(duration).toBeGreaterThanOrEqual(0.6);
    expect(duration).toBeLessThanOrEqual(1.1);

    const p = 0.25;
    const state = interpolate(p);

    const ease = easeInOutCubic(p);
    const expectedRatio = Math.pow(target.zoom / start.zoom, ease);
    const actualRatio = state.zoom / start.zoom;

    expect(actualRatio).toBeCloseTo(expectedRatio, 3);
  });

  it('ensures at p = 1 the camera equals the target exactly', () => {
    const start: CameraState = { x: 100, y: 200, zoom: 1.0 };
    const target: CameraState = { x: 150, y: 220, zoom: 16.0 };
    const viewportWidth = 1000;

    const { interpolate } = interpolateZoomPan(start, target, viewportWidth);
    const finalState = interpolate(1.0);

    expect(finalState.x).toBe(target.x);
    expect(finalState.y).toBe(target.y);
    expect(finalState.zoom).toBe(target.zoom);
  });
});
