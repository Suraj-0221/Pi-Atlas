import { describe, it, expect } from 'vitest';
import {
  KEYPAD_MAP,
  LETTER_NUM_MAP,
  normalizeName,
  encodeName,
  computeOdds
} from '../encode/name.ts';
import { chunkGreedy } from '../encode/chunking.ts';
import { subsequenceSearch } from '../encode/image.ts';

describe('1. Name Encodings and Normalization', () => {
  it('Keypad mapping covers every letter A-Z with ITU E.161 standard', () => {
    // 2=ABC, 3=DEF, 4=GHI, 5=JKL, 6=MNO, 7=PQRS, 8=TUV, 9=WXYZ
    const expectedKeypad: Record<string, number> = {
      A: 2, B: 2, C: 2,
      D: 3, E: 3, F: 3,
      G: 4, H: 4, I: 4,
      J: 5, K: 5, L: 5,
      M: 6, N: 6, O: 6,
      P: 7, Q: 7, R: 7, S: 7,
      T: 8, U: 8, V: 8,
      W: 9, X: 9, Y: 9, Z: 9
    };

    for (let code = 65; code <= 90; code++) {
      const char = String.fromCharCode(code);
      expect(KEYPAD_MAP[char]).toBe(expectedKeypad[char]);
    }
  });

  it('Letter Number mapping covers every letter A=01 through Z=26', () => {
    for (let i = 1; i <= 26; i++) {
      const char = String.fromCharCode(64 + i);
      const expectedStr = i.toString().padStart(2, '0');
      expect(LETTER_NUM_MAP[char]).toBe(expectedStr);
    }
  });

  it('Normalizes accents (NFD), drops spaces, punctuation, and converts to uppercase', () => {
    expect(normalizeName('  Éléonore-Chloé  ')).toBe('ELEONORECHLOE');
    expect(normalizeName('François 123 !?')).toBe('FRANCOIS');
    expect(normalizeName('Süraj Kümår')).toBe('SURAJKUMAR');
    expect(normalizeName('ñandu')).toBe('NANDU');
  });

  it('Generates correct mono conversion preview string for Keypad and Letter Number modes', () => {
    const keypadEnc = encodeName('Suraj', 'keypad');
    expect(keypadEnc.cleanName).toBe('SURAJ');
    expect(keypadEnc.previewStr).toBe('S=7 U=8 R=7 A=2 J=5 -> 78725');
    expect(keypadEnc.fullDigits).toEqual([7, 8, 7, 2, 5]);

    const letternumEnc = encodeName('Suraj', 'letter-number');
    expect(letternumEnc.cleanName).toBe('SURAJ');
    expect(letternumEnc.previewStr).toBe('S=19 U=21 R=18 A=01 J=10 -> 1921180110');
    expect(letternumEnc.fullDigits).toEqual([1, 9, 2, 1, 1, 8, 0, 1, 1, 0]);
  });
});

describe('2. Odds Function Verification', () => {
  it('matches 1 - exp(-N / 10^n) within 1e-9 tolerance', () => {
    const N = 10_000_000;
    for (let digits = 1; digits <= 12; digits++) {
      const calculated = computeOdds(digits, N);
      const exactFormula = 1 - Math.exp(-N / Math.pow(10, digits));
      expect(Math.abs(calculated - exactFormula)).toBeLessThan(1e-9);
    }

    // Specific user scenario verification:
    // 6 digits in 10M -> ~99.995%
    const odds6 = computeOdds(6, N);
    expect(odds6).toBeGreaterThan(0.9999);

    // 8 digits in 10M -> ~10% (1 - exp(-0.1) ≈ 0.09516)
    const odds8 = computeOdds(8, N);
    expect(odds8).toBeGreaterThan(0.095);
    expect(odds8).toBeLessThan(0.096);
  });
});

describe('3. Subsequence Search Verification', () => {
  it('positions are strictly increasing, digits[positions[k]] === level[k], span matches last position minus start + 1', () => {
    // Generate synthetic digit stream
    const syntheticDigits = new Uint8Array([
      3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8, 9, 7, 9, 3, 2, 3, 8, 4, 6, 2, 6, 4, 3, 3, 8, 3, 2, 7, 9, 5, 0
    ]);

    // Query levels for a 2x2 image = 4 pixels: [5, 9, 7, 0]
    const levels = new Uint8Array([5, 9, 7, 0]);
    const startDigitIndex = 2; // start search from digit index 2

    const result = subsequenceSearch(syntheticDigits, levels, startDigitIndex, 2, 2);

    expect(result.pixelCount).toBe(4);
    expect(result.positions.length).toBe(4);

    // Assert positions are strictly increasing
    for (let k = 1; k < result.positions.length; k++) {
      expect(result.positions[k]).toBeGreaterThan(result.positions[k - 1]);
    }

    // Assert digits at recorded positions match requested levels exactly
    for (let k = 0; k < result.positions.length; k++) {
      const pos = result.positions[k];
      expect(syntheticDigits[pos]).toBe(levels[k]);
    }

    // First matched level 5 at or after start index 2 is at index 4 (digits: 3, 1, 4, 1, [5])
    expect(result.positions[0]).toBe(4);

    // Span matches last position minus start position + 1
    const expectedSpan = result.positions[result.positions.length - 1] - result.positions[0] + 1;
    expect(result.span).toBe(expectedSpan);

    // Average gap matches (endPosition - startPosition) / (pixelCount - 1)
    const expectedGap = (result.positions[result.positions.length - 1] - result.positions[0]) / (levels.length - 1);
    expect(result.averageGap).toBeCloseTo(expectedGap, 2);
  });
});

describe('4. Name Chunking Verification', () => {
  it('pieces concatenate back to the full encoded string', () => {
    // Encoded digits for a long string
    const fullDigits = [7, 8, 7, 2, 5, 9, 2, 6, 5, 3, 5, 8, 9, 7, 9];

    // Mock search function that hits for segments <= 5 digits, misses for >= 6
    const mockSearch = (sub: number[]) => {
      if (sub.length <= 5) {
        return 1000 + sub[0]; // simulated hit
      }
      return -1; // simulated miss
    };

    const pieces = chunkGreedy(fullDigits, mockSearch);

    expect(pieces.length).toBeGreaterThan(1);

    // Concatenate all piece digits
    const reconstructedDigits: number[] = [];
    pieces.forEach(p => {
      reconstructedDigits.push(...p.digits);
    });

    expect(reconstructedDigits).toEqual(fullDigits);
    expect(pieces.map(p => p.patternStr).join('')).toBe(fullDigits.join(''));
  });

  it('correctly maps Einstein to telephone dial keypad sequence 34678346', () => {
    const encoded = encodeName('Einstein', 'keypad');
    expect(encoded.cleanName).toBe('EINSTEIN');
    expect(encoded.digits).toEqual([3, 4, 6, 7, 8, 3, 4, 6]);
    expect(encoded.digits.join('')).toBe('34678346');
  });
});
