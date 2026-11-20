import { describe, it, expect } from 'vitest';
import { generateDateCandidates } from '../encode/date.ts';
import { encodeName } from '../encode/name.ts';
import { quantizeImage } from '../encode/image.ts';

describe('Date Candidate Generator', () => {
  it('generates candidates in correct order with leading zeros', () => {
    const candidates = generateDateCandidates(14, 5, 1998);
    const formats = candidates.map(c => c.format);
    expect(formats).toEqual(['DDMMYY', 'DMMYY', 'DDMMYYYY', 'YYYYMMDD', 'MMDDYY']);

    const ddmmyy = candidates.find(c => c.format === 'DDMMYY');
    expect(ddmmyy?.digits).toEqual([1, 4, 0, 5, 9, 8]);

    const ddmmyyyy = candidates.find(c => c.format === 'DDMMYYYY');
    expect(ddmmyyyy?.digits).toEqual([1, 4, 0, 5, 1, 9, 9, 8]);
  });
});

describe('Name Encoder', () => {
  it('maps A=01 through Z=26 in letter-number mode', () => {
    const encoded = encodeName('Suraj', 'letter-number');
    expect(encoded.cleanName).toBe('SURAJ');
    // S=19, U=21, R=18, A=01, J=10
    expect(encoded.previewStr).toBe('S=19 U=21 R=18 A=01 J=10 -> 1921180110');
    expect(encoded.fullDigits).toEqual([1, 9, 2, 1, 1, 8, 0, 1, 1, 0]);
  });

  it('maps Keypad 1-digit mode by default', () => {
    const encoded = encodeName('Suraj');
    expect(encoded.cleanName).toBe('SURAJ');
    expect(encoded.previewStr).toBe('S=7 U=8 R=7 A=2 J=5 -> 78725');
    expect(encoded.fullDigits).toEqual([7, 8, 7, 2, 5]);
  });
});
