/**
 * Deep Link parsing and URL building for π Atlas.
 * URL scheme uses query parameters:
 *   /?d=14051998      (DDMMYYYY real calendar date)
 *   /?n=einstein      (letters only, 1-20 characters)
 *   /?vs=14051998     (challenge date)
 *   &ref=share        (optional attribution)
 *
 * Privacy rule: Images are NEVER included in URLs.
 */

export interface DateParts {
  day: number;
  month: number;
  year: number;
  raw: string; // e.g. "14051998"
}

export interface ParsedDeepLink {
  d?: DateParts;
  n?: string;
  vs?: DateParts;
  ref?: string;
}

/**
 * Validates whether day, month, year forms a genuine calendar date.
 * Accurately handles leap years (including century leap rules).
 */
export function isValidCalendarDate(day: number, month: number, year: number): boolean {
  if (isNaN(day) || isNaN(month) || isNaN(year)) return false;
  if (year < 1000 || year > 9999) return false;
  if (month < 1 || month > 12) return false;

  const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  return day >= 1 && day <= daysInMonth[month - 1];
}

/**
 * Parses and validates an 8-digit DDMMYYYY string.
 * Returns null if invalid or not a real calendar date.
 */
export function parseDateParam(raw: string | null): DateParts | null {
  if (!raw || !/^\d{8}$/.test(raw)) return null;

  const day = parseInt(raw.slice(0, 2), 10);
  const month = parseInt(raw.slice(2, 4), 10);
  const year = parseInt(raw.slice(4, 8), 10);

  if (!isValidCalendarDate(day, month, year)) {
    return null;
  }

  return { day, month, year, raw };
}

/**
 * Parses and validates a name string: letters only, 1-20 characters.
 */
export function parseNameParam(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!/^[a-zA-Z]{1,20}$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Parses the current query string or a provided search string.
 * Invalid params are silently ignored.
 */
export function parseDeepLink(searchString?: string): ParsedDeepLink {
  const search = searchString ?? (typeof window !== 'undefined' ? window.location.search : '');
  const params = new URLSearchParams(search);

  const result: ParsedDeepLink = {};

  const dParam = parseDateParam(params.get('d'));
  if (dParam) result.d = dParam;

  const nParam = parseNameParam(params.get('n'));
  if (nParam) result.n = nParam;

  const vsParam = parseDateParam(params.get('vs'));
  if (vsParam) result.vs = vsParam;

  const ref = params.get('ref');
  if (ref && /^[a-zA-Z0-9_-]{1,20}$/.test(ref)) {
    result.ref = ref;
  }

  return result;
}

/**
 * Formats a date into 8-digit DDMMYYYY string.
 */
export function formatDateToParam(day: number, month: number, year: number): string {
  const d = day.toString().padStart(2, '0');
  const m = month.toString().padStart(2, '0');
  const y = year.toString().padStart(4, '0');
  return `${d}${m}${y}`;
}

/**
 * Builds a shareable query URL for a Date.
 */
export function buildDateUrl(day: number, month: number, year: number, ref?: string, baseUrl?: string): string {
  const base = baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const d = formatDateToParam(day, month, year);
  const search = new URLSearchParams({ d });
  if (ref) search.set('ref', ref);
  return `${base}/?${search.toString()}`;
}

/**
 * Builds a shareable query URL for a Name.
 */
export function buildNameUrl(name: string, ref?: string, baseUrl?: string): string {
  const base = baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const clean = name.replace(/[^a-zA-Z]/g, '').slice(0, 20);
  const search = new URLSearchParams({ n: clean });
  if (ref) search.set('ref', ref);
  return `${base}/?${search.toString()}`;
}

/**
 * Builds a challenge query URL for duel mode.
 */
export function buildVsUrl(day: number, month: number, year: number, ref = 'share', baseUrl?: string): string {
  const base = baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const vs = formatDateToParam(day, month, year);
  const search = new URLSearchParams({ vs });
  if (ref) search.set('ref', ref);
  return `${base}/?${search.toString()}`;
}
