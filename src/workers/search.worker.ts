/**
 * High-performance digit search Web Worker:
 * - Cancels prior requests when a new request arrives or CANCEL is posted.
 * - Date search with immediate first-hit streaming.
 * - Name contiguous search (full -> first name -> greedy chunks).
 * - Image preprocessing (bilinear downsampling, auto-levels, Floyd-Steinberg dithering).
 * - Exact subsequence search with Uint32Array transferred buffers (zero structured clone).
 */

import {
  SearchWorkerRequest,
  SearchWorkerResponse,
  DateHitResult,
  DateSearchResult,
  NameSearchOutput
} from './searchProtocol.ts';
import { chunkGreedy } from '../encode/chunking.ts';

let digits: Uint8Array | null = null;
let activeRequestId: number | null = null;

// Precomputed lookup tables (Task 3a)
let first6: Int32Array | null = null;
let count6: Uint16Array | null = null;
let first5: Int32Array | null = null;
let first4: Int32Array | null = null;
let first3: Int32Array | null = null;
let first2: Int32Array | null = null;
let first1: Int32Array | null = null;

// Precomputed sorted positions for all dates from 1 Jan 1950 to 31 Dec 2029 (Task 3d)
let datePositionsSorted: number[] | null = null;

function buildLookupTables(buf: Uint8Array) {
  const f6 = new Int32Array(1_000_000).fill(-1);
  const c6 = new Uint16Array(1_000_000);
  const f5 = new Int32Array(100_000).fill(-1);
  const f4 = new Int32Array(10_000).fill(-1);
  const f3 = new Int32Array(1_000).fill(-1);
  const f2 = new Int32Array(100).fill(-1);
  const f1 = new Int32Array(10).fill(-1);

  const len = buf.length;
  let v = 0;
  for (let i = 0; i < len; i++) {
    v = ((v % 100000) * 10) + buf[i];
    if (i >= 5) {
      if (f6[v] === -1) f6[v] = i - 5;
      if (c6[v] < 65535) c6[v]++;
    }
  }

  // Derive first5 from first6
  for (let v5 = 0; v5 < 100000; v5++) {
    let minOcc = -1;
    const base = v5 * 10;
    for (let d = 0; d < 10; d++) {
      const occ = f6[base + d];
      if (occ !== -1 && (minOcc === -1 || occ < minOcc)) minOcc = occ;
    }
    f5[v5] = minOcc;
  }
  let p5 = 0;
  for (let i = 0; i < 5; i++) p5 = p5 * 10 + buf[i];
  f5[p5] = 0;

  // Derive first4 from first5
  for (let v4 = 0; v4 < 10000; v4++) {
    let minOcc = -1;
    const base = v4 * 10;
    for (let d = 0; d < 10; d++) {
      const occ = f5[base + d];
      if (occ !== -1 && (minOcc === -1 || occ < minOcc)) minOcc = occ;
    }
    f4[v4] = minOcc;
  }
  let p4 = 0;
  for (let i = 0; i < 4; i++) p4 = p4 * 10 + buf[i];
  f4[p4] = 0;

  // Derive first3 from first4
  for (let v3 = 0; v3 < 1000; v3++) {
    let minOcc = -1;
    const base = v3 * 10;
    for (let d = 0; d < 10; d++) {
      const occ = f4[base + d];
      if (occ !== -1 && (minOcc === -1 || occ < minOcc)) minOcc = occ;
    }
    f3[v3] = minOcc;
  }
  let p3 = 0;
  for (let i = 0; i < 3; i++) p3 = p3 * 10 + buf[i];
  f3[p3] = 0;

  // Derive first2 from first3
  for (let v2 = 0; v2 < 100; v2++) {
    let minOcc = -1;
    const base = v2 * 10;
    for (let d = 0; d < 10; d++) {
      const occ = f3[base + d];
      if (occ !== -1 && (minOcc === -1 || occ < minOcc)) minOcc = occ;
    }
    f2[v2] = minOcc;
  }
  let p2 = 0;
  for (let i = 0; i < 2; i++) p2 = p2 * 10 + buf[i];
  f2[p2] = 0;

  // Derive first1 from first2
  for (let v1 = 0; v1 < 10; v1++) {
    let minOcc = -1;
    const base = v1 * 10;
    for (let d = 0; d < 10; d++) {
      const occ = f2[base + d];
      if (occ !== -1 && (minOcc === -1 || occ < minOcc)) minOcc = occ;
    }
    f1[v1] = minOcc;
  }
  f1[buf[0]] = 0;

  first6 = f6;
  count6 = c6;
  first5 = f5;
  first4 = f4;
  first3 = f3;
  first2 = f2;
  first1 = f1;

  // Precompute sorted positions for all dates from 1950 to 2029
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const datePositions: number[] = [];
  for (let y = 1950; y <= 2029; y++) {
    const isLeap = (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
    daysInMonth[1] = isLeap ? 29 : 28;
    const yy = y % 100;
    for (let m = 1; m <= 12; m++) {
      for (let d = 1; d <= daysInMonth[m - 1]; d++) {
        const code = d * 10000 + m * 100 + yy;
        const pos = f6[code];
        datePositions.push(pos === -1 ? Infinity : pos);
      }
    }
  }
  datePositions.sort((a, b) => a - b);
  datePositionsSorted = datePositions;
}

function computeDatePercentile(targetPos: number): number {
  if (!datePositionsSorted || targetPos < 0) return 0;
  let laterCount = 0;
  const arr = datePositionsSorted;
  const total = arr.length;
  for (let i = 0; i < total; i++) {
    if (arr[i] > targetPos) laterCount++;
  }
  return Math.round((laterCount / total) * 100);
}

function findFirstAfter(
  buffer: Uint8Array,
  pattern: number[],
  startPos: number,
  limit: number = buffer.length
): number {
  const pLen = pattern.length;
  if (pLen === 0) return -1;
  const maxIdx = Math.min(buffer.length, limit) - pLen;
  const p0 = pattern[0];

  for (let i = startPos; i <= maxIdx; i++) {
    if (buffer[i] === p0) {
      let match = true;
      for (let j = 1; j < pLen; j++) {
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

function findAll(
  buffer: Uint8Array,
  pattern: number[],
  maxMatches: number = 1000
): number[] {
  const matches: number[] = [];
  const pLen = pattern.length;
  if (pLen === 0) return matches;
  const maxIdx = buffer.length - pLen;
  const p0 = pattern[0];

  for (let i = 0; i <= maxIdx; i++) {
    if (buffer[i] === p0) {
      let match = true;
      for (let j = 1; j < pLen; j++) {
        if (buffer[i + j] !== pattern[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        matches.push(i);
        if (matches.length >= maxMatches) break;
      }
    }
  }
  return matches;
}

self.onmessage = async (e: MessageEvent<SearchWorkerRequest>) => {
  const msg = e.data;

  try {
    switch (msg.type) {
      case 'INIT': {
        digits = msg.digits;
        buildLookupTables(msg.digits);
        self.postMessage({ type: 'INIT_DONE' } satisfies SearchWorkerResponse);
        break;
      }

      case 'CANCEL': {
        if (activeRequestId === msg.requestId) {
          activeRequestId = null;
        }
        break;
      }

      case 'SEARCH_DATE': {
        if (!digits) throw new Error('Worker digits not initialized');
        activeRequestId = msg.requestId;
        const reqId = msg.requestId;

        const hits: DateHitResult[] = [];
        const misses: { format: string; patternStr: string }[] = [];
        let firstHitPosted = false;

        // Pass 1: Quick check for first hit to stream immediately (O(1) table lookup for 6- and 5-digit formats)
        for (const candidate of msg.candidates) {
          if (activeRequestId !== reqId) return;
          const patternStr = candidate.digits.join('');
          let firstOcc = -1;
          let totalOcc: number | undefined = undefined;

          if (candidate.digits.length === 6 && first6) {
            const v6 = parseInt(patternStr, 10);
            firstOcc = first6[v6];
            totalOcc = count6 ? count6[v6] : undefined;
          } else if (candidate.digits.length === 5 && first5) {
            const v5 = parseInt(patternStr, 10);
            firstOcc = first5[v5];
          } else if (candidate.digits.length === 4 && first4) {
            const v4 = parseInt(patternStr, 10);
            firstOcc = first4[v4];
          } else if (candidate.digits.length === 3 && first3) {
            const v3 = parseInt(patternStr, 10);
            firstOcc = first3[v3];
          } else if (candidate.digits.length === 2 && first2) {
            const v2 = parseInt(patternStr, 10);
            firstOcc = first2[v2];
          } else if (candidate.digits.length === 1 && first1) {
            const v1 = parseInt(patternStr, 10);
            firstOcc = first1[v1];
          } else {
            firstOcc = findFirstAfter(digits, candidate.digits, 0);
          }

          if (firstOcc !== -1 && !firstHitPosted) {
            firstHitPosted = true;
            const percentile = computeDatePercentile(firstOcc);
            self.postMessage({
              type: 'DATE_FIRST_HIT',
              requestId: reqId,
              day: msg.day ?? 0,
              month: msg.month ?? 0,
              year: msg.year ?? 0,
              hit: {
                format: candidate.format,
                patternStr,
                firstOccurrence: firstOcc,
                totalOccurrences: totalOcc,
                percentile
              }
            } satisfies SearchWorkerResponse);
            break;
          }
        }

        // Pass 2: Complete all occurrences and misses
        for (const candidate of msg.candidates) {
          if (activeRequestId !== reqId) return;
          const patternStr = candidate.digits.join('');

          // Instant skip for absent 6-digit or 5-digit patterns
          if (candidate.digits.length === 6 && first6) {
            const v6 = parseInt(patternStr, 10);
            if (first6[v6] === -1) {
              misses.push({ format: candidate.format, patternStr });
              continue;
            }
          } else if (candidate.digits.length === 5 && first5) {
            const v5 = parseInt(patternStr, 10);
            if (first5[v5] === -1) {
              misses.push({ format: candidate.format, patternStr });
              continue;
            }
          }

          const occurrences = findAll(digits, candidate.digits, 1000);
          if (occurrences.length > 0) {
            hits.push({
              format: candidate.format,
              patternStr,
              firstOccurrence: occurrences[0],
              occurrences,
              totalOccurrences: occurrences.length,
              percentile: computeDatePercentile(occurrences[0])
            });
          } else {
            misses.push({
              format: candidate.format,
              patternStr
            });
          }
        }

        if (activeRequestId !== reqId) return;

        const primaryHit = hits.length > 0 ? hits[0] : null;
        let explanation = '';
        let longerMissExplanation: string | undefined = undefined;

        if (primaryHit) {
          const missedLonger = misses.find(m => m.patternStr.length > primaryHit.patternStr.length);
          if (missedLonger) {
            longerMissExplanation = `${missedLonger.format} (${missedLonger.patternStr}) is not in these 10M digits; that is expected for 8-digit strings (about 10% chance).`;
          }
          explanation = `Format ${primaryHit.format}, digits ${primaryHit.patternStr}, first of ${primaryHit.totalOccurrences} occurrences.`;
        } else {
          explanation = `None of the formats for this date occur in the first 10,000,000 digits of pi. That is expected for 8-digit strings (~10% chance).`;
        }

        const result: DateSearchResult = {
          hits,
          misses,
          primaryHit,
          explanation,
          longerMissExplanation
        };

        self.postMessage({ type: 'DATE_RESULTS', requestId: reqId, result } satisfies SearchWorkerResponse);
        break;
      }

      case 'SEARCH_NAME': {
        if (!digits) throw new Error('Worker digits not initialized');
        activeRequestId = msg.requestId;
        const reqId = msg.requestId;

        const fullDigits = msg.fullDigits;
        const digitStr = fullDigits.join('');
        const mode = msg.mode;
        const cleanName = msg.cleanName;
        const manyToOneNote =
          mode === 'keypad'
            ? 'Keypad encoding is many-to-one: other words share these digits.'
            : undefined;

        // 1. Full name contiguous search
        const fullOccurrences = findAll(digits, fullDigits, 1000);
        if (activeRequestId !== reqId) return;

        if (fullOccurrences.length > 0) {
          const totalOccurrences = fullOccurrences.length;
          const firstOccurrence = fullOccurrences[0];
          const result: NameSearchOutput = {
            mode,
            cleanName,
            digitStr,
            totalOccurrences,
            occurrences: fullOccurrences,
            firstOccurrence,
            foundAs: 'full',
            explanation: `${cleanName} encodes as ${digitStr}. First of ${totalOccurrences} occurrences, at digit ${(firstOccurrence + 1).toLocaleString()}.`,
            manyToOneNote
          };
          self.postMessage({ type: 'NAME_RESULTS', requestId: reqId, result, silent: msg.silent } satisfies SearchWorkerResponse);
          break;
        }

        // 2. First name alone
        if (msg.firstWordDigits && msg.firstWordDigits.length > 0 && msg.firstWordDigits.length < fullDigits.length) {
          const fnOccurrences = findAll(digits, msg.firstWordDigits, 1000);
          if (activeRequestId !== reqId) return;

          if (fnOccurrences.length > 0) {
            const totalOccurrences = fnOccurrences.length;
            const firstOccurrence = fnOccurrences[0];
            const fnDigitStr = msg.firstWordDigits.join('');
            const result: NameSearchOutput = {
              mode,
              cleanName,
              digitStr,
              totalOccurrences,
              occurrences: fnOccurrences,
              firstOccurrence,
              foundAs: 'first-name',
              fallbackFirstName: msg.firstWordName,
              explanation: `The full name (${digitStr.length} digits) is not in these digits. Found first name "${msg.firstWordName}" as ${fnDigitStr}. First of ${totalOccurrences} occurrences, at digit ${(firstOccurrence + 1).toLocaleString()}.`,
              manyToOneNote
            };
            self.postMessage({ type: 'NAME_RESULTS', requestId: reqId, result, silent: msg.silent } satisfies SearchWorkerResponse);
            break;
          }
        }

        // 3. Fallback: greedy contiguous pieces
        const pieces = chunkGreedy(fullDigits, (sub) => findFirstAfter(digits!, sub, 0));
        if (activeRequestId !== reqId) return;

        const firstPiece = pieces[0];
        const firstOccurrence = firstPiece ? firstPiece.firstOccurrenceInPi : 0;
        const result: NameSearchOutput = {
          mode,
          cleanName,
          digitStr,
          totalOccurrences: pieces.length,
          occurrences: pieces.map(p => p.firstOccurrenceInPi),
          firstOccurrence,
          foundAs: 'pieces',
          pieces,
          explanation: `Found as ${pieces.length} pieces. The full name (${digitStr.length} digits) is not in these digits.`,
          manyToOneNote
        };
        self.postMessage({ type: 'NAME_RESULTS', requestId: reqId, result, silent: msg.silent } satisfies SearchWorkerResponse);
        break;
      }

      case 'PROCESS_AND_SEARCH_IMAGE': {
        if (!digits) throw new Error('Worker digits not initialized');
        activeRequestId = msg.requestId;
        const reqId = msg.requestId;

        const { rgbaBuffer, srcWidth, srcHeight, targetSize, dither, invert, startDigitIndex } = msg;
        const srcData = new Uint8ClampedArray(rgbaBuffer);

        // 1. Calculate downsampled dimensions preserving aspect ratio
        let targetW: number;
        let targetH: number;
        if (srcWidth >= srcHeight) {
          targetW = targetSize;
          targetH = Math.max(1, Math.round((srcHeight / srcWidth) * targetSize));
        } else {
          targetH = targetSize;
          targetW = Math.max(1, Math.round((srcWidth / srcHeight) * targetSize));
        }

        // Bilinear downsample to float luminance
        const lum = new Float32Array(targetW * targetH);
        const colors = new Uint8Array(targetW * targetH * 3);
        let minLum = 255.0;
        let maxLum = 0.0;

        for (let y = 0; y < targetH; y++) {
          const srcY = (y / targetH) * srcHeight;
          const y0 = Math.min(srcHeight - 1, Math.floor(srcY));
          const y1 = Math.min(srcHeight - 1, y0 + 1);
          const wy = srcY - y0;

          for (let x = 0; x < targetW; x++) {
            const srcX = (x / targetW) * srcWidth;
            const x0 = Math.min(srcWidth - 1, Math.floor(srcX));
            const x1 = Math.min(srcWidth - 1, x0 + 1);
            const wx = srcX - x0;

            const p00 = (y0 * srcWidth + x0) * 4;
            const p10 = (y0 * srcWidth + x1) * 4;
            const p01 = (y1 * srcWidth + x0) * 4;
            const p11 = (y1 * srcWidth + x1) * 4;

            const r00 = srcData[p00], g00 = srcData[p00 + 1], b00 = srcData[p00 + 2];
            const r10 = srcData[p10], g10 = srcData[p10 + 1], b10 = srcData[p10 + 2];
            const r01 = srcData[p01], g01 = srcData[p01 + 1], b01 = srcData[p01 + 2];
            const r11 = srcData[p11], g11 = srcData[p11 + 1], b11 = srcData[p11 + 2];

            const red = (r00 * (1.0 - wx) + r10 * wx) * (1.0 - wy) + (r01 * (1.0 - wx) + r11 * wx) * wy;
            const green = (g00 * (1.0 - wx) + g10 * wx) * (1.0 - wy) + (g01 * (1.0 - wx) + g11 * wx) * wy;
            const blue = (b00 * (1.0 - wx) + b10 * wx) * (1.0 - wy) + (b01 * (1.0 - wx) + b11 * wx) * wy;

            const cIdx = (y * targetW + x) * 3;
            colors[cIdx + 0] = Math.round(invert ? 255.0 - red : red);
            colors[cIdx + 1] = Math.round(invert ? 255.0 - green : green);
            colors[cIdx + 2] = Math.round(invert ? 255.0 - blue : blue);

            const lum00 = 0.299 * r00 + 0.587 * g00 + 0.114 * b00;
            const lum10 = 0.299 * r10 + 0.587 * g10 + 0.114 * b10;
            const lum01 = 0.299 * r01 + 0.587 * g01 + 0.114 * b01;
            const lum11 = 0.299 * r11 + 0.587 * g11 + 0.114 * b11;

            const top = lum00 * (1.0 - wx) + lum10 * wx;
            const bot = lum01 * (1.0 - wx) + lum11 * wx;
            let val = top * (1.0 - wy) + bot * wy;

            if (invert) val = 255.0 - val;

            lum[y * targetW + x] = val;
            if (val < minLum) minLum = val;
            if (val > maxLum) maxLum = val;
          }
        }

        // Auto-levels stretch
        const range = Math.max(1.0, maxLum - minLum);
        for (let i = 0; i < lum.length; i++) {
          lum[i] = ((lum[i] - minLum) / range) * 255.0;
        }

        // Quantize to 10 levels (0-9) with optional Floyd-Steinberg dithering
        const levels = new Uint8Array(targetW * targetH);
        const errBuf = new Float32Array(lum);

        for (let y = 0; y < targetH; y++) {
          for (let x = 0; x < targetW; x++) {
            const idx = y * targetW + x;
            const oldVal = errBuf[idx];
            let level = Math.round((oldVal / 255.0) * 9.0);
            level = Math.max(0, Math.min(9, level));
            levels[idx] = level;

            if (dither) {
              const quantizedVal = (level / 9.0) * 255.0;
              const err = oldVal - quantizedVal;

              if (x + 1 < targetW) errBuf[idx + 1] += err * (7.0 / 16.0);
              if (y + 1 < targetH) {
                if (x - 1 >= 0) errBuf[(y + 1) * targetW + (x - 1)] += err * (3.0 / 16.0);
                errBuf[(y + 1) * targetW + x] += err * (5.0 / 16.0);
                if (x + 1 < targetW) errBuf[(y + 1) * targetW + (x + 1)] += err * (1.0 / 16.0);
              }
            }
          }
        }

        // Subsequence search across 10M digits
        const pixelCount = levels.length;
        const positions = new Uint32Array(pixelCount);
        let currentPos = Math.max(0, startDigitIndex);
        let startPosition = 0;
        let endPosition = 0;

        for (let i = 0; i < pixelCount; i++) {
          if (activeRequestId !== reqId) return;
          const targetDigit = levels[i];
          const hitPos = findFirstAfter(digits, [targetDigit], currentPos);
          if (hitPos === -1) {
            throw new Error(`Exceeded 10M digits during subsequence search at pixel ${i}`);
          }
          if (i === 0) startPosition = hitPos;
          if (i === pixelCount - 1) endPosition = hitPos;

          positions[i] = hitPos;
          currentPos = hitPos + 1;
        }

        if (activeRequestId !== reqId) return;

        const totalSpan = endPosition - startPosition;
        const avgGap = pixelCount > 1 ? totalSpan / (pixelCount - 1) : 0;

        const response: SearchWorkerResponse = {
          type: 'IMAGE_RESULTS',
          requestId: reqId,
          positions,
          levels,
          colors,
          width: targetW,
          height: targetH,
          pixelCount,
          startPosition,
          endPosition,
          avgGap
        };

        // Transfer TypedArrays (zero-copy buffer transfer)
        (self as any).postMessage(response, [positions.buffer, levels.buffer, colors.buffer]);
        break;
      }
    }
  } catch (err: any) {
    self.postMessage({
      type: 'ERROR',
      requestId: (msg as any)?.requestId,
      message: err?.message || String(err)
    } satisfies SearchWorkerResponse);
  }
};
