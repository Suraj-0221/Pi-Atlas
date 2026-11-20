import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { unpackBCD, verifyFirst50, KNOWN_FIRST_50 } from '../data/loadPi.ts';

describe('Pi 10M Binary File & BCD Unpacker', () => {
  it('has public/pi_10m.bin with exactly 5,000,000 bytes', () => {
    const filePath = path.resolve(process.cwd(), 'public/pi_10m.bin');
    expect(fs.existsSync(filePath)).toBe(true);
    const stats = fs.statSync(filePath);
    expect(stats.size).toBe(5_000_000);
  });

  it('unpacks first 25 bytes to exactly the first 50 digits of pi', () => {
    const filePath = path.resolve(process.cwd(), 'public/pi_10m.bin');
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(25);
    fs.readSync(fd, buffer, 0, 25, 0);
    fs.closeSync(fd);

    const packed = new Uint8Array(buffer);
    const digits = unpackBCD(packed, 50);
    expect(digits.length).toBe(50);

    let digitStr = '';
    for (let i = 0; i < 50; i++) {
      digitStr += digits[i].toString();
    }
    expect(digitStr).toBe(KNOWN_FIRST_50);
    expect(verifyFirst50(digits)).toBe(true);
  });
});
