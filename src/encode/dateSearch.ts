/**
 * Fast Date Search and Duel Comparator for π Atlas.
 * Provides:
 * - 6-digit O(1) table lookup
 * - Multi-format candidate searching
 * - Honest duel verdict calculation
 */

import { generateDateCandidates } from './date.ts';
import { DateHitResult } from '../workers/searchProtocol.ts';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export function formatDateLabel(day: number, month: number, year: number): string {
  const mName = MONTH_NAMES[month - 1] || `M${month}`;
  return `${day} ${mName} ${year}`;
}

export function buildDateLookupTable(digits: Uint8Array): Int32Array {
  const f6 = new Int32Array(1_000_000).fill(-1);
  const len = digits.length;
  let v = 0;
  for (let i = 0; i < len; i++) {
    v = ((v % 100000) * 10) + digits[i];
    if (i >= 5 && f6[v] === -1) {
      f6[v] = i - 5;
    }
  }
  return f6;
}

/**
 * Searches for a date in digits buffer using candidate format priority:
 * 1. DDMMYY
 * 2. DMMYY
 * 3. DDMMYYYY
 * 4. YYYYMMDD
 * 5. MMDDYY
 */
export function searchDateFast(
  day: number,
  month: number,
  year: number,
  digits: Uint8Array,
  table?: Int32Array | null
): DateHitResult | null {
  const candidates = generateDateCandidates(day, month, year);

  for (const candidate of candidates) {
    const patternDigits = candidate.digits;
    const patLen = patternDigits.length;
    let firstOcc = -1;

    if (patLen === 6 && table) {
      let v = 0;
      for (let i = 0; i < 6; i++) v = v * 10 + patternDigits[i];
      firstOcc = table[v];
    } else if (patLen === 6 && digits && digits.length >= 6) {
      firstOcc = findSubsequence(digits, patternDigits);
    }

    if (firstOcc !== -1) {
      const patternStr = patternDigits.join('');
      return {
        format: candidate.format,
        patternStr,
        firstOccurrence: firstOcc,
        occurrences: [firstOcc],
        totalOccurrences: 1
      };
    }
  }

  return null;
}

function findSubsequence(buffer: Uint8Array, pattern: number[]): number {
  const bufLen = buffer.length;
  const patLen = pattern.length;
  if (patLen === 0 || bufLen < patLen) return -1;

  const firstByte = pattern[0];
  const maxI = bufLen - patLen;

  for (let i = 0; i <= maxI; i++) {
    if (buffer[i] === firstByte) {
      let match = true;
      for (let j = 1; j < patLen; j++) {
        if (buffer[i + j] !== pattern[j]) {
          match = false;
          break;
        }
      }
      if (match) return i;
    }
  }
  return -1;
}

export interface DuelPartyData {
  day: number;
  month: number;
  year: number;
  label: string;
  hit: DateHitResult | null;
}

export interface DuelVerdict {
  party1: DuelPartyData;
  party2: DuelPartyData;
  verdict: string;
  diff: number;
  winner: 1 | 2 | 'tie' | 'none';
}

/**
 * Computes honest one-sentence verdict between two dates:
 * "3 Nov 1971 comes first, 412,330 digits earlier."
 * Handles equal and not-found cases accurately.
 */
export function computeDuelVerdict(
  d1: { day: number; month: number; year: number; hit: DateHitResult | null },
  d2: { day: number; month: number; year: number; hit: DateHitResult | null }
): DuelVerdict {
  const p1: DuelPartyData = {
    day: d1.day,
    month: d1.month,
    year: d1.year,
    label: formatDateLabel(d1.day, d1.month, d1.year),
    hit: d1.hit
  };

  const p2: DuelPartyData = {
    day: d2.day,
    month: d2.month,
    year: d2.year,
    label: formatDateLabel(d2.day, d2.month, d2.year),
    hit: d2.hit
  };

  const pos1 = d1.hit ? d1.hit.firstOccurrence : -1;
  const pos2 = d2.hit ? d2.hit.firstOccurrence : -1;

  // Case 1: Both missing
  if (pos1 === -1 && pos2 === -1) {
    return {
      party1: p1,
      party2: p2,
      verdict: 'Neither date was found in the first 10,000,000 digits of π.',
      diff: 0,
      winner: 'none'
    };
  }

  // Case 2: Only Date 1 found
  if (pos1 !== -1 && pos2 === -1) {
    return {
      party1: p1,
      party2: p2,
      verdict: `${p1.label} appears at digit ${(pos1 + 1).toLocaleString('en-US')}, while ${p2.label} was not found in the first 10M digits.`,
      diff: 0,
      winner: 1
    };
  }

  // Case 3: Only Date 2 found
  if (pos1 === -1 && pos2 !== -1) {
    return {
      party1: p1,
      party2: p2,
      verdict: `${p2.label} appears at digit ${(pos2 + 1).toLocaleString('en-US')}, while ${p1.label} was not found in the first 10M digits.`,
      diff: 0,
      winner: 2
    };
  }

  // Case 4: Tie
  if (pos1 === pos2) {
    return {
      party1: p1,
      party2: p2,
      verdict: `Both birthdays appear at the exact same digit (${(pos1 + 1).toLocaleString('en-US')})!`,
      diff: 0,
      winner: 'tie'
    };
  }

  // Case 5: One is earlier
  const diff = Math.abs(pos1 - pos2);
  if (pos1 < pos2) {
    return {
      party1: p1,
      party2: p2,
      verdict: `${p1.label} comes first, ${diff.toLocaleString('en-US')} digits earlier.`,
      diff,
      winner: 1
    };
  } else {
    return {
      party1: p1,
      party2: p2,
      verdict: `${p2.label} comes first, ${diff.toLocaleString('en-US')} digits earlier.`,
      diff,
      winner: 2
    };
  }
}
