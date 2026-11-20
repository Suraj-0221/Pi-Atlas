/**
 * Loads and unpacks 10M digits of pi from BCD binary or IndexedDB cache.
 */

import { idbGet, idbSet } from './idb.ts';

export const KNOWN_FIRST_50 = '14159265358979323846264338327950288419716939937510';
const CACHE_KEY = 'pi_10m_digits_v1';
const EXPECTED_DIGIT_COUNT = 10_000_000;
const EXPECTED_BYTE_COUNT = EXPECTED_DIGIT_COUNT / 2; // 5,000,000 bytes

export type ProgressCallback = (percent: number, label: string) => void;

/**
 * Unpacks 4-bit BCD bytes into an array of integer digit values (0..9).
 */
export function unpackBCD(packed: Uint8Array, targetDigitCount = EXPECTED_DIGIT_COUNT): Uint8Array {
  const digits = new Uint8Array(targetDigitCount);
  const packedLen = packed.length;
  for (let i = 0; i < packedLen; i++) {
    const byte = packed[i];
    const idx = i << 1;
    if (idx < targetDigitCount) {
      digits[idx] = (byte >> 4) & 0x0f;
    }
    if (idx + 1 < targetDigitCount) {
      digits[idx + 1] = byte & 0x0f;
    }
  }
  return digits;
}

/**
 * Verifies that the first 50 digits match the known mathematical constant.
 */
export function verifyFirst50(digits: Uint8Array): boolean {
  if (digits.length < 50) return false;
  let s = '';
  for (let i = 0; i < 50; i++) {
    s += digits[i].toString();
  }
  return s === KNOWN_FIRST_50;
}

/**
 * Loads the 10M digits via 10 parallel chunks (pi_00.bin to pi_09.bin),
 * utilizing IndexedDB for instantaneous subsequent visits.
 */
export async function loadPiDigits(
  onProgress?: ProgressCallback
): Promise<Uint8Array> {
  onProgress?.(5, 'Checking cache...');
  const cached = await idbGet<Uint8Array>(CACHE_KEY);
  if (cached && cached.length === EXPECTED_DIGIT_COUNT && verifyFirst50(cached)) {
    onProgress?.(100, 'Loaded from cache.');
    return cached;
  }

  onProgress?.(10, 'Fetching 10M digits...');

  const CHUNK_COUNT = 10;
  const chunkBytes = new Int32Array(CHUNK_COUNT);

  const reportProgress = () => {
    let sum = 0;
    for (let i = 0; i < CHUNK_COUNT; i++) sum += chunkBytes[i];
    const pct = Math.min(90, Math.round((sum / EXPECTED_BYTE_COUNT) * 85));
    onProgress?.(pct, `Loading π… ${pct}%`);
  };

  const fetchChunk = async (index: number): Promise<Uint8Array> => {
    const base = (import.meta.env.BASE_URL || './').replace(/\/$/, '');
    const filename = `${base}/pi_${index.toString().padStart(2, '0')}.bin`;
    const res = await fetch(filename);
    if (!res.ok) {
      throw new Error(`Failed to load ${filename}: ${res.status}`);
    }
    const reader = res.body?.getReader();
    if (!reader) {
      const buf = await res.arrayBuffer();
      chunkBytes[index] = buf.byteLength;
      reportProgress();
      return new Uint8Array(buf);
    }
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      chunkBytes[index] = received;
      reportProgress();
    }
    const out = new Uint8Array(received);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  };

  const results = await Promise.all(
    Array.from({ length: CHUNK_COUNT }, (_, i) => fetchChunk(i))
  );

  onProgress?.(92, 'Assembling chunks...');
  const packed = new Uint8Array(EXPECTED_BYTE_COUNT);
  let totalOffset = 0;
  for (let i = 0; i < CHUNK_COUNT; i++) {
    packed.set(results[i], totalOffset);
    totalOffset += results[i].length;
  }

  onProgress?.(96, 'Unpacking BCD into 10,000,000 digits...');
  const digits = unpackBCD(packed);

  if (!verifyFirst50(digits)) {
    throw new Error('Verification failed: first 50 digits do not match known reference.');
  }

  onProgress?.(98, 'Caching in IndexedDB...');
  await idbSet(CACHE_KEY, digits);

  onProgress?.(100, 'Ready.');
  return digits;
}
