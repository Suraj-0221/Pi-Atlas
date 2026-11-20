import { describe, it, expect } from 'vitest';
import {
  isValidCalendarDate,
  parseDateParam,
  parseNameParam,
  parseDeepLink,
  buildDateUrl,
  buildNameUrl,
  buildVsUrl
} from '../ui/deepLink.ts';

describe('Deep Link Parser & Builder', () => {
  describe('Calendar Date Validation', () => {
    it('validates standard valid dates', () => {
      expect(isValidCalendarDate(14, 5, 1998)).toBe(true);
      expect(isValidCalendarDate(1, 1, 2000)).toBe(true);
      expect(isValidCalendarDate(31, 12, 1999)).toBe(true);
    });

    it('rejects invalid dates (e.g. 31 Feb, 30 Feb)', () => {
      expect(isValidCalendarDate(31, 2, 2000)).toBe(false);
      expect(isValidCalendarDate(30, 2, 2024)).toBe(false);
      expect(isValidCalendarDate(31, 4, 2021)).toBe(false);
      expect(isValidCalendarDate(0, 5, 1998)).toBe(false);
      expect(isValidCalendarDate(14, 13, 1998)).toBe(false);
    });

    it('correctly validates leap years (including century rules)', () => {
      expect(isValidCalendarDate(29, 2, 2024)).toBe(true); // Leap
      expect(isValidCalendarDate(29, 2, 2000)).toBe(true); // Century leap (400 div)
      expect(isValidCalendarDate(29, 2, 2100)).toBe(false); // Century not leap
      expect(isValidCalendarDate(29, 2, 2023)).toBe(false); // Common year
    });
  });

  describe('Date Query Parameter Parsing (?d=)', () => {
    it('parses valid 8-digit DDMMYYYY dates', () => {
      const res = parseDateParam('14051998');
      expect(res).toEqual({
        day: 14,
        month: 5,
        year: 1998,
        raw: '14051998'
      });
    });

    it('silently rejects invalid dates like 31022000', () => {
      expect(parseDateParam('31022000')).toBeNull();
      expect(parseDateParam('29022023')).toBeNull();
      expect(parseDateParam('99999999')).toBeNull();
      expect(parseDateParam('14-05-1998')).toBeNull();
      expect(parseDateParam('140598')).toBeNull();
      expect(parseDateParam('')).toBeNull();
      expect(parseDateParam(null)).toBeNull();
    });
  });

  describe('Name Query Parameter Parsing (?n=)', () => {
    it('parses valid letters-only names up to 20 chars', () => {
      expect(parseNameParam('einstein')).toBe('einstein');
      expect(parseNameParam('Ada')).toBe('Ada');
      expect(parseNameParam('AlexanderTheGreat')).toBe('AlexanderTheGreat');
    });

    it('rejects numbers, symbols, spaces, or over 20 chars', () => {
      expect(parseNameParam('einstein123')).toBeNull();
      expect(parseNameParam('john doe')).toBeNull();
      expect(parseNameParam('a'.repeat(21))).toBeNull();
      expect(parseNameParam('')).toBeNull();
      expect(parseNameParam(null)).toBeNull();
    });
  });

  describe('Full Deep Link Parsing (?d=, ?n=, ?vs=, &ref=)', () => {
    it('parses date link ?d=14051998&ref=share', () => {
      const parsed = parseDeepLink('?d=14051998&ref=share');
      expect(parsed.d).toEqual({ day: 14, month: 5, year: 1998, raw: '14051998' });
      expect(parsed.ref).toBe('share');
      expect(parsed.n).toBeUndefined();
    });

    it('parses name link ?n=einstein', () => {
      const parsed = parseDeepLink('?n=einstein');
      expect(parsed.n).toBe('einstein');
      expect(parsed.d).toBeUndefined();
    });

    it('parses challenge duel link ?vs=14051998', () => {
      const parsed = parseDeepLink('?vs=14051998');
      expect(parsed.vs).toEqual({ day: 14, month: 5, year: 1998, raw: '14051998' });
    });

    it('silently ignores invalid parameters', () => {
      const parsed = parseDeepLink('?d=31022000&n=12345&vs=invalid');
      expect(parsed.d).toBeUndefined();
      expect(parsed.n).toBeUndefined();
      expect(parsed.vs).toBeUndefined();
    });
  });

  describe('URL Builders', () => {
    it('builds date URL ?d=DDMMYYYY', () => {
      const url = buildDateUrl(14, 5, 1998, undefined, 'https://pi-atlas.org');
      expect(url).toBe('https://pi-atlas.org/?d=14051998');
    });

    it('builds date URL with ref=share', () => {
      const url = buildDateUrl(3, 11, 1971, 'share', 'https://pi-atlas.org');
      expect(url).toBe('https://pi-atlas.org/?d=03111971&ref=share');
    });

    it('builds name URL ?n=...', () => {
      const url = buildNameUrl('Einstein', undefined, 'https://pi-atlas.org');
      expect(url).toBe('https://pi-atlas.org/?n=Einstein');
    });

    it('builds challenge URL ?vs=DDMMYYYY&ref=share', () => {
      const url = buildVsUrl(14, 5, 1998, 'share', 'https://pi-atlas.org');
      expect(url).toBe('https://pi-atlas.org/?vs=14051998&ref=share');
    });
  });
});
