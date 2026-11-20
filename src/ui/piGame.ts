/**
 * π Digit Memory & Speed Challenge Game
 * - Practice Mode: Recite as many digits as you can without making a mistake
 * - 30s Sprint Mode: Type as many correct consecutive digits before the timer expires
 * - Clean tactile keypad + physical keyboard support (0-9)
 * - Honest ranking based on memory depth
 * - Fly directly into the WebGL2 field to view your unlocked sequence
 */

import { sound } from '../viz/sound.ts';

export interface PiGameCallbacks {
  onShowInField: (startIndex: number, length: number, label: string, patternStr: string) => void;
  onClose?: () => void;
}

export type GameMode = 'zen' | 'sprint';

export function getPiGameRank(score: number): { title: string; percentile: string } {
  if (score >= 50) return { title: 'Ludolphian Geometer', percentile: 'Top 0.1% worldwide' };
  if (score >= 30) return { title: 'Euler Mathematician', percentile: 'Better than 98% of people' };
  if (score >= 20) return { title: 'Archimedes Circle', percentile: 'Better than 92% of people' };
  if (score >= 12) return { title: 'Pi Scholar', percentile: 'Better than 80% of people' };
  if (score >= 6) return { title: 'Circle Enthusiast', percentile: 'Better than 60% of people' };
  if (score >= 2) return { title: 'Curious Beginner', percentile: 'Better than 30% of people' };
  return { title: 'Novice Explorer', percentile: 'Practice makes permanent' };
}

export class PiGame {
  private container: HTMLElement;
  private digits: Uint8Array;
  private callbacks: PiGameCallbacks;

  private modalOverlayEl!: HTMLElement;
  private cardEl!: HTMLElement;
  private tapeContainerEl!: HTMLElement;
  private statStreakEl!: HTMLElement;
  private statBestEl!: HTMLElement;
  private timerEl!: HTMLElement;
  private modeZenBtn!: HTMLButtonElement;
  private modeSprintBtn!: HTMLButtonElement;
  private statusMessageEl!: HTMLElement;
  private resultPlateEl!: HTMLElement;
  private keypadEl!: HTMLElement;

  private mode: GameMode = 'zen';
  private currentIndex: number = 0;
  private bestScore: number = 0;
  private timerSeconds: number = 30;
  private timerIntervalId: number | null = null;
  private isTimerRunning: boolean = false;
  private isGameOver: boolean = false;
  private isOpen: boolean = false;
  private keyListener: ((e: KeyboardEvent) => void) | null = null;

  constructor(container: HTMLElement, digits: Uint8Array, callbacks: PiGameCallbacks) {
    this.container = container;
    this.digits = digits;
    this.callbacks = callbacks;

    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('pi_atlas_game_best');
      if (stored) this.bestScore = parseInt(stored, 10) || 0;
    }

