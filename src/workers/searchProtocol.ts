/**
 * Protocol messages for communication with search.worker.ts
 */

import { NameEncodingMode } from '../encode/name.ts';
import { ContiguousPiece } from '../encode/chunking.ts';

export interface DateCandidate {
  format: string; // 'DDMMYY', 'DDMMYYYY', 'YYYYMMDD', 'MMDDYY'
  digits: number[];
}

export interface DateHitResult {
  format: string;
  patternStr: string;
  firstOccurrence: number; // 0-based index
  occurrences: number[]; // up to 1000 occurrences
  totalOccurrences: number;
  percentile?: number;
}

export interface DateSearchResult {
  hits: DateHitResult[];
  misses: { format: string; patternStr: string }[];
  primaryHit: DateHitResult | null;
  explanation: string;
  longerMissExplanation?: string;
}

export interface NameSearchOutput {
  mode: NameEncodingMode;
  cleanName: string;
  digitStr: string;
  totalOccurrences: number;
  occurrences: number[]; // up to 1000
  firstOccurrence: number;
  foundAs: 'full' | 'first-name' | 'pieces';
  pieces?: ContiguousPiece[];
  fallbackFirstName?: string;
  explanation: string;
  manyToOneNote?: string;
}

export type SearchWorkerRequest =
  | { type: 'INIT'; digits: Uint8Array }
  | { type: 'CANCEL'; requestId: number }
  | {
      type: 'SEARCH_DATE';
      requestId: number;
      candidates: DateCandidate[];
      day?: number;
      month?: number;
      year?: number;
    }
  | {
      type: 'SEARCH_NAME';
      requestId: number;
      cleanName: string;
      mode: NameEncodingMode;
      fullDigits: number[];
      firstWordDigits?: number[];
      firstWordName?: string;
      silent?: boolean;
    }
  | {
      type: 'PROCESS_AND_SEARCH_IMAGE';
      requestId: number;
      rgbaBuffer: ArrayBuffer;
      srcWidth: number;
      srcHeight: number;
      targetSize: number;
      dither: boolean;
      invert: boolean;
      startDigitIndex: number;
    };

export type SearchWorkerResponse =
  | { type: 'INIT_DONE' }
  | {
      type: 'DATE_FIRST_HIT';
      requestId: number;
      day: number;
      month: number;
      year: number;
      hit: {
        format: string;
        patternStr: string;
        firstOccurrence: number;
        totalOccurrences?: number;
        percentile?: number;
      };
    }
  | { type: 'DATE_RESULTS'; requestId: number; result: DateSearchResult }
  | { type: 'NAME_RESULTS'; requestId: number; result: NameSearchOutput; silent?: boolean }
  | {
      type: 'IMAGE_RESULTS';
      requestId: number;
      positions: Uint32Array; // TRANSFERRED
      levels: Uint8Array;     // TRANSFERRED
      colors?: Uint8Array;    // TRANSFERRED (RGB per pixel, 0..255)
      width: number;
      height: number;
      pixelCount: number;
      startPosition: number;
      endPosition: number;
      avgGap: number;
    }
  | { type: 'CANCELLED'; requestId: number }
  | { type: 'ERROR'; requestId?: number; message: string };
