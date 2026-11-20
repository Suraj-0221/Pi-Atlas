/**
 * Redesigned Name in π Panel (Task 4):
 * - Large serif input with underline only.
 * - Dial: a row of big digits (mono 48px) that grows as the user types (Task 4a).
 * - For each typed letter: keypad key scales 0.94 -> 1 over 140ms and fills with accent; digit slides in (180ms).
 * - Live silent search (Task 4b): inline under dial, updating every 300ms idle:
 *   "{digits} first appears at digit {N}" with number rolling (tabular figures).
 * - Primary button "Reveal in π" (and Enter) runs glass reveal (silent: false) (Task 4c).
 * - Result block: sentence, "Appears N times in the first 10M digits", many-to-one note, and chips
 *   "Try your friend's name" and "Try a date" (Task 4d).
 */

import { encodeName, NameEncodingMode } from '../encode/name.ts';
import { NameSearchOutput } from '../workers/searchProtocol.ts';

export interface NamePanelCallbacks {
  onSearch: (request: {
    cleanName: string;
    mode: NameEncodingMode;
    fullDigits: number[];
    firstWordDigits?: number[];
    firstWordName?: string;
    silent?: boolean;
  }) => void;
  onNavigateToOccurrence: (
    startIndex: number,
    length: number,
    label: string,
    letterLabels?: string[]
  ) => void;
  onShare?: () => void;
  onSwitchToDate?: () => void;
}

const KEYPAD_KEYS: Array<{ digit: number; letters: string }> = [
  { digit: 2, letters: 'ABC' },
  { digit: 3, letters: 'DEF' },
  { digit: 4, letters: 'GHI' },
  { digit: 5, letters: 'JKL' },
  { digit: 6, letters: 'MNO' },
  { digit: 7, letters: 'PQRS' },
  { digit: 8, letters: 'TUV' },
  { digit: 9, letters: 'WXYZ' }
];

export class NamePanel {
  private container: HTMLElement;
  private callbacks: NamePanelCallbacks;

  private currentResult: NameSearchOutput | null = null;
  private debounceTimer: number | null = null;
  private prevDigits: number[] = [];
  private lastLivePos: number | null = null;
  private activeRollRaf: number | null = null;
  private isReady: boolean = false;
  private loadingPercent: number = 0;

  // DOM Elements
  private nameInput!: HTMLInputElement;
  private dialContainer!: HTMLElement;
  private liveStatusEl!: HTMLElement;
  private keypadContainer!: HTMLElement;
  private noteContainer!: HTMLElement;

  constructor(container: HTMLElement, callbacks: NamePanelCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
  }

