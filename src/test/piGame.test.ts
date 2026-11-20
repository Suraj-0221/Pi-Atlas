import { describe, it, expect } from 'vitest';
import { getPiGameRank } from '../ui/piGame.ts';

describe('PiGame Logic & Ranking Evaluation', () => {
  it('correctly assigns rank titles and percentiles across thresholds', () => {
    expect(getPiGameRank(0).title).toBe('Novice Explorer');
    expect(getPiGameRank(1).title).toBe('Novice Explorer');

    expect(getPiGameRank(2).title).toBe('Curious Beginner');
    expect(getPiGameRank(5).title).toBe('Curious Beginner');

    expect(getPiGameRank(6).title).toBe('Circle Enthusiast');
    expect(getPiGameRank(10).title).toBe('Circle Enthusiast');

    expect(getPiGameRank(12).title).toBe('Pi Scholar');
    expect(getPiGameRank(19).title).toBe('Pi Scholar');

    expect(getPiGameRank(20).title).toBe('Archimedes Circle');
    expect(getPiGameRank(29).title).toBe('Archimedes Circle');

    expect(getPiGameRank(30).title).toBe('Euler Mathematician');
    expect(getPiGameRank(49).title).toBe('Euler Mathematician');

    expect(getPiGameRank(50).title).toBe('Ludolphian Geometer');
    expect(getPiGameRank(100).title).toBe('Ludolphian Geometer');
    expect(getPiGameRank(100).percentile).toContain('Top 0.1%');
  });

  it('validates consecutive digits of pi correctly', () => {
    // 3.1415926535...
    const piSequence = [1, 4, 1, 5, 9, 2, 6, 5, 3, 5];
    
    // Test match logic
    const userInputs = [1, 4, 1, 5];
    let streak = 0;
    for (let i = 0; i < userInputs.length; i++) {
      if (userInputs[i] === piSequence[i]) {
        streak++;
      } else {
        break;
      }
    }
    expect(streak).toBe(4);

    // Test mismatch logic
    const wrongInput = [1, 4, 9];
    let failedAt = -1;
    for (let i = 0; i < wrongInput.length; i++) {
      if (wrongInput[i] !== piSequence[i]) {
        failedAt = i;
        break;
      }
    }
    expect(failedAt).toBe(2); // user entered 9 instead of 1
    expect(piSequence[failedAt]).toBe(1);
  });
});
