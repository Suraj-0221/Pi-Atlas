/**
 * Date of Birth multi-format generator
 * Generates formats in order: DDMMYY, DMMYY, DDMMYYYY, YYYYMMDD, MMDDYY
 */

import { DateCandidate } from '../workers/searchProtocol.ts';

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

export function generateDateCandidates(day: number, month: number, year: number): DateCandidate[] {
  const dd = pad2(day);
  const d = day.toString();
  const mm = pad2(month);
  const m = month.toString();

  const yyyy = year.toString().padStart(4, '0');
  const yy = yyyy.slice(-2);

  // Formats in strict priority order per specification
  const formats: { format: string; str: string }[] = [
    { format: 'DDMMYY', str: `${dd}${mm}${yy}` },
    { format: 'DMMYY', str: `${d}${m}${yy}` },
    { format: 'DDMMYYYY', str: `${dd}${mm}${yyyy}` },
    { format: 'YYYYMMDD', str: `${yyyy}${mm}${dd}` },
    { format: 'MMDDYY', str: `${mm}${dd}${yy}` }
  ];

  // Remove duplicates if e.g. DD == D
  const seen = new Set<string>();
  const candidates: DateCandidate[] = [];

  for (const item of formats) {
    if (!seen.has(item.str)) {
      seen.add(item.str);
      const digits = item.str.split('').map(ch => parseInt(ch, 10));
      candidates.push({
        format: item.format,
        digits
      });
    }
  }

  return candidates;
}
