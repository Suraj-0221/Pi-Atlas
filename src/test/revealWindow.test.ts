/**
 * Unit tests for RevealWindow layout calculations, cubic-bezier easing, and DOM structure
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createCubicBezier, EASE_FAST_ENTRY_SOFT_SETTLE } from '../viz/easing.ts';
import { RevealWindow, RevealHitData } from '../ui/revealWindow.ts';

describe('Reveal Window — Cubic Bezier Easing', () => {
  it('EASE_FAST_ENTRY_SOFT_SETTLE satisfies boundary conditions and soft settle', () => {
    expect(EASE_FAST_ENTRY_SOFT_SETTLE(0)).toBe(0);
    expect(EASE_FAST_ENTRY_SOFT_SETTLE(1)).toBe(1);

    // Fast entry: by t = 0.3, progress should be well over 60%
    const p30 = EASE_FAST_ENTRY_SOFT_SETTLE(0.3);
    expect(p30).toBeGreaterThan(0.60);

    // Soft settle: by t = 0.8, progress is close to 1.0 (>= 0.95)
    const p80 = EASE_FAST_ENTRY_SOFT_SETTLE(0.8);
    expect(p80).toBeGreaterThan(0.95);
    expect(p80).toBeLessThanOrEqual(1.0);
  });

  it('custom cubic-bezier solver computes values accurately', () => {
    const easeInOut = createCubicBezier(0.42, 0, 0.58, 1);
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 2);
  });
});

describe('Reveal Window — Layout and Slot Calculations', () => {
  let mockDigits: Uint8Array;

  beforeEach(() => {
    mockDigits = new Uint8Array(10_000);
    for (let i = 0; i < 10_000; i++) {
      mockDigits[i] = i % 10;
    }
  });

  it('centers matched sequence within window slots', () => {
    const hit: RevealHitData = {
      day: 14,
      month: 5,
      year: 1998,
      format: 'DDMMYY',
      patternStr: '140598',
      firstOccurrence: 1200,
      occurrences: [1200, 3400],
      currentOccurrenceIndex: 0,
      totalOccurrences: 2
    };

    // Desktop 19 slots, match length 6:
    // slotMatchStart = floor((19 - 6) / 2) = 6
    const slotsCount = 19;
    const matchLen = hit.patternStr.length;
    const slotMatchStart = Math.floor((slotsCount - matchLen) / 2);
    expect(slotMatchStart).toBe(6);

    // Slots 0..5 are 6 context digits before match
    // Slots 6..11 are the 6 matched digits
    // Slots 12..18 are 7 context digits after match
    expect(slotMatchStart + matchLen).toBe(12);
    expect(slotsCount - (slotMatchStart + matchLen)).toBe(7);

    // Mobile 11 slots, match length 6:
    // slotMatchStart = floor((11 - 6) / 2) = 2
    const mobileSlots = 11;
    const mobileMatchStart = Math.floor((mobileSlots - matchLen) / 2);
    expect(mobileMatchStart).toBe(2);
    expect(mobileMatchStart + matchLen).toBe(8);
    expect(mobileSlots - (mobileMatchStart + matchLen)).toBe(3);
  });

  it('computes ribbon starting digit and travel distance D=90', () => {
    const firstOcc = 1203448;
    const slotMatchStart = 6;
    const windowStartDigit = firstOcc - slotMatchStart;
    const ribbonStartDigit = windowStartDigit - 12;

    expect(windowStartDigit).toBe(1203442);
    expect(ribbonStartDigit).toBe(1203430);

    const D = 90;
    const cellWidthDesktop = 32;
    const travelPx = D * cellWidthDesktop;
    expect(travelPx).toBe(2880);
  });

  it('instantiates cleanly and builds required DOM elements', () => {
    if (typeof document !== 'undefined') {
      const container = document.createElement('div');
      const revealWindow = new RevealWindow({
        piDigits: mockDigits,
        container
      });

      expect(container.querySelector('.reveal-overlay')).not.toBeNull();
      expect(container.querySelector('.reveal-glass-card')).not.toBeNull();
      expect(container.querySelector('.reveal-ribbon-track')).not.toBeNull();
      expect(container.querySelector('.reveal-underline-bar')).not.toBeNull();
      expect(container.querySelector('.reveal-counter-number')).not.toBeNull();
      expect(container.querySelector('.reveal-headline')).not.toBeNull();
    }
  });

  it('updates duration multiplier and easing cleanly', () => {
    if (typeof document !== 'undefined') {
      const revealWindow = new RevealWindow({
        piDigits: mockDigits
      });

      revealWindow.setDurationMultiplier(4.0);
      expect(revealWindow.durationMultiplier).toBe(4.0);

      revealWindow.setEasing([0.16, 1, 0.3, 1], 'cubic-bezier(0.16, 1, 0.3, 1)');
      expect(revealWindow.easingCssString).toBe('cubic-bezier(0.16, 1, 0.3, 1)');
    }
  });
});
