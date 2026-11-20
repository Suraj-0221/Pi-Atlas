/**
 * Greedy contiguous string chunking:
 * Splits a digit string into the fewest contiguous pieces found in pi.
 */

export interface ContiguousPiece {
  startIndexInName: number;
  length: number;
  digits: number[];
  digitStr: string;
  patternStr: string;
  firstOccurrenceInPi: number;
}

export function chunkGreedy(
  fullDigits: number[],
  findOccurrence: (pattern: number[]) => number
): ContiguousPiece[] {
  const pieces: ContiguousPiece[] = [];
  let pos = 0;
  const n = fullDigits.length;

  while (pos < n) {
    let matchedEnd = -1;
    let matchOcc = -1;

    // Try longest possible piece starting at pos
    for (let end = n; end > pos; end--) {
      const sub = fullDigits.slice(pos, end);
      const occ = findOccurrence(sub);
      if (occ !== -1) {
        matchedEnd = end;
        matchOcc = occ;
        break;
      }
    }

    if (matchedEnd === -1) {
      // Fallback single digit if somehow not found (should never happen in 10M digits)
      const sub = [fullDigits[pos]];
      pieces.push({
        startIndexInName: pos,
        length: 1,
        digits: sub,
        digitStr: sub.join(''),
        patternStr: sub.join(''),
        firstOccurrenceInPi: -1
      });
      pos++;
    } else {
      const sub = fullDigits.slice(pos, matchedEnd);
      pieces.push({
        startIndexInName: pos,
        length: matchedEnd - pos,
        digits: sub,
        digitStr: sub.join(''),
        patternStr: sub.join(''),
        firstOccurrenceInPi: matchOcc
      });
      pos = matchedEnd;
    }
  }

  return pieces;
}