  public render() {
    this.container.innerHTML = `
      <h1 class="stage-headline">Where is your name in π?</h1>
      <div class="panel-body" style="padding-top: 4px;">
        <!-- Large serif input with underline only -->
        <div class="name-input-wrapper" style="margin-bottom: 12px;">
          <input
            type="text"
            id="name-input-large"
            class="stage-name-input"
            placeholder="Type your name"
            autocomplete="off"
            spellcheck="false"
            aria-label="Name"
          />
        </div>

        <!-- "Try it" chips (Task 2d) -->
        <div class="stage-chips-row">
          <span class="stage-chips-label">Try it:</span>
          <button type="button" class="stage-chip-btn" id="chip-name-einstein">Einstein</button>
          <button type="button" class="stage-chip-btn" id="chip-name-ada">Ada</button>
          <button type="button" class="stage-chip-btn" id="chip-name-newton">Newton</button>
        </div>

        <!-- Dial: a row of big digits (mono 48px) that grows as user types (Task 4a) -->
        <div id="name-dial-row" class="name-dial-row stage-hide-collapsed"></div>

        <!-- Live status line under dial (Task 4b) -->
        <div id="name-live-status" class="name-live-status stage-hide-collapsed"></div>

        <!-- 8-Key Phone Keypad diagram (2-9 with ABC-WXYZ) -->
        <div class="stage-hide-collapsed" style="margin-bottom: 8px;">
          <div style="font-family: var(--font-mono); font-size: 0.68rem; color: var(--text-muted); margin-bottom: 4px;">
            Keypad encoding (lights active digits):
          </div>
          <div id="name-keypad-grid" class="name-keypad-grid"></div>
        </div>

        <!-- Primary button "Reveal in π" (Task 4c) -->
        <button type="button" class="action-btn stage-hide-collapsed" id="name-reveal-btn" style="margin-top: 6px;" ${this.isReady ? '' : 'disabled'}>
          ${this.isReady ? 'Reveal in π' : `Loading π… ${this.loadingPercent}%`}
        </button>

        <!-- Result block (Task 4d) -->
        <div id="name-results" class="result-note" style="display: none; margin-top: 12px;"></div>
      </div>
    `;

    this.nameInput = this.container.querySelector('#name-input-large') as HTMLInputElement;
    this.dialContainer = this.container.querySelector('#name-dial-row') as HTMLElement;
    this.liveStatusEl = this.container.querySelector('#name-live-status') as HTMLElement;
    this.keypadContainer = this.container.querySelector('#name-keypad-grid') as HTMLElement;
    this.noteContainer = this.container.querySelector('#name-results') as HTMLElement;

    this.renderKeypad();
    this.setupChips();
    this.updateDial();

    // Input handlers: typing triggers dial + 300ms idle silent search (Task 4b)
    this.nameInput.addEventListener('input', () => {
      this.updateDial();
      if (this.debounceTimer !== null) {
        clearTimeout(this.debounceTimer);
      }
      this.debounceTimer = window.setTimeout(() => {
        this.triggerSearch(true);
      }, 300);
    });

    this.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (this.debounceTimer !== null) {
          clearTimeout(this.debounceTimer);
          this.debounceTimer = null;
        }
        this.triggerSearch(false);
      }
    });

    const revealBtn = this.container.querySelector('#name-reveal-btn') as HTMLButtonElement;
    revealBtn?.addEventListener('click', () => {
      this.triggerSearch(false);
    });
  }

  private setupChips() {
    const chipEinstein = this.container.querySelector('#chip-name-einstein');
    chipEinstein?.addEventListener('click', () => {
      this.nameInput.value = 'EINSTEIN';
      this.updateDial();
      this.triggerSearch(false);
    });

    const chipAda = this.container.querySelector('#chip-name-ada');
    chipAda?.addEventListener('click', () => {
      this.nameInput.value = 'ADA';
      this.updateDial();
      this.triggerSearch(false);
    });

    const chipNewton = this.container.querySelector('#chip-name-newton');
    chipNewton?.addEventListener('click', () => {
      this.nameInput.value = 'NEWTON';
      this.updateDial();
      this.triggerSearch(false);
    });
  }

  private renderKeypad() {
    this.keypadContainer.innerHTML = KEYPAD_KEYS.map(k => `
      <div class="keypad-key" data-digit="${k.digit}">
        <span class="keypad-digit">${k.digit}</span>
        <span class="keypad-letters">${k.letters}</span>
      </div>
    `).join('');
  }

  public getResult(): NameSearchOutput | null {
    return this.currentResult;
  }

  public clearAndFocus() {
    if (this.nameInput) {
      this.nameInput.value = '';
      this.updateDial();
      this.nameInput.focus();
      if (this.noteContainer) {
        this.noteContainer.style.display = 'none';
        this.noteContainer.innerHTML = '';
      }
      if (this.liveStatusEl) {
        this.liveStatusEl.textContent = '';
      }
    }
  }

  /**
   * Updates dial digits and animates newly typed letter's keypad key (Task 4a)
   */
  private updateDial() {
    const raw = this.nameInput.value;
    const encoded = encodeName(raw, 'keypad');
    const digits = encoded.digits;

    if (digits.length === 0) {
      this.dialContainer.innerHTML = '';
      this.prevDigits = [];
      this.liveStatusEl.textContent = '';
      this.lastLivePos = null;
      const keys = this.keypadContainer.querySelectorAll<HTMLElement>('.keypad-key');
      keys.forEach(k => k.classList.remove('is-active'));
      return;
    }

    // Identify if a new digit was typed (appended)
    if (digits.length > this.prevDigits.length) {
      const startIdx = this.prevDigits.length;
      for (let i = startIdx; i < digits.length; i++) {
        const d = digits[i];
        const span = document.createElement('span');
        span.className = 'dial-digit';
        span.dataset.digitIndex = i.toString();
        span.textContent = d.toString();
        this.dialContainer.appendChild(span);

        // Keypad key scales 0.94 -> 1 over 140ms and fills with accent (Task 4a)
        const keyEl = this.keypadContainer.querySelector<HTMLElement>(`.keypad-key[data-digit="${d}"]`);
        if (keyEl) {
          keyEl.animate(
            [
              { transform: 'scale(0.94)', backgroundColor: 'var(--accent)', color: '#ffffff' },
              { transform: 'scale(1.0)', backgroundColor: 'var(--accent)', color: '#ffffff' }
            ],
            { duration: 140, easing: 'ease-out' }
          );
        }
      }
    } else if (digits.length < this.prevDigits.length) {
      // Rebuild on backspace / deletion
      this.dialContainer.innerHTML = '';
      digits.forEach((d, i) => {
        const span = document.createElement('span');
        span.className = 'dial-digit';
        span.dataset.digitIndex = i.toString();
        span.textContent = d.toString();
        this.dialContainer.appendChild(span);
      });
    }

    this.prevDigits = [...digits];

    // Light active keys on the keypad diagram
    const activeDigitsSet = new Set(digits);
    const keys = this.keypadContainer.querySelectorAll<HTMLElement>('.keypad-key');
    keys.forEach(k => {
      const d = parseInt(k.dataset.digit || '0', 10);
      k.classList.toggle('is-active', activeDigitsSet.has(d));
    });
  }

  public triggerSearch(silent: boolean = false) {
    const raw = this.nameInput.value;
    const encoded = encodeName(raw, 'keypad');
    if (encoded.digits.length === 0) return;

    if (!silent) {
      this.noteContainer.style.display = 'block';
      this.noteContainer.innerHTML = `<span style="color: var(--text-secondary);">Locating contiguous digits in π...</span>`;
    }

    const firstWordEnc = encoded.firstWord ? encodeName(encoded.firstWord, 'keypad') : null;

    this.callbacks.onSearch({
      cleanName: encoded.cleanName,
      mode: 'keypad',
      fullDigits: encoded.digits,
      firstWordDigits: firstWordEnc ? firstWordEnc.digits : undefined,
      firstWordName: encoded.firstWord || undefined,
      silent
    });
  }

  public highlightDigit(index: number) {
    if (!this.dialContainer) return;
    const digits = this.dialContainer.querySelectorAll<HTMLElement>('.dial-digit');
    if (digits[index]) {
      digits[index].classList.add('is-highlighted');
    }
  }

  public highlightTile(index: number) {
    this.highlightDigit(index);
  }

  public clearTileHighlights() {
    if (!this.dialContainer) return;
    const digits = this.dialContainer.querySelectorAll<HTMLElement>('.dial-digit');
    digits.forEach(d => d.classList.remove('is-highlighted'));
  }

  private rollLiveNumber(fromVal: number, toVal: number) {
    if (this.activeRollRaf !== null) {
      cancelAnimationFrame(this.activeRollRaf);
      this.activeRollRaf = null;
    }

    const posSpan = this.liveStatusEl.querySelector<HTMLElement>('#name-live-pos');
    if (!posSpan) return;

    const start = performance.now();
    const duration = 280;

    const step = (now: number) => {
      const progress = Math.min(1.0, (now - start) / duration);
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(fromVal + (toVal - fromVal) * ease);
      if (posSpan) {
        posSpan.textContent = current.toLocaleString();
      }
      if (progress < 1.0) {
        this.activeRollRaf = requestAnimationFrame(step);
      } else {
        if (posSpan) {
          posSpan.textContent = toVal.toLocaleString();
        }
        this.activeRollRaf = null;
        this.lastLivePos = toVal;
      }
    };
    this.activeRollRaf = requestAnimationFrame(step);
  }

  public showResults(result: NameSearchOutput) {
    this.currentResult = result;

    // 1. Live status under dial (Task 4b)
    if (result.foundAs === 'full') {
      const targetPos = result.firstOccurrence + 1;
      const initialVal = this.lastLivePos !== null ? this.lastLivePos : Math.max(1, Math.round(targetPos * 0.85));

      this.liveStatusEl.innerHTML = `${result.digitStr} first appears at digit <span id="name-live-pos" style="font-variant-numeric: tabular-nums;">${initialVal.toLocaleString()}</span>`;
      this.rollLiveNumber(initialVal, targetPos);
    } else if (result.foundAs === 'first-name') {
      const targetPos = result.firstOccurrence + 1;
      const initialVal = this.lastLivePos !== null ? this.lastLivePos : Math.max(1, Math.round(targetPos * 0.85));

      this.liveStatusEl.innerHTML = `First name "${result.fallbackFirstName}" appears at digit <span id="name-live-pos" style="font-variant-numeric: tabular-nums;">${initialVal.toLocaleString()}</span>`;
      this.rollLiveNumber(initialVal, targetPos);
    } else {
      this.liveStatusEl.textContent = `Not found as one piece in the first 10M digits (found as ${result.pieces?.length || 2} pieces).`;
      this.lastLivePos = null;
    }

    // 2. Result block (Task 4d) - shown on explicit Reveal or Enter
    if (!this.noteContainer) return;
    this.noteContainer.style.display = 'block';

    const occCount = result.totalOccurrences;
    const occText = result.foundAs === 'pieces'
      ? `Found as ${result.pieces?.length || 2} pieces in 10M digits.`
      : `Appears ${occCount} times in the first 10M digits.`;

    let html = `
      <div style="font-family: var(--font-serif); font-size: 0.95rem; font-weight: 500; color: var(--text-primary); margin-bottom: 4px;">
        ${result.explanation}
      </div>
      <div style="font-family: var(--font-mono); font-size: 12px; color: var(--text-secondary); margin: 4px 0 6px;">
        ${occText}
      </div>
    `;

    if (result.manyToOneNote) {
      html += `
        <div style="font-size: 0.74rem; color: var(--text-muted); line-height: 1.4; margin: 4px 0 8px;">
          ${result.manyToOneNote}
        </div>
      `;
    }

    // Chip row: "Share", "Try your friend's name", and "Try a date" (Task 4d, 6b)
    html += `
      <div class="stage-chips-row" style="margin-top: 10px;">
        <button type="button" class="stage-chip-btn" id="chip-name-share" style="color: var(--accent); font-weight: 500;">Share</button>
        <button type="button" class="stage-chip-btn" id="chip-name-friend">Try your friend's name</button>
        <button type="button" class="stage-chip-btn" id="chip-name-trydate">Try a date</button>
      </div>
    `;

    this.noteContainer.innerHTML = html;

    const shareBtn = this.noteContainer.querySelector('#chip-name-share');
    shareBtn?.addEventListener('click', () => {
      this.callbacks.onShare?.();
    });

    const friendBtn = this.noteContainer.querySelector('#chip-name-friend');
    friendBtn?.addEventListener('click', () => {
      this.clearAndFocus();
    });

    const tryDateBtn = this.noteContainer.querySelector('#chip-name-trydate');
    tryDateBtn?.addEventListener('click', () => {
      this.callbacks.onSwitchToDate?.();
    });
  }

  public updateLoadingProgress(percent: number) {
    this.loadingPercent = Math.round(percent);
    this.isReady = percent >= 100;
    const btn = this.container.querySelector('#name-reveal-btn') as HTMLButtonElement | null;
    if (btn) {
      if (!this.isReady) {
        btn.textContent = `Loading π… ${this.loadingPercent}%`;
        btn.disabled = true;
      } else {
        btn.textContent = 'Reveal in π';
        btn.disabled = false;
      }
    }
  }

  public setName(val: string) {
    if (this.nameInput) {
      this.nameInput.value = val;
      this.updateDial();
    }
  }

  public getCurrentResult() {
    return this.currentResult;
  }

  public getRawInput(): string {
    return this.nameInput?.value || '';
  }
}