    if (typeof document !== 'undefined') {
      this.buildSkeleton();
    }
  }

  public updateDigits(newDigits: Uint8Array) {
    this.digits = newDigits;
  }

  private buildSkeleton() {
    this.modalOverlayEl = document.createElement('div');
    this.modalOverlayEl.className = 'reveal-overlay';
    this.modalOverlayEl.id = 'pi-game-modal';
    this.modalOverlayEl.style.display = 'none';
    this.modalOverlayEl.style.zIndex = '970';

    this.cardEl = document.createElement('div');
    this.cardEl.className = 'pi-game-card';
    this.cardEl.innerHTML = `
      <div class="pi-game-header">
        <div>
          <div class="curiosities-tagline">Interactive Memory & Speed</div>
          <h2 class="curiosities-title">π Digit Challenge</h2>
        </div>
        <button type="button" class="reveal-card-corner-close" id="btn-close-pi-game" aria-label="Close">&times;</button>
      </div>

      <!-- Mode Selector -->
      <div class="pi-game-mode-row">
        <div class="segmented-control">
          <button type="button" class="tab-btn active" id="btn-game-mode-zen">Memory Practice</button>
          <button type="button" class="tab-btn" id="btn-game-mode-sprint">30s Sprint</button>
        </div>
        <div class="pi-game-stats">
          <span class="pi-game-stat-item">Digits: <b id="game-stat-streak">0</b></span>
          <span class="pi-game-stat-item">Best: <b id="game-stat-best">${this.bestScore}</b></span>
          <span class="pi-game-stat-item" id="game-timer-container" style="display: none;">Time: <b id="game-stat-timer">30s</b></span>
        </div>
      </div>

      <!-- Digit Ribbon Tape -->
      <div class="pi-game-tape-window">
        <span class="pi-game-prefix">3.</span>
        <div class="pi-game-tape" id="game-tape-track"></div>
        <div class="pi-game-slot is-current" id="game-current-slot">?</div>
      </div>

      <div class="pi-game-status-line" id="game-status-line">
        Type the next digit of π using keyboard (0-9) or keypad.
      </div>

      <!-- Results Plate (Shown upon game over) -->
      <div class="pi-game-result-plate" id="game-result-plate" style="display: none;">
        <div class="pi-game-result-title" id="game-result-title">Streak Ended</div>
        <div class="pi-game-result-rank" id="game-result-rank"></div>
        <div class="pi-game-result-actions">
          <button type="button" class="action-btn" id="btn-game-restart" style="padding: 6px 16px; font-size: 0.82rem;">Play Again</button>
          <button type="button" class="tab-btn" id="btn-game-fly" style="padding: 6px 14px; font-size: 0.82rem;">Show in π Field</button>
          <button type="button" class="tab-btn" id="btn-game-share" style="padding: 6px 14px; font-size: 0.82rem;">Share Score</button>
        </div>
      </div>

      <!-- On-Screen Keypad -->
      <div class="pi-game-keypad" id="game-keypad">
        <button type="button" class="pi-key-btn" data-key="1">1</button>
        <button type="button" class="pi-key-btn" data-key="2">2</button>
        <button type="button" class="pi-key-btn" data-key="3">3</button>
        <button type="button" class="pi-key-btn" data-key="4">4</button>
        <button type="button" class="pi-key-btn" data-key="5">5</button>
        <button type="button" class="pi-key-btn" data-key="6">6</button>
        <button type="button" class="pi-key-btn" data-key="7">7</button>
        <button type="button" class="pi-key-btn" data-key="8">8</button>
        <button type="button" class="pi-key-btn" data-key="9">9</button>
        <button type="button" class="pi-key-btn pi-key-hint" id="btn-game-hint">Hint</button>
        <button type="button" class="pi-key-btn" data-key="0">0</button>
        <button type="button" class="pi-key-btn pi-key-reset" id="btn-game-reset">Reset</button>
      </div>
    `;

    this.modalOverlayEl.appendChild(this.cardEl);
    this.container.appendChild(this.modalOverlayEl);

    // Cache elements
    this.tapeContainerEl = this.cardEl.querySelector('#game-tape-track') as HTMLElement;
    this.statStreakEl = this.cardEl.querySelector('#game-stat-streak') as HTMLElement;
    this.statBestEl = this.cardEl.querySelector('#game-stat-best') as HTMLElement;
    this.timerEl = this.cardEl.querySelector('#game-stat-timer') as HTMLElement;
    this.modeZenBtn = this.cardEl.querySelector('#btn-game-mode-zen') as HTMLButtonElement;
    this.modeSprintBtn = this.cardEl.querySelector('#btn-game-mode-sprint') as HTMLButtonElement;
    this.statusMessageEl = this.cardEl.querySelector('#game-status-line') as HTMLElement;
    this.resultPlateEl = this.cardEl.querySelector('#game-result-plate') as HTMLElement;
    this.keypadEl = this.cardEl.querySelector('#game-keypad') as HTMLElement;

    this.setupEvents();
  }

  private setupEvents() {
    const closeBtn = this.cardEl.querySelector('#btn-close-pi-game');
    closeBtn?.addEventListener('click', () => this.close());

    this.modalOverlayEl.addEventListener('click', (e) => {
      if (e.target === this.modalOverlayEl) this.close();
    });

    // Mode toggles
    this.modeZenBtn.addEventListener('click', () => {
      this.setMode('zen');
    });

    this.modeSprintBtn.addEventListener('click', () => {
      this.setMode('sprint');
    });

    // Keypad numbers
    const numKeys = this.cardEl.querySelectorAll<HTMLButtonElement>('.pi-key-btn[data-key]');
    numKeys.forEach(btn => {
      btn.addEventListener('click', () => {
        const val = parseInt(btn.dataset.key || '0', 10);
        this.submitDigit(val);
      });
    });

    // Hint button
    const hintBtn = this.cardEl.querySelector('#btn-game-hint');
    hintBtn?.addEventListener('click', () => this.giveHint());

    // Reset button
    const resetBtn = this.cardEl.querySelector('#btn-game-reset');
    resetBtn?.addEventListener('click', () => this.restart());

    // Result plate actions
    const restartBtn = this.cardEl.querySelector('#btn-game-restart');
    restartBtn?.addEventListener('click', () => this.restart());

    const flyBtn = this.cardEl.querySelector('#btn-game-fly');
    flyBtn?.addEventListener('click', () => {
      const len = Math.max(1, this.currentIndex);
      let pattern = '';
      for (let i = 0; i < len; i++) {
        pattern += this.digits[i].toString();
      }
      this.close();
      this.callbacks.onShowInField(0, len, `My π Score (${len} digits)`, pattern);
    });

    const shareBtn = this.cardEl.querySelector('#btn-game-share');
    shareBtn?.addEventListener('click', () => {
      const text = `I recited ${this.currentIndex} digits of π on π Atlas! Can you beat my score? https://pi-atlas.org/`;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).catch(() => {});
      }
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        navigator.share({ title: 'π Digit Challenge', text }).catch(() => {});
      } else {
        alert(`Score copied to clipboard:\n\n${text}`);
      }
    });
  }

  public open() {
    this.isOpen = true;
    this.modalOverlayEl.style.display = 'block';
    this.modalOverlayEl.style.opacity = '1';
    this.restart();

    // Attach physical keyboard listener
    this.keyListener = (e: KeyboardEvent) => {
      if (!this.isOpen) return;
      if (e.key >= '0' && e.key <= '9') {
        this.submitDigit(parseInt(e.key, 10));
      } else if (e.key === 'h' || e.key === 'H' || e.key === '?') {
        this.giveHint();
      } else if (e.key === 'Escape') {
        this.close();
      }
    };
    window.addEventListener('keydown', this.keyListener);
  }

  public close() {
    this.isOpen = false;
    this.modalOverlayEl.style.display = 'none';
    this.stopTimer();
    if (this.keyListener) {
      window.removeEventListener('keydown', this.keyListener);
      this.keyListener = null;
    }
    this.callbacks.onClose?.();
  }

  private setMode(newMode: GameMode) {
    this.mode = newMode;
    if (this.mode === 'zen') {
      this.modeZenBtn.classList.add('active');
      this.modeSprintBtn.classList.remove('active');
      const timerCont = this.cardEl.querySelector('#game-timer-container') as HTMLElement;
      if (timerCont) timerCont.style.display = 'none';
      this.statusMessageEl.textContent = 'Practice mode: Enter digits at your own pace without mistakes.';
    } else {
      this.modeSprintBtn.classList.add('active');
      this.modeZenBtn.classList.remove('active');
      const timerCont = this.cardEl.querySelector('#game-timer-container') as HTMLElement;
      if (timerCont) timerCont.style.display = 'inline-block';
      this.statusMessageEl.textContent = '30s Sprint: Type as many correct digits as you can before time expires!';
    }
    this.restart();
  }

  private restart() {
    this.stopTimer();
    this.currentIndex = 0;
    this.isGameOver = false;
    this.timerSeconds = 30;
    this.isTimerRunning = false;

    this.statStreakEl.textContent = '0';
    this.timerEl.textContent = '30s';
    this.tapeContainerEl.innerHTML = '';
    this.resultPlateEl.style.display = 'none';
    this.keypadEl.style.display = 'grid';

    const currentSlot = this.cardEl.querySelector('#game-current-slot') as HTMLElement;
    if (currentSlot) {
      currentSlot.textContent = '?';
      currentSlot.className = 'pi-game-slot is-current';
    }

    if (this.mode === 'zen') {
      this.statusMessageEl.textContent = 'Type the next digit of π using keyboard (0-9) or keypad.';
    } else {
      this.statusMessageEl.textContent = 'Type the first digit (1) to start the 30-second sprint!';
    }
  }

  private startTimer() {
    if (this.isTimerRunning) return;
    this.isTimerRunning = true;
    this.timerSeconds = 30;
    this.timerEl.textContent = `${this.timerSeconds}s`;

    this.timerIntervalId = window.setInterval(() => {
      this.timerSeconds--;
      this.timerEl.textContent = `${this.timerSeconds}s`;
      if (this.timerSeconds <= 0) {
        this.stopTimer();
        this.endGame(true);
      }
    }, 1000);
  }

  private stopTimer() {
    if (this.timerIntervalId !== null) {
      clearInterval(this.timerIntervalId);
      this.timerIntervalId = null;
    }
    this.isTimerRunning = false;
  }

  public submitDigit(digit: number) {
    if (this.isGameOver) return;

    if (this.mode === 'sprint' && !this.isTimerRunning) {
      this.startTimer();
    }

    const expected = this.digits[this.currentIndex];

    if (digit === expected) {
      // Correct!
      sound.playTick();
      this.appendDigitToTape(digit);
      this.currentIndex++;
      this.statStreakEl.textContent = this.currentIndex.toString();

      if (this.currentIndex > this.bestScore) {
        this.bestScore = this.currentIndex;
        this.statBestEl.textContent = this.bestScore.toString();
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('pi_atlas_game_best', this.bestScore.toString());
        }
      }

      // Harmonic chime on milestones (10, 25, 50, 100)
      if (this.currentIndex === 10 || this.currentIndex === 25 || this.currentIndex === 50 || this.currentIndex === 100) {
        sound.playChime();
      }

      this.statusMessageEl.textContent = `Correct! Current depth: ${this.currentIndex} digits.`;
    } else {
      // Wrong digit!
      this.endGame(false, digit, expected);
    }
  }

  private appendDigitToTape(digit: number) {
    const tile = document.createElement('div');
    tile.className = 'pi-game-slot is-solved';
    tile.textContent = digit.toString();
    this.tapeContainerEl.appendChild(tile);

    // Keep tape scrolled to the end
    const tapeWin = this.cardEl.querySelector('.pi-game-tape-window') as HTMLElement;
    if (tapeWin) {
      tapeWin.scrollLeft = tapeWin.scrollWidth;
    }
  }

  private giveHint() {
    if (this.isGameOver) return;
    const expected = this.digits[this.currentIndex];
    this.statusMessageEl.textContent = `Hint: The next digit is ${expected}.`;
    const currentSlot = this.cardEl.querySelector('#game-current-slot') as HTMLElement;
    if (currentSlot) {
      currentSlot.textContent = expected.toString();
      setTimeout(() => {
        if (!this.isGameOver && currentSlot.textContent === expected.toString()) {
          currentSlot.textContent = '?';
        }
      }, 1200);
    }
  }

  private endGame(isTimeOut: boolean, userDigit?: number, expectedDigit?: number) {
    this.isGameOver = true;
    this.stopTimer();

    const resultTitle = this.cardEl.querySelector('#game-result-title') as HTMLElement;
    const resultRank = this.cardEl.querySelector('#game-result-rank') as HTMLElement;

    if (isTimeOut) {
      resultTitle.textContent = `Time's Up! You recited ${this.currentIndex} digits in 30s.`;
    } else {
      resultTitle.textContent = `Mistake! You entered ${userDigit}, but the next digit was ${expectedDigit}.`;
      const currentSlot = this.cardEl.querySelector('#game-current-slot') as HTMLElement;
      if (currentSlot) {
        currentSlot.className = 'pi-game-slot is-error';
        currentSlot.textContent = (expectedDigit ?? '?').toString();
      }
    }

    // Rank evaluation
    const rank = this.getRank(this.currentIndex);
    resultRank.textContent = `${rank.title} · ${rank.percentile}`;

    this.resultPlateEl.style.display = 'block';
    this.keypadEl.style.display = 'none';
  }

  private getRank(score: number): { title: string; percentile: string } {
    return getPiGameRank(score);
  }
}
