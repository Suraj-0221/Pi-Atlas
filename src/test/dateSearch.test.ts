import { describe, it, expect } from 'vitest';
import {
  buildDateLookupTable,
  searchDateFast,
  computeDuelVerdict,
  formatDateLabel
} from '../encode/dateSearch.ts';

describe('Date Search & Duel Comparator', () => {
  it('formats dates consistently without emoji', () => {
    expect(formatDateLabel(14, 5, 1998)).toBe('14 May 1998');
    expect(formatDateLabel(3, 11, 1971)).toBe('3 Nov 1971');
    expect(formatDateLabel(1, 1, 2000)).toBe('1 Jan 2000');
  });

  it('computes one-sentence duel verdict when party 2 is earlier', () => {
    const d1 = {
      day: 14,
      month: 5,
      year: 1998,
      hit: {
        format: 'DDMMYY',
        patternStr: '140598',
        firstOccurrence: 600000,
        occurrences: [600000],
        totalOccurrences: 10
      }
    };
    const d2 = {
      day: 3,
      month: 11,
      year: 1971,
      hit: {
        format: 'DDMMYY',
        patternStr: '031171',
        firstOccurrence: 187670,
        occurrences: [187670],
        totalOccurrences: 8
      }
    };

    const res = computeDuelVerdict(d1, d2);
    expect(res.winner).toBe(2);
    expect(res.diff).toBe(412330);
    expect(res.verdict).toBe('3 Nov 1971 comes first, 412,330 digits earlier.');
  });

  it('computes one-sentence duel verdict when party 1 is earlier', () => {
    const d1 = {
      day: 1,
      month: 1,
      year: 1980,
      hit: {
        format: 'DDMMYY',
        patternStr: '010180',
        firstOccurrence: 50000,
        occurrences: [50000],
        totalOccurrences: 15
      }
    };
    const d2 = {
      day: 25,
      month: 12,
      year: 1995,
      hit: {
        format: 'DDMMYY',
        patternStr: '251295',
        firstOccurrence: 150000,
        occurrences: [150000],
        totalOccurrences: 9
      }
    };

    const res = computeDuelVerdict(d1, d2);
    expect(res.winner).toBe(1);
    expect(res.diff).toBe(100000);
    expect(res.verdict).toBe('1 Jan 1980 comes first, 100,000 digits earlier.');
  });

  it('handles equal positions honestly', () => {
    const d1 = {
      day: 14,
      month: 5,
      year: 1998,
      hit: {
        format: 'DDMMYY',
        patternStr: '140598',
        firstOccurrence: 288541,
        occurrences: [288541],
        totalOccurrences: 11
      }
    };
    const d2 = {
      day: 14,
      month: 5,
      year: 1998,
      hit: {
        format: 'DDMMYY',
        patternStr: '140598',
        firstOccurrence: 288541,
        occurrences: [288541],
        totalOccurrences: 11
      }
    };

    const res = computeDuelVerdict(d1, d2);
    expect(res.winner).toBe('tie');
    expect(res.verdict).toContain('exact same digit (288,542)');
  });

  it('handles not found cases honestly', () => {
    const d1 = {
      day: 1,
      month: 1,
      year: 2000,
      hit: null
    };
    const d2 = {
      day: 2,
      month: 2,
      year: 2000,
      hit: null
    };

    const bothMiss = computeDuelVerdict(d1, d2);
    expect(bothMiss.winner).toBe('none');
    expect(bothMiss.verdict).toBe('Neither date was found in the first 10,000,000 digits of π.');

    const oneMiss = computeDuelVerdict(
      {
        day: 14,
        month: 5,
        year: 1998,
        hit: {
          format: 'DDMMYY',
          patternStr: '140598',
          firstOccurrence: 288541,
          occurrences: [288541],
          totalOccurrences: 11
        }
      },
      d2
    );
    expect(oneMiss.winner).toBe(1);
    expect(oneMiss.verdict).toContain('while 2 Feb 2000 was not found in the first 10M digits.');
  });

  it('builds lookup table and performs fast searches', () => {
    // 3.14159265358979323846...
    // Pattern 140598 inserted at index 10:
    const mockDigits = new Uint8Array(100);
    const pattern = [1, 4, 0, 5, 9, 8];
    for (let i = 0; i < pattern.length; i++) {
      mockDigits[10 + i] = pattern[i];
    }

    const table = buildDateLookupTable(mockDigits);
    expect(table[140598]).toBe(10);

    const hit = searchDateFast(14, 5, 1998, mockDigits, table);
    expect(hit).not.toBeNull();
    expect(hit?.firstOccurrence).toBe(10);
    expect(hit?.patternStr).toBe('140598');
  });
});
