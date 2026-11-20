/**
 * High-precision cubic-bezier solver for synchronizing JS numbers with CSS Web Animations
 */

export function createCubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  // If linear
  if (x1 === y1 && x2 === y2) return (t: number) => t;

  const sampleCurveX = (t: number) => {
    return ((1 - 3 * x2 + 3 * x1) * t + (3 * x2 - 6 * x1)) * t * t + 3 * x1 * t;
  };

  const sampleCurveY = (t: number) => {
    return ((1 - 3 * y2 + 3 * y1) * t + (3 * y2 - 6 * y1)) * t * t + 3 * y1 * t;
  };

  const sampleCurveDerivativeX = (t: number) => {
    return (3 * (1 - 3 * x2 + 3 * x1) * t + 2 * (3 * x2 - 6 * x1)) * t + 3 * x1;
  };

  // Solve for t given x with Newton-Raphson
  const solveCurveX = (x: number): number => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const currentX = sampleCurveX(t) - x;
      if (Math.abs(currentX) < 1e-6) return t;
      const dX = sampleCurveDerivativeX(t);
      if (Math.abs(dX) < 1e-6) break;
      t -= currentX / dX;
    }

    // Binary search fallback
    let t0 = 0.0;
    let t1 = 1.0;
    t = x;

    if (t < t0) return t0;
    if (t > t1) return t1;

    while (t0 < t1) {
      const currentX = sampleCurveX(t);
      if (Math.abs(currentX - x) < 1e-6) return t;
      if (x > currentX) t0 = t;
      else t1 = t;
      t = (t1 + t0) * 0.5;
    }
    return t;
  };

  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return sampleCurveY(solveCurveX(x));
  };
}

export const EASE_FAST_ENTRY_SOFT_SETTLE = createCubicBezier(0.22, 1, 0.36, 1);
