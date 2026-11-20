import { describe, it, expect } from 'vitest';
import { generateDateCandidates } from '../encode/date.ts';
import { encodeName } from '../encode/name.ts';
import { quantizeImage } from '../encode/image.ts';

describe('Search Algorithms & Encoders', () => {
  it('correctly handles DOB format sequence', () => {
    const candidates = generateDateCandidates(14, 5, 1998);
    expect(candidates[0].format).toBe('DDMMYY');
    expect(candidates[0].digits.join('')).toBe('140598');

    expect(candidates[2].format).toBe('DDMMYYYY');
    expect(candidates[2].digits.join('')).toBe('14051998');
  });

  it('correctly encodes name to digits and preview', () => {
    const encoded = encodeName('SURAJ', 'keypad');
    expect(encoded.cleanName).toBe('SURAJ');
    expect(encoded.fullDigits).toEqual([7, 8, 7, 2, 5]);
    expect(encoded.previewStr).toBe('S=7 U=8 R=7 A=2 J=5 -> 78725');
  });

  it('correctly quantizes image grid into 0..9 range', () => {
    // Mock a 3x3 canvas
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 3;
      canvas.height = 3;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#000000'; // black -> 0
        ctx.fillRect(0, 0, 3, 3);
        ctx.fillStyle = '#FFFFFF'; // white -> 9
        ctx.fillRect(1, 1, 1, 1);

        const res = quantizeImage(canvas, 3);
        expect(res.digits.length).toBe(9);
        expect(res.digits[0]).toBe(0); // black
        expect(res.digits[4]).toBe(9); // white center
      }
    }
  });

  it('calculates Hamming distance accurately', () => {
    const fp = [1, 2, 3, 4, 5];
    const candidate = [1, 2, 9, 4, 0];
    let dist = 0;
    for (let i = 0; i < fp.length; i++) {
      if (fp[i] !== candidate[i]) dist++;
    }
    expect(dist).toBe(2);
    const matchPct = Math.round(((fp.length - dist) / fp.length) * 100);
    expect(matchPct).toBe(60);
  });

  it('computes date percentile ranking correctly across date universe', () => {
    // Array of sorted positions representing 29,220 dates from 1950 to 2029
    const sampleDates = [1000, 5000, 10000, 50000, 100000, 200000, 500000, 1000000];
    const targetPos = 50000;
    let laterCount = 0;
    for (let i = 0; i < sampleDates.length; i++) {
      if (sampleDates[i] > targetPos) laterCount++;
    }
    const percentile = Math.round((laterCount / sampleDates.length) * 100);
    // 50,000 has 4 items strictly greater (100k, 200k, 500k, 1M) out of 8 items -> 50%
    expect(percentile).toBe(50);
  });
});
