/**
 * Name Normalization and Encoders:
 * 1. Keypad (1 digit per letter: ABC=2, DEF=3, GHI=4, JKL=5, MNO=6, PQRS=7, TUV=8, WXYZ=9)
 * 2. Letter Number (2 digits per letter: A=01 to Z=26)
 * Contiguous search only.
 */

export type NameEncodingMode = 'keypad' | 'letter-number';

export const KEYPAD_MAP: Record<string, number> = {
  A: 2, B: 2, C: 2,
  D: 3, E: 3, F: 3,
  G: 4, H: 4, I: 4,
  J: 5, K: 5, L: 5,
  M: 6, N: 6, O: 6,
  P: 7, Q: 7, R: 7, S: 7,
  T: 8, U: 8, V: 8,
  W: 9, X: 9, Y: 9, Z: 9
};

export const LETTER_NUM_MAP: Record<string, string> = {
  A: '01', B: '02', C: '03', D: '04', E: '05', F: '06', G: '07', H: '08', I: '09', J: '10',
  K: '11', L: '12', M: '13', N: '14', O: '15', P: '16', Q: '17', R: '18', S: '19', T: '20',
  U: '21', V: '22', W: '23', X: '24', Y: '25', Z: '26'
};

/**
 * Normalizes input: uppercase, strip accents (NFD), drop non-letters.
 */
export function normalizeName(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}

/**
 * Normalizes multi-word input preserving word boundaries for first-name fallback.
 */
export function normalizeNameWords(input: string): string[] {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter(w => w.length > 0);
}

export interface KeypadLetterMapping {
  char: string;
  digit: number;
}

export interface LetterNumberMapping {
  char: string;
  codeStr: string;
  digits: [number, number];
}

export interface EncodedNameResult {
  mode: NameEncodingMode;
  rawName: string;
  cleanName: string;
  firstWord: string;
  digits: number[];
  fullDigits: number[];
  digitStr: string;
  previewStr: string; // e.g. "S=7 U=8 R=7 A=2 J=5 -> 78725"
  letterMap: { char: string; digitCount: number }[];
}

export function encodeName(input: string, mode: NameEncodingMode = 'keypad'): EncodedNameResult {
  const words = normalizeNameWords(input);
  const cleanName = words.join('');
  const firstWord = words.length > 0 ? words[0] : '';
  const digits: number[] = [];
  const previewPairs: string[] = [];
  const letterMap: { char: string; digitCount: number }[] = [];

  if (mode === 'keypad') {
    for (let i = 0; i < cleanName.length; i++) {
      const ch = cleanName[i];
      const d = KEYPAD_MAP[ch] || 2;
      digits.push(d);
      previewPairs.push(`${ch}=${d}`);
      letterMap.push({ char: ch, digitCount: 1 });
    }
  } else {
    for (let i = 0; i < cleanName.length; i++) {
      const ch = cleanName[i];
      const code = LETTER_NUM_MAP[ch] || '01';
      const d0 = parseInt(code[0], 10);
      const d1 = parseInt(code[1], 10);
      digits.push(d0, d1);
      previewPairs.push(`${ch}=${code}`);
      letterMap.push({ char: ch, digitCount: 2 });
    }
  }

  const digitStr = digits.join('');
  const previewStr = previewPairs.length > 0 ? `${previewPairs.join(' ')} -> ${digitStr}` : '';

  return {
    mode,
    rawName: input,
    cleanName,
    firstWord,
    digits,
    fullDigits: digits,
    digitStr,
    previewStr,
    letterMap
  };
}

/**
 * Computes chance = 1 - exp(-10,000,000 / 10^digits)
 */
export function computeOdds(numDigits: number, totalDigits: number = 10_000_000): number {
  if (numDigits <= 0) return 1;
  const lambda = totalDigits / Math.pow(10, numDigits);
  return 1 - Math.exp(-lambda);
}

export function formatOddsString(numDigits: number): string {
  if (numDigits <= 0) return '';
  const chance = computeOdds(numDigits);
  if (chance >= 0.99995) {
    return `${numDigits} digits: about 100% chance in 10M digits.`;
  }
  const pct = chance * 100;
  if (pct >= 0.1) {
    return `${numDigits} digits: about ${pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)}% chance in 10M digits.`;
  }
  return `${numDigits} digits: about ${pct.toExponential(1)}% chance in 10M digits.`;
}
