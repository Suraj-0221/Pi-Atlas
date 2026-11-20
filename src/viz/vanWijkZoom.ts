/**
 * van Wijk and Nuij smooth zoom-and-pan interpolation (rho = 1.42)
 * Based on "Smooth and efficient zooming and panning" (InfoVis 2003).
 */

export interface CameraState {
  x: number;
  y: number;
  zoom: number; // pixels per world unit
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function interpolateZoomPan(
  start: CameraState,
  target: CameraState,
  viewportWidth: number,
  rho = 1.42
): { duration: number; interpolate: (t: number) => CameraState } {
  const x0 = start.x;
  const y0 = start.y;
  const w0 = viewportWidth / Math.max(0.0001, start.zoom);

  const x1 = target.x;
  const y1 = target.y;
  const w1 = viewportWidth / Math.max(0.0001, target.zoom);

  const dx = x1 - x0;
  const dy = y1 - y0;
  const d = Math.hypot(dx, dy);

  // If target is already within 3 screen widths (d < 3 * w0), skip zoom-out and just glide
  const isNear = d < 3.0 * w0;

  if (isNear) {
    const z0 = start.zoom;
    const z1 = target.zoom;
    const duration = Math.min(1.1, Math.max(0.6, 0.55 + 0.12 * Math.abs(Math.log(z1 / z0))));

    return {
      duration,
      interpolate: (p: number) => {
        if (p >= 1.0) {
          return { x: target.x, y: target.y, zoom: target.zoom };
        }
        const ease = easeInOutCubic(Math.min(1.0, Math.max(0.0, p)));
        const z = z0 * Math.pow(z1 / z0, ease);
        const frac = Math.abs(z0 - z1) < 1e-6
          ? ease
          : (1 / z0 - 1 / z) / (1 / z0 - 1 / z1);

        return {
          x: x0 + dx * frac,
          y: y0 + dy * frac,
          zoom: z
        };
      }
    };
  }

  // Pure zoom case (d == 0)
  if (d < 1e-6) {
    const duration = Math.min(1.0, Math.max(0.4, Math.abs(Math.log(w1 / w0)) / rho));
    return {
      duration,
      interpolate: (p: number) => {
        const ease = easeInOutCubic(p);
        const w = w0 * Math.pow(w1 / w0, ease);
        return {
          x: x0,
          y: y0,
          zoom: viewportWidth / w
        };
      }
    };
  }

  // General van Wijk and Nuij geodesic path
  const rho2 = rho * rho;
  const rho4 = rho2 * rho2;

  const b0 = (w1 * w1 - w0 * w0 + rho4 * d * d) / (2 * rho2 * d * w0);
  const b1 = (w1 * w1 - w0 * w0 - rho4 * d * d) / (2 * rho2 * d * w1);

  const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
  const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
  const S = (r1 - r0) / rho;

  // Raw duration based on path length, capped strictly at 1.2s (target 1.0s, max 1.2s)
  const rawDuration = S * 0.45;
  const duration = Math.min(1.2, Math.max(0.85, rawDuration));

  return {
    duration,
    interpolate: (p: number) => {
      const ease = easeInOutCubic(Math.min(1.0, Math.max(0.0, p)));
      const s = ease * S;

      const cosh_rs = Math.cosh(r0 + rho * s);
      const w = w0 * (Math.cosh(r0) / cosh_rs);
      const u = (w0 / (rho2 * d)) * (Math.cosh(r0) * Math.tanh(r0 + rho * s) - Math.sinh(r0));

      const frac = Math.min(1.0, Math.max(0.0, u));

      return {
        x: x0 + dx * frac,
        y: y0 + dy * frac,
        zoom: viewportWidth / w
      };
    }
  };
}
