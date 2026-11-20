import { describe, it, expect } from 'vitest';
import { LORE_SLIDES } from '../ui/loreModal.ts';

describe('LoreModal Specifications & Slide Data', () => {
  it('defines exactly 6 slides in correct sequence', () => {
    expect(LORE_SLIDES).toHaveLength(6);
  });

  it('matches required copy and hooks for Slide 1', () => {
    const s1 = LORE_SLIDES[0];
    expect(s1.hook).toBe('Somewhere in π, this exact sentence is already written.');
    expect(s1.support).toContain('Every book ever written.');
    expect(s1.support).toContain('Your birthday. Your name.');
  });

  it('matches required copy and small print for Slide 2', () => {
    const s2 = LORE_SLIDES[1];
    expect(s2.hook).toBe('It all rests on one unproven idea.');
    expect(s2.support).toContain('normal');
    expect(s2.smallPrint).toContain('Nobody has proven this for π.');
  });

  it('matches required copy for Slide 3 (Borges 1941)', () => {
    const s3 = LORE_SLIDES[2];
    expect(s3.hook).toBe('Borges imagined it in 1941.');
    expect(s3.support).toContain('The Library of Babel');
  });

  it('matches required copy for Slide 4 (Sagan Contact & real dates)', () => {
    const s4 = LORE_SLIDES[3];
    expect(s4.hook).toBe('Sagan hid God in the digits.');
    expect(s4.support).toContain('Contact');
    expect(s4.smallPrint).toContain('Real birthday finders are quieter magic.');
  });

  it('matches required copy for Slide 5 (Address cost)', () => {
    const s5 = LORE_SLIDES[4];
    expect(s5.hook).toBe('The catch: the address costs as much as the message.');
    expect(s5.support).toContain('1 MB photo');
    expect(s5.support).toContain('10^n');
  });

  it('matches required copy and final status for Slide 6', () => {
    const s6 = LORE_SLIDES[5];
    expect(s6.hook).toBe("π is simple. What it contains isn't.");
    expect(s6.support).toContain('A few lines of code generate every digit');
    expect(s6.isFinal).toBe(true);
  });

  it('word stagger timing splits into words with 40ms interval', () => {
    const hook = 'Somewhere in π, this exact sentence is already written.';
    const words = hook.split(' ');
    expect(words.length).toBeGreaterThan(5);

    const delays = words.map((_, i) => i * 40);
    expect(delays[0]).toBe(0);
    expect(delays[1]).toBe(40);
    expect(delays[2]).toBe(80);
    expect(delays[3]).toBe(120);
  });
});
