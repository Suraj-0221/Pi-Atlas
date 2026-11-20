/**
 * Isolated Reveal Window Component
 * - Center glass card (only glass element in the app)
 * - Pure Web Animations API (element.animate) on transform and opacity
 * - Fixed-width JetBrains Mono tabular digits ribbon sliding rightwards into window
 * - Specular diagonal sweep
 * - Newsreader lining tabular position counter
 * - Staggered terracotta underline and cell highlight
 * - Result block with format and missed-format copy
 * - Supports slow-motion (1x, 4x, 10x) and custom easings for tuning
 */

import { createCubicBezier, EASE_FAST_ENTRY_SOFT_SETTLE } from '../viz/easing.ts';
import { sound } from '../viz/sound.ts';
import { DuelVerdict } from '../encode/dateSearch.ts';

export interface RevealHitData {
  day?: number;
  month?: number;
  year?: number;
  name?: string;
  letterLabels?: string[];
  format: string; // 'DDMMYY', 'Keypad', etc.
  patternStr: string;
  firstOccurrence: number; // 0-based
  occurrences: number[]; // all occurrences list
  currentOccurrenceIndex: number; // 0-based index into occurrences
  totalOccurrences: number;
  missedLongerFormat?: string;
  missedLongerPattern?: string;
  pieces?: Array<{
    pieceStr: string;
    startIndex: number;
    firstOccurrence: number;
    letterLabels?: string[];
  }>;
  percentile?: number;
}

export interface RevealWindowCallbacks {
  onShowInField?: (digitIndex: number, length: number, format: string, patternStr: string, letterLabels?: string[]) => void;
  onClose?: () => void;
  onStepOccurrence?: (newOccIndex: number, newPos: number) => void;
  onReplay?: () => void;
  onUnderlineDigit?: (digitIdx: number) => void;
  onSwitchToName?: () => void;
  onCompareDate?: () => void;
  onTryAnotherName?: () => void;
  onSwitchToDate?: () => void;
  onShare?: (hit: RevealHitData) => void;
  onChallengeFriend?: (day: number, month: number, year: number, hitPos: number) => void;
}

export interface RevealWindowOptions {
  piDigits: Uint8Array;
  container?: HTMLElement;
  durationMultiplier?: number; // 1 = 1x, 4 = 4x, 10 = 10x
  easingBezier?: [number, number, number, number];
  easingCssString?: string;
  callbacks?: RevealWindowCallbacks;
}

export class RevealWindow {
  private piDigits: Uint8Array;
  private container: HTMLElement;
  private callbacks: RevealWindowCallbacks;

  // Animation configuration
  public durationMultiplier: number = 1.0;
  public easingBezier: [number, number, number, number] = [0.22, 1, 0.36, 1];
  public easingCssString: string = 'cubic-bezier(0.22, 1, 0.36, 1)';
  private easingFn: (t: number) => number = EASE_FAST_ENTRY_SOFT_SETTLE;

  // DOM Elements
  private overlayEl!: HTMLElement;
  private modalContainerEl!: HTMLElement;
  private glassCardEl!: HTMLElement;
  private progressLineEl!: HTMLElement;
  private specularEl!: HTMLElement;
  private viewportMaskEl!: HTMLElement;
  private ribbonTrackEl!: HTMLElement;
  private underlineBarEl!: HTMLElement;
  private counterSectionEl!: HTMLElement;
  private counterNumberEl!: HTMLElement;
  private counterTotalEl!: HTMLElement;
  private resultsBlockEl!: HTMLElement;
  private duelStackEl!: HTMLElement;
  private headlineEl!: HTMLElement;
  private metaLineEl!: HTMLElement;
  private missedLineEl!: HTMLElement;
  private stepperContainerEl!: HTMLElement;
  private showInFieldBtn!: HTMLButtonElement;
  private replayBtn!: HTMLButtonElement;
  private challengeFriendBtn!: HTMLButtonElement;
  private cipherDeckEl!: HTMLElement;

  // State
  private currentHit: RevealHitData | null = null;
  private isVisible: boolean = false;
  private activeRafId: number | null = null;
  private cipherIntervalId: number | null = null;
  private activeAnimations: Animation[] = [];
  private timeoutIds: number[] = [];
  private isAnimatingSequence: boolean = false;

  constructor(options: RevealWindowOptions) {
    this.piDigits = options.piDigits;
    this.container = options.container || document.body;
    this.durationMultiplier = options.durationMultiplier ?? 1.0;
    if (options.easingBezier) {
      this.easingBezier = options.easingBezier;
      this.easingFn = createCubicBezier(...options.easingBezier);
    }
    if (options.easingCssString) {
      this.easingCssString = options.easingCssString;
    }
    this.callbacks = options.callbacks || {};

    this.buildSkeleton();
  }

  public setDurationMultiplier(mult: number) {
    this.durationMultiplier = Math.max(0.1, mult);
  }

  public setEasing(bezier: [number, number, number, number], cssString: string) {
    this.easingBezier = bezier;
    this.easingCssString = cssString;
    this.easingFn = createCubicBezier(...bezier);
  }

  public updatePiDigits(digits: Uint8Array) {
    this.piDigits = digits;
  }

  private buildSkeleton() {
    // 1. Overlay
    this.overlayEl = document.createElement('div');
    this.overlayEl.className = 'reveal-overlay';
    this.overlayEl.style.display = 'none';
    this.overlayEl.addEventListener('click', () => {
      this.dismiss();
    });

    // 2. Modal Container
    this.modalContainerEl = document.createElement('div');
    this.modalContainerEl.className = 'reveal-modal-container';
    this.modalContainerEl.style.display = 'none';

    // 3. Glass Card
    this.glassCardEl = document.createElement('div');
    this.glassCardEl.className = 'reveal-glass-card';

    // 3a. Progress line
    this.progressLineEl = document.createElement('div');
    this.progressLineEl.className = 'reveal-progress-line';
    this.glassCardEl.appendChild(this.progressLineEl);

    // 3b. Specular sweep
    this.specularEl = document.createElement('div');
    this.specularEl.className = 'reveal-specular-sweep';
    this.glassCardEl.appendChild(this.specularEl);

    // 3c. Cipher Deck (for Name Flow)
    this.cipherDeckEl = document.createElement('div');
    this.cipherDeckEl.className = 'reveal-cipher-deck';
    this.cipherDeckEl.style.display = 'none';
    this.glassCardEl.appendChild(this.cipherDeckEl);

    // 3d. Viewport Mask
    this.viewportMaskEl = document.createElement('div');
    this.viewportMaskEl.className = 'reveal-viewport-mask';

    // Ribbon track
    this.ribbonTrackEl = document.createElement('div');
    this.ribbonTrackEl.className = 'reveal-ribbon-track';
    this.viewportMaskEl.appendChild(this.ribbonTrackEl);

    // Underline bar
    this.underlineBarEl = document.createElement('div');
    this.underlineBarEl.className = 'reveal-underline-bar';
    this.viewportMaskEl.appendChild(this.underlineBarEl);

    this.glassCardEl.appendChild(this.viewportMaskEl);

    // 4. Position counter section
    this.counterSectionEl = document.createElement('div');
    this.counterSectionEl.className = 'reveal-counter-section';

    this.counterNumberEl = document.createElement('div');
    this.counterNumberEl.className = 'reveal-counter-number';
    this.counterNumberEl.textContent = '0';

    this.counterTotalEl = document.createElement('div');
    this.counterTotalEl.className = 'reveal-counter-total';
    this.counterTotalEl.textContent = 'of 10,000,000';

    this.counterSectionEl.appendChild(this.counterNumberEl);
    this.counterSectionEl.appendChild(this.counterTotalEl);
    this.glassCardEl.appendChild(this.counterSectionEl);

    // Duel mode stacked rows (Task 4)
    this.duelStackEl = document.createElement('div');
    this.duelStackEl.className = 'reveal-duel-stack';
    this.duelStackEl.style.display = 'none';
    this.glassCardEl.appendChild(this.duelStackEl);

    // 5. Results block
    this.resultsBlockEl = document.createElement('div');
    this.resultsBlockEl.className = 'reveal-results-block';

    this.headlineEl = document.createElement('div');
    this.headlineEl.className = 'reveal-headline';

    this.metaLineEl = document.createElement('div');
    this.metaLineEl.className = 'reveal-meta-line';

    this.missedLineEl = document.createElement('div');
    this.missedLineEl.className = 'reveal-missed-line';

    // Actions row
    const actionsRow = document.createElement('div');
    actionsRow.className = 'reveal-actions-row';

    this.showInFieldBtn = document.createElement('button');
    this.showInFieldBtn.type = 'button';
    this.showInFieldBtn.className = 'reveal-btn-fly';
    this.showInFieldBtn.textContent = 'Show in the field';
    this.showInFieldBtn.addEventListener('click', () => {
      if (this.currentHit) {
        this.dismiss();
        const letters = this.currentHit.letterLabels || (this.currentHit.name ? this.currentHit.name.toUpperCase().split('') : undefined);
        this.callbacks.onShowInField?.(
          this.currentHit.firstOccurrence,
          this.currentHit.patternStr.length,
          this.currentHit.format,
          this.currentHit.patternStr,
          letters
        );
      }
    });

    this.stepperContainerEl = document.createElement('div');
    this.stepperContainerEl.className = 'reveal-stepper';

    this.replayBtn = document.createElement('button');
    this.replayBtn.type = 'button';
    this.replayBtn.className = 'reveal-btn-secondary';
    this.replayBtn.textContent = 'Replay';
    this.replayBtn.addEventListener('click', () => {
      this.replay();
    });

    this.challengeFriendBtn = document.createElement('button');
    this.challengeFriendBtn.type = 'button';
    this.challengeFriendBtn.id = 'reveal-btn-challenge';
    this.challengeFriendBtn.className = 'reveal-btn-secondary';
    this.challengeFriendBtn.textContent = 'Challenge a friend';
    this.challengeFriendBtn.style.display = 'none';
    this.challengeFriendBtn.addEventListener('click', () => {
      if (this.currentHit && this.currentHit.day && this.currentHit.month && this.currentHit.year) {
        this.callbacks.onChallengeFriend?.(
          this.currentHit.day,
          this.currentHit.month,
          this.currentHit.year,
          this.currentHit.firstOccurrence
        );
      }
    });

    const shareBtn = document.createElement('button');
    shareBtn.type = 'button';
    shareBtn.className = 'reveal-btn-secondary';
    shareBtn.textContent = 'Share';
    shareBtn.addEventListener('click', () => {
      if (this.currentHit) {
        this.callbacks.onShare?.(this.currentHit);
      }
    });

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'reveal-btn-secondary';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => {
      this.dismiss();
    });

    actionsRow.appendChild(this.showInFieldBtn);
    actionsRow.appendChild(this.stepperContainerEl);
    actionsRow.appendChild(this.replayBtn);
    actionsRow.appendChild(this.challengeFriendBtn);
    actionsRow.appendChild(shareBtn);
    actionsRow.appendChild(closeBtn);

    this.resultsBlockEl.appendChild(this.headlineEl);
    this.resultsBlockEl.appendChild(this.metaLineEl);
    this.resultsBlockEl.appendChild(this.missedLineEl);
    this.resultsBlockEl.appendChild(actionsRow);

    this.glassCardEl.appendChild(this.resultsBlockEl);

    // Corner close button (x)
    const cornerCloseBtn = document.createElement('button');
    cornerCloseBtn.type = 'button';
    cornerCloseBtn.className = 'reveal-card-corner-close';
    cornerCloseBtn.innerHTML = '&times;';
    cornerCloseBtn.setAttribute('aria-label', 'Close');
    cornerCloseBtn.addEventListener('click', () => this.dismiss());
    this.glassCardEl.appendChild(cornerCloseBtn);

    this.modalContainerEl.appendChild(this.glassCardEl);

    // Append to container
    this.container.appendChild(this.overlayEl);
    this.container.appendChild(this.modalContainerEl);
  }

  public showSearchProgress(active: boolean) {
    if (active) {
      this.progressLineEl.classList.add('active');
    } else {
      this.progressLineEl.classList.remove('active');
    }
  }

  /**
   * Preloads JetBrains Mono and Newsreader fonts before starting reveal
   */
  public async ensureFontsReady(): Promise<void> {
    if (typeof document !== 'undefined' && 'fonts' in document) {
      await document.fonts.ready;
    }
  }

  /**
   * Starts the 2.6s Reveal sequence for the given hit
   */
  public async startReveal(hit: RevealHitData): Promise<void> {
    await this.ensureFontsReady();
    this.cancelRunningAnimations();

    this.currentHit = hit;
    this.isVisible = true;

    // 1. Show container elements
    this.overlayEl.style.display = 'block';
    this.modalContainerEl.style.display = 'flex';

    // 2. Setup content and layout
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
    const slotsCount = isMobile ? 11 : 19;
    const cellWidth = isMobile ? 24 : 32;
    const matchLen = hit.patternStr.length;
    const slotMatchStart = Math.max(0, Math.floor((slotsCount - matchLen) / 2));

    this.setupRibbonContent(hit, slotsCount, cellWidth, slotMatchStart);
    this.setupResultsContent(hit);

    this.duelStackEl.style.display = 'none';
    this.counterSectionEl.style.display = 'flex';
    this.viewportMaskEl.style.display = 'block';
    this.stepperContainerEl.style.display = 'inline-flex';
    this.showInFieldBtn.style.display = 'inline-block';
    this.replayBtn.style.display = 'inline-block';

    if (hit.day && hit.month && hit.year) {
      this.challengeFriendBtn.style.display = 'inline-block';
    } else {
      this.challengeFriendBtn.style.display = 'none';
    }

    if (hit.name) {
      this.showInFieldBtn.textContent = 'Show letters in the field';
      this.cipherDeckEl.style.display = 'flex';
      this.glassCardEl.style.height = 'auto';
      this.glassCardEl.style.padding = '18px 24px';
      this.setupCipherDeck(hit);
    } else {
      this.showInFieldBtn.textContent = 'Show in the field';
      this.cipherDeckEl.style.display = 'none';
      this.glassCardEl.style.height = '';
      this.glassCardEl.style.padding = '';
    }

    // Check prefers-reduced-motion
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      this.renderReducedMotionState(hit);
      return;
    }

    // 3. Execute Timeline with Web Animations API
    this.executeFullTimeline(hit, cellWidth, slotMatchStart);
  }

  /**
   * Starts the Challenge and Compare Duel presentation (Task 4)
   * Displays stacked ribbons for both dates in the glass window with one-sentence verdict.
   */
  public async startDuelReveal(duelData: DuelVerdict): Promise<void> {
    await this.ensureFontsReady();
    this.cancelRunningAnimations();

    this.isVisible = true;
    this.overlayEl.style.display = 'block';
    this.modalContainerEl.style.display = 'flex';
    this.overlayEl.style.opacity = '0.7';
    this.glassCardEl.style.display = 'flex';
    this.glassCardEl.style.opacity = '1';
    this.glassCardEl.style.transform = 'scale(1)';
    this.glassCardEl.style.height = 'auto';
    this.glassCardEl.style.padding = '22px 28px';

    // Hide single-search visuals
    this.viewportMaskEl.style.display = 'none';
    this.cipherDeckEl.style.display = 'none';
    this.counterSectionEl.style.display = 'none';
    this.stepperContainerEl.style.display = 'none';
    this.showInFieldBtn.style.display = 'none';
    this.replayBtn.style.display = 'none';
    this.missedLineEl.style.display = 'none';

    // Remove old stat line and chips if present
    const existingStat = this.resultsBlockEl.querySelector('.reveal-stat-line');
    if (existingStat) existingStat.remove();
    const existingNextChips = this.resultsBlockEl.querySelector('.reveal-next-chips');
    if (existingNextChips) existingNextChips.remove();

    // Enable Challenge a friend
    this.challengeFriendBtn.style.display = 'inline-block';
    this.challengeFriendBtn.onclick = () => {
      this.callbacks.onChallengeFriend?.(
        duelData.party1.day,
        duelData.party1.month,
        duelData.party1.year,
        duelData.party1.hit?.firstOccurrence ?? 0
      );
    };

    // Render duel stack
    this.duelStackEl.innerHTML = '';
    this.duelStackEl.style.display = 'flex';

    const parties = [
      { party: duelData.party1, isWinner: duelData.winner === 1 },
      { party: duelData.party2, isWinner: duelData.winner === 2 }
    ];

    for (const { party, isWinner } of parties) {
      const row = document.createElement('div');
      row.className = `reveal-duel-row${isWinner ? ' is-winner' : ''}`;

      const meta = document.createElement('div');
      meta.className = 'reveal-duel-meta';

      const dateLabel = document.createElement('div');
      dateLabel.className = 'reveal-duel-date-label';
      dateLabel.textContent = party.label;

      const posLabel = document.createElement('div');
      posLabel.className = 'reveal-duel-pos-label';
      posLabel.textContent = party.hit
        ? `digit ${(party.hit.firstOccurrence + 1).toLocaleString()} (${party.hit.format})`
        : 'Not found in 10M digits';

      meta.appendChild(dateLabel);
      meta.appendChild(posLabel);
      row.appendChild(meta);

      // Mini ribbon of cells (11 cells around occurrence)
      if (party.hit) {
        const ribbon = document.createElement('div');
        ribbon.className = 'reveal-duel-mini-ribbon';
        const startPos = Math.max(0, party.hit.firstOccurrence - 2);
        const matchLen = party.hit.patternStr.length;
        const totalCells = matchLen + 4;

        for (let c = 0; c < totalCells; c++) {
          const idx = startPos + c;
          const cell = document.createElement('div');
          const isMatch = idx >= party.hit.firstOccurrence && idx < party.hit.firstOccurrence + matchLen;
          cell.className = `reveal-duel-cell${isMatch ? ' is-match' : ''}`;
          cell.textContent = idx < this.piDigits.length ? this.piDigits[idx].toString() : '0';
          ribbon.appendChild(cell);
        }
        row.appendChild(ribbon);

        const flyBtn = document.createElement('button');
        flyBtn.type = 'button';
        flyBtn.className = 'reveal-duel-fly-btn';
        flyBtn.textContent = 'Show in field';
        const hitCopy = party.hit;
        flyBtn.addEventListener('click', () => {
          this.dismiss();
          this.callbacks.onShowInField?.(
            hitCopy.firstOccurrence,
            hitCopy.patternStr.length,
            hitCopy.format,
            hitCopy.patternStr
          );
        });
        row.appendChild(flyBtn);
      }

      this.duelStackEl.appendChild(row);
    }

    // Headlines
    this.headlineEl.textContent = duelData.verdict;
    this.metaLineEl.textContent = 'Comparison across 10,000,000 digits of π.';
    this.resultsBlockEl.style.visibility = 'visible';
    this.resultsBlockEl.style.opacity = '1';
    this.resultsBlockEl.style.transform = 'translateY(0)';
  }

  private setupRibbonContent(
    hit: RevealHitData,
    slotsCount: number,
    cellWidth: number,
    slotMatchStart: number
  ) {
    const D = 90; // slots travel distance
    const totalSlots = 12 + slotsCount + D + 12;

    // Index of slot 0 in the window relative to pi
    const windowStartDigit = hit.firstOccurrence - slotMatchStart;
    const ribbonStartDigit = windowStartDigit - 12;

    this.ribbonTrackEl.innerHTML = '';

    // Position underline bar under matched slots at rest
    const underlineLeft = slotMatchStart * cellWidth;
    const underlineWidth = hit.patternStr.length * cellWidth;
    this.underlineBarEl.style.left = `${underlineLeft}px`;
    this.underlineBarEl.style.width = `${underlineWidth}px`;
    this.underlineBarEl.style.transform = 'scaleX(0)';

    // Build all cells before animating
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < totalSlots; i++) {
      const piIndex = ribbonStartDigit + i;
      let digitVal = 0;
      if (piIndex >= 0 && piIndex < this.piDigits.length) {
        digitVal = this.piDigits[piIndex];
      }

      const cell = document.createElement('div');
      cell.className = 'reveal-digit-cell';
      cell.dataset.slotIndex = i.toString();

      // Check if this slot belongs to the matched sequence at rest
      const isMatchSlot = i >= 12 + slotMatchStart && i < 12 + slotMatchStart + hit.patternStr.length;
      if (isMatchSlot) {
        cell.dataset.isMatch = 'true';
        const matchOffset = i - (12 + slotMatchStart);
        if (hit.letterLabels && hit.letterLabels[matchOffset]) {
          const letterSpan = document.createElement('span');
          letterSpan.className = 'reveal-letter-sub';
          letterSpan.textContent = hit.letterLabels[matchOffset];
          cell.appendChild(letterSpan);
        }
      } else {
        cell.dataset.isContext = 'true';
      }

      cell.insertAdjacentText('afterbegin', digitVal.toString());
      fragment.appendChild(cell);
    }

    this.ribbonTrackEl.appendChild(fragment);
  }

  private setupCipherDeck(hit: RevealHitData) {
    this.cipherDeckEl.innerHTML = '';

    const tagline = document.createElement('div');
    tagline.className = 'reveal-cipher-tagline';
    tagline.textContent = 'Telephone Keypad Cipher Decryption';
    this.cipherDeckEl.appendChild(tagline);

    const lettersRow = document.createElement('div');
    lettersRow.className = 'reveal-cipher-row';

    const arrowsRow = document.createElement('div');
    arrowsRow.className = 'reveal-cipher-row';

    const digitsRow = document.createElement('div');
    digitsRow.className = 'reveal-cipher-row';

    const letters = hit.letterLabels || (hit.name ? hit.name.toUpperCase().split('') : []);
    const digits = hit.patternStr.split('');

    for (let i = 0; i < letters.length; i++) {
      const char = letters[i];
      const digit = digits[i] || '0';

      const lTile = document.createElement('div');
      lTile.className = 'reveal-cipher-letter-tile';
      lTile.innerHTML = `
        <span class="reveal-cipher-letter-char">${char}</span>
        <span class="reveal-cipher-keypad-sub">key ${digit}</span>
      `;
      lettersRow.appendChild(lTile);

      const arrow = document.createElement('span');
      arrow.className = 'reveal-cipher-arrow';
      arrow.textContent = '↓';
      arrowsRow.appendChild(arrow);

      const dTile = document.createElement('div');
      dTile.className = 'reveal-cipher-digit-tile is-spinning';
      dTile.dataset.targetDigit = digit;
      dTile.textContent = Math.floor(Math.random() * 10).toString();
      digitsRow.appendChild(dTile);
    }

    this.cipherDeckEl.appendChild(lettersRow);
    this.cipherDeckEl.appendChild(arrowsRow);
    this.cipherDeckEl.appendChild(digitsRow);
  }

  private setupResultsContent(hit: RevealHitData) {
    const digitFormatted = (hit.firstOccurrence + 1).toLocaleString();

    if (hit.name) {
      this.headlineEl.textContent = `${hit.name} appears at digit ${digitFormatted}.`;
    } else if (hit.day && hit.month && hit.year) {
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      const monthStr = monthNames[hit.month - 1] || `Month ${hit.month}`;
      this.headlineEl.textContent = `${hit.day} ${monthStr} ${hit.year} appears at digit ${digitFormatted}.`;
    } else {
      this.headlineEl.textContent = `Match appears at digit ${digitFormatted}.`;
    }

    // Surprising stat line (Task 3d)
    const existingStat = this.resultsBlockEl.querySelector('.reveal-stat-line');
    if (existingStat) existingStat.remove();
    const existingNextChips = this.resultsBlockEl.querySelector('.reveal-next-chips');
    if (existingNextChips) existingNextChips.remove();

    if (hit.day && hit.month && hit.year) {
      const pText = hit.percentile !== undefined && hit.percentile > 0
        ? `Earlier than ${hit.percentile}% of dates from 1950 to 2029. `
        : '';
      const statLine = document.createElement('div');
      statLine.className = 'reveal-stat-line';
      statLine.style.fontFamily = 'var(--font-mono)';
      statLine.style.fontSize = '12px';
      statLine.style.color = 'var(--text-primary)';
      statLine.style.margin = '4px 0 8px';
      statLine.textContent = `${pText}Appears ${hit.totalOccurrences} times in the first 10M digits.`;
      this.headlineEl.insertAdjacentElement('afterend', statLine);

      // Next step chips (Task 3e)
      const nextChips = document.createElement('div');
      nextChips.className = 'reveal-next-chips';
      nextChips.style.display = 'flex';
      nextChips.style.gap = '8px';
      nextChips.style.justifyContent = 'center';
      nextChips.style.marginTop = '8px';
      nextChips.innerHTML = `
        <button type="button" class="stage-chip-btn" id="reveal-chip-try-name">Try your name</button>
        <button type="button" class="stage-chip-btn" id="reveal-chip-compare-date">Compare with another date</button>
      `;
      this.metaLineEl.insertAdjacentElement('afterend', nextChips);

      const tryNameBtn = nextChips.querySelector('#reveal-chip-try-name');
      tryNameBtn?.addEventListener('click', () => {
        this.dismiss();
        this.callbacks.onSwitchToName?.();
      });

      const compareDateBtn = nextChips.querySelector('#reveal-chip-compare-date');
      compareDateBtn?.addEventListener('click', () => {
        this.dismiss();
        this.callbacks.onCompareDate?.();
      });
    } else if (hit.name) {
      // Task 4d: Result block for Name
      const occText = hit.pieces && hit.pieces.length > 0
        ? `Found as ${hit.pieces.length} contiguous pieces in 10M digits.`
        : `Appears ${hit.totalOccurrences} times in the first 10M digits.`;

      const statLine = document.createElement('div');
      statLine.className = 'reveal-stat-line';
      statLine.style.fontFamily = 'var(--font-mono)';
      statLine.style.fontSize = '12px';
      statLine.style.color = 'var(--text-primary)';
      statLine.style.margin = '4px 0 8px';
      statLine.textContent = occText;
      this.headlineEl.insertAdjacentElement('afterend', statLine);

      // Next step chips (Task 4d)
      const nextChips = document.createElement('div');
      nextChips.className = 'reveal-next-chips';
      nextChips.style.display = 'flex';
      nextChips.style.gap = '8px';
      nextChips.style.justifyContent = 'center';
      nextChips.style.marginTop = '8px';
      nextChips.innerHTML = `
        <button type="button" class="stage-chip-btn" id="reveal-chip-friend-name">Try your friend's name</button>
        <button type="button" class="stage-chip-btn" id="reveal-chip-try-date">Try a date</button>
      `;
      this.metaLineEl.insertAdjacentElement('afterend', nextChips);

      const tryFriendBtn = nextChips.querySelector('#reveal-chip-friend-name');
      tryFriendBtn?.addEventListener('click', () => {
        this.dismiss();
        this.callbacks.onTryAnotherName?.();
      });

      const tryDateBtn = nextChips.querySelector('#reveal-chip-try-date');
      tryDateBtn?.addEventListener('click', () => {
        this.dismiss();
        this.callbacks.onSwitchToDate?.();
      });
    }

    if (hit.name) {
      const occStr = hit.pieces && hit.pieces.length > 0
        ? `Found as ${hit.pieces.length} pieces`
        : `First of ${hit.totalOccurrences} occurrences`;
      this.metaLineEl.textContent = `${hit.name} encodes as ${hit.patternStr}. ${occStr}, at digit ${digitFormatted}.`;
    } else {
      this.metaLineEl.textContent = `Format ${hit.format}, digits ${hit.patternStr}, occurrence ${hit.currentOccurrenceIndex + 1} of ${hit.totalOccurrences}.`;
    }

    if (hit.pieces && hit.pieces.length > 0) {
      this.missedLineEl.innerHTML = `
        <div style="margin-bottom: 6px; font-weight: 500;">Found as ${hit.pieces.length} contiguous pieces:</div>
        <div class="reveal-pieces-stack">
          ${hit.pieces.map((p, pIdx) => `
            <div class="reveal-piece-row">
              <span class="reveal-piece-digits">Piece ${pIdx + 1}: ${p.pieceStr}</span>
              <button type="button" class="reveal-piece-fly" data-pos="${p.firstOccurrence}" data-len="${p.pieceStr.length}">
                Show in the field (digit ${(p.firstOccurrence + 1).toLocaleString()})
              </button>
            </div>
          `).join('')}
        </div>
      `;
      this.missedLineEl.style.display = 'block';

      const flyBtns = this.missedLineEl.querySelectorAll<HTMLButtonElement>('.reveal-piece-fly');
      flyBtns.forEach((btn, pIdx) => {
        btn.addEventListener('click', () => {
          const pos = parseInt(btn.dataset.pos || '0', 10);
          const len = parseInt(btn.dataset.len || '1', 10);
          const pieceLetters = (hit.pieces && hit.pieces[pIdx]?.letterLabels) || undefined;
          this.dismiss();
          this.callbacks.onShowInField?.(pos, len, 'Name Piece', hit.patternStr, pieceLetters);
        });
      });
    } else if (hit.missedLongerFormat && hit.missedLongerPattern) {
      this.missedLineEl.textContent = `${hit.missedLongerFormat} (${hit.missedLongerPattern}) is not in these 10M digits; that is expected for 8-digit strings (about 10% chance).`;
      this.missedLineEl.style.display = 'block';
    } else {
      this.missedLineEl.style.display = 'none';
    }

    // Stepper
    this.stepperContainerEl.innerHTML = `
      <button type="button" id="reveal-prev-btn" class="reveal-step-btn" ${hit.currentOccurrenceIndex <= 0 ? 'disabled' : ''} aria-label="Previous occurrence">&lt; Prev</button>
      <span>${hit.currentOccurrenceIndex + 1} of ${hit.totalOccurrences}</span>
      <button type="button" id="reveal-next-btn" class="reveal-step-btn" ${hit.currentOccurrenceIndex >= hit.totalOccurrences - 1 ? 'disabled' : ''} aria-label="Next occurrence">Next &gt;</button>
    `;

    const prevBtn = this.stepperContainerEl.querySelector('#reveal-prev-btn') as HTMLButtonElement;
    const nextBtn = this.stepperContainerEl.querySelector('#reveal-next-btn') as HTMLButtonElement;

    prevBtn?.addEventListener('click', () => {
      if (this.currentHit && this.currentHit.currentOccurrenceIndex > 0) {
        const nextIdx = this.currentHit.currentOccurrenceIndex - 1;
        this.stepToOccurrence(nextIdx);
      }
    });

    nextBtn?.addEventListener('click', () => {
      if (this.currentHit && this.currentHit.currentOccurrenceIndex < this.currentHit.totalOccurrences - 1) {
        const nextIdx = this.currentHit.currentOccurrenceIndex + 1;
        this.stepToOccurrence(nextIdx);
      }
    });
  }

  private executeFullTimeline(hit: RevealHitData, cellWidth: number, _slotMatchStart: number) {
    // Task 3c: scale all durations by 0.69 (total sequence at most 1.8s)
    const mult = this.durationMultiplier * 0.69;
    const D = 90;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

    this.isAnimatingSequence = true;
    this.timeoutIds.forEach(id => clearTimeout(id));
    this.timeoutIds = [];

    // Start offset: ribbon shifted to the left by D slots
    const startTranslateX = -D * cellWidth;
    const endTranslateX = Math.round(0 * dpr) / dpr;

    // Reset initial styles
    this.overlayEl.style.opacity = '0';
    this.glassCardEl.style.opacity = '0';
    this.glassCardEl.style.transform = 'scale(0.985)';
    this.resultsBlockEl.style.visibility = 'hidden';
    this.resultsBlockEl.style.opacity = '0';
    this.resultsBlockEl.style.transform = 'translateY(6px)';
    this.counterNumberEl.textContent = '0';

    // Reset ribbon cells to default clean state
    const allCells = this.ribbonTrackEl.querySelectorAll<HTMLElement>('.reveal-digit-cell');
    allCells.forEach(cell => {
      cell.classList.remove('is-match', 'is-context');
    });

    // Skip listener for click, tap, or Space (Task 3c)
    const onSkipTrigger = (e: Event) => {
      if (!this.isVisible || !this.isAnimatingSequence) return;
      if (e instanceof KeyboardEvent && e.code !== 'Space') return;
      if (e.target instanceof HTMLButtonElement) return; // Allow clicking buttons
      this.skipToEnd();
    };

    const cleanupSkip = () => {
      window.removeEventListener('pointerdown', onSkipTrigger);
      window.removeEventListener('keydown', onSkipTrigger);
    };

    window.addEventListener('pointerdown', onSkipTrigger);
    window.addEventListener('keydown', onSkipTrigger);

    // ========================================================
    // T = 0ms to 300ms: Overlay and Glass Fade-In
    // ========================================================
    const overlayAnim = this.overlayEl.animate(
      [
        { opacity: '0' },
        { opacity: '0.7' }
      ],
      {
        duration: 300 * mult,
        fill: 'both',
        easing: 'ease-out'
      }
    );
    this.activeAnimations.push(overlayAnim);

    const glassAnim = this.glassCardEl.animate(
      [
        { opacity: '0', transform: 'scale(0.985)' },
        { opacity: '1', transform: 'scale(1)' }
      ],
      {
        duration: 300 * mult,
        fill: 'both',
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)'
      }
    );
    this.activeAnimations.push(glassAnim);

    // Specular sweep crossing the glass left to right once (0 to 900ms)
    const specularAnim = this.specularEl.animate(
      [
        { opacity: '0', transform: 'translateX(-150%) skewX(-20deg)' },
        { opacity: '0.85', offset: 0.2 },
        { opacity: '0.85', offset: 0.7 },
        { opacity: '0', transform: 'translateX(750px) skewX(-20deg)' }
      ],
      {
        duration: 900 * mult,
        fill: 'both',
        easing: 'ease-out'
      }
    );
    this.activeAnimations.push(specularAnim);

    // ========================================================
    // T = 300ms to 2000ms: Ribbon Slide + Rolling Counter
    // ========================================================
    const slideDuration = 1700 * mult;
    const slideDelay = 300 * mult;

    const t1 = window.setTimeout(() => {
      if (!this.isVisible) return;

      // Add will-change: transform only during animation
      this.ribbonTrackEl.style.willChange = 'transform';

      const ribbonAnim = this.ribbonTrackEl.animate(
        [
          { transform: `translateX(${startTranslateX}px)` },
          { transform: `translateX(${endTranslateX}px)` }
        ],
        {
          duration: slideDuration,
          fill: 'both',
          easing: this.easingCssString
        }
      );
      this.activeAnimations.push(ribbonAnim);

      ribbonAnim.onfinish = () => {
        // Mobile vibration and chime on ribbon land (Task 3f)
        navigator.vibrate?.(12);
        sound.playChime();
        this.ribbonTrackEl.style.willChange = 'auto';
        this.ribbonTrackEl.style.transform = `translateX(${endTranslateX}px)`;
      };

      // If Name Flow: Run cryptographic split-flap cipher tumbler animation
      if (hit.name) {
        if (this.cipherIntervalId !== null) {
          clearInterval(this.cipherIntervalId);
        }
        const digitTiles = this.cipherDeckEl.querySelectorAll<HTMLElement>('.reveal-cipher-digit-tile');
        const letterTiles = this.cipherDeckEl.querySelectorAll<HTMLElement>('.reveal-cipher-letter-tile');

        this.cipherIntervalId = window.setInterval(() => {
          digitTiles.forEach(tile => {
            if (tile.classList.contains('is-spinning')) {
              tile.textContent = Math.floor(Math.random() * 10).toString();
            }
          });
        }, 40);

        digitTiles.forEach((tile, idx) => {
          const lockTime = (450 + idx * 75) * mult;
          const tLock = window.setTimeout(() => {
            if (!this.isVisible) return;
            tile.classList.remove('is-spinning');
            tile.classList.add('is-locked');
            tile.textContent = tile.dataset.targetDigit || '0';
            if (letterTiles[idx]) {
              letterTiles[idx].classList.add('is-locked');
            }
            this.callbacks.onUnderlineDigit?.(idx);
            navigator.vibrate?.(10);
            sound.playTick();
          }, lockTime);
          this.timeoutIds.push(tLock);
        });
      }

      // Roll position counter with identical cubic-bezier easing
      const targetPos = hit.firstOccurrence + 1;
      const counterStartTime = performance.now();

      const rollStep = (now: number) => {
        const elapsed = now - counterStartTime;
        const progress = Math.min(1.0, elapsed / slideDuration);
        const easedProgress = this.easingFn(progress);
        const currentVal = Math.round(easedProgress * targetPos);

        this.counterNumberEl.textContent = currentVal.toLocaleString();

        if (progress < 1.0 && this.isVisible) {
          this.activeRafId = requestAnimationFrame(rollStep);
        } else {
          this.counterNumberEl.textContent = targetPos.toLocaleString();
          this.activeRafId = null;
        }
      };

      this.activeRafId = requestAnimationFrame(rollStep);
    }, slideDelay);
    this.timeoutIds.push(t1);

    // ========================================================
    // T = 2000ms to 2600ms: Highlight Sweep
    // ========================================================
    const highlightStart = 2000 * mult;
    const t2 = window.setTimeout(() => {
      if (!this.isVisible) return;

      // Underline sweep across matched digits left to right
      const underlineAnim = this.underlineBarEl.animate(
        [
          { transform: 'scaleX(0)' },
          { transform: 'scaleX(1)' }
        ],
        {
          duration: 400 * mult,
          fill: 'both',
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
        }
      );
      this.activeAnimations.push(underlineAnim);

      // Settle context digits to 45% opacity
      allCells.forEach(cell => {
        if (cell.dataset.isContext === 'true') {
          cell.animate(
            [
              { opacity: '1' },
              { opacity: '0.45' }
            ],
            {
              duration: 350 * mult,
              fill: 'both',
              easing: 'ease-out'
            }
          );
          cell.classList.add('is-context');
        }
      });

      // Staggered accent tint on matched digits (40ms per digit)
      const matchedCells = this.ribbonTrackEl.querySelectorAll<HTMLElement>('.reveal-digit-cell[data-is-match="true"]');
      matchedCells.forEach((cell, idx) => {
        const tCell = window.setTimeout(() => {
          if (!this.isVisible) return;
          cell.classList.add('is-match');
          this.callbacks.onUnderlineDigit?.(idx);
          cell.animate(
            [
              { backgroundColor: 'transparent' },
              { backgroundColor: 'rgba(255, 87, 34, 0.14)' }
            ],
            {
              duration: 250 * mult,
              fill: 'both',
              easing: 'ease-out'
            }
          );
        }, idx * 40 * mult);
        this.timeoutIds.push(tCell);
      });
    }, highlightStart);
    this.timeoutIds.push(t2);

    // ========================================================
    // T = 2600ms to 2850ms: Result Text Fade-In
    // ========================================================
    const resultsStart = 2600 * mult;
    const t3 = window.setTimeout(() => {
      if (!this.isVisible) return;

      this.resultsBlockEl.style.visibility = 'visible';
      const resultsAnim = this.resultsBlockEl.animate(
        [
          { opacity: '0', transform: 'translateY(6px)' },
          { opacity: '1', transform: 'translateY(0px)' }
        ],
        {
          duration: 250 * mult,
          fill: 'both',
          easing: 'ease-out'
        }
      );
      this.activeAnimations.push(resultsAnim);
      resultsAnim.onfinish = () => {
        this.resultsBlockEl.style.opacity = '1';
        this.resultsBlockEl.style.transform = 'translateY(0px)';
        this.isAnimatingSequence = false;
        cleanupSkip();
      };
    }, resultsStart);
    this.timeoutIds.push(t3);
  }

  public skipToEnd() {
    if (!this.isVisible || !this.currentHit) return;

    this.timeoutIds.forEach(id => clearTimeout(id));
    this.timeoutIds = [];

    this.activeAnimations.forEach(anim => {
      try {
        anim.finish();
      } catch { }
    });
    this.activeAnimations = [];

    if (this.activeRafId !== null) {
      cancelAnimationFrame(this.activeRafId);
      this.activeRafId = null;
    }

    if (this.cipherIntervalId !== null) {
      clearInterval(this.cipherIntervalId);
      this.cipherIntervalId = null;
    }

    const digitTiles = this.cipherDeckEl.querySelectorAll<HTMLElement>('.reveal-cipher-digit-tile');
    const letterTiles = this.cipherDeckEl.querySelectorAll<HTMLElement>('.reveal-cipher-letter-tile');
    digitTiles.forEach((tile, idx) => {
      tile.classList.remove('is-spinning');
      tile.classList.add('is-locked');
      tile.textContent = tile.dataset.targetDigit || '0';
      if (letterTiles[idx]) {
        letterTiles[idx].classList.add('is-locked');
      }
    });

    navigator.vibrate?.(12);

    this.overlayEl.style.opacity = '0.7';
    this.glassCardEl.style.opacity = '1';
    this.glassCardEl.style.transform = 'scale(1)';
    this.ribbonTrackEl.style.transform = 'translateX(0px)';
    this.ribbonTrackEl.style.willChange = 'auto';
    this.counterNumberEl.textContent = (this.currentHit.firstOccurrence + 1).toLocaleString();
    this.underlineBarEl.style.transform = 'scaleX(1)';

    const allCells = this.ribbonTrackEl.querySelectorAll<HTMLElement>('.reveal-digit-cell');
    allCells.forEach(cell => {
      if (cell.dataset.isMatch === 'true') {
        cell.classList.add('is-match');
        cell.style.backgroundColor = 'rgba(255, 87, 34, 0.14)';
      } else if (cell.dataset.isContext === 'true') {
        cell.classList.add('is-context');
        cell.style.opacity = '0.45';
      }
    });

    this.resultsBlockEl.style.visibility = 'visible';
    this.resultsBlockEl.style.opacity = '1';
    this.resultsBlockEl.style.transform = 'translateY(0px)';
    this.isAnimatingSequence = false;
  }

  /**
   * Occurrence and format stepping:
   * Reuses the same window without repeating the entrance.
   * Counter rolls over 900ms, ribbon slides rightwards over 900ms, highlight re-sweeps over 400ms.
   */
  public stepToOccurrence(newOccIndex: number) {
  if (!this.currentHit || newOccIndex < 0 || newOccIndex >= this.currentHit.occurrences.length) {
    return;
  }

  const mult = this.durationMultiplier;
  const oldPos = this.currentHit.occurrences[this.currentHit.currentOccurrenceIndex] + 1;
  const newPos = this.currentHit.occurrences[newOccIndex] + 1;

  this.currentHit.currentOccurrenceIndex = newOccIndex;
  this.currentHit.firstOccurrence = this.currentHit.occurrences[newOccIndex];

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  const slotsCount = isMobile ? 11 : 19;
  const cellWidth = isMobile ? 24 : 32;
  const matchLen = this.currentHit.patternStr.length;
  const slotMatchStart = Math.max(0, Math.floor((slotsCount - matchLen) / 2));

  this.setupRibbonContent(this.currentHit, slotsCount, cellWidth, slotMatchStart);
  this.setupResultsContent(this.currentHit);

  // 1. Counter rolls to new index over 900ms
  const stepDuration = 900 * mult;
  const startTime = performance.now();

  const rollStep = (now: number) => {
    const elapsed = now - startTime;
    const progress = Math.min(1.0, elapsed / stepDuration);
    const easedProgress = this.easingFn(progress);
    const currentVal = Math.round(oldPos + (newPos - oldPos) * easedProgress);

    this.counterNumberEl.textContent = currentVal.toLocaleString();

    if (progress < 1.0 && this.isVisible) {
      this.activeRafId = requestAnimationFrame(rollStep);
    } else {
      this.counterNumberEl.textContent = newPos.toLocaleString();
      this.activeRafId = null;
    }
  };

  if (this.activeRafId !== null) {
    cancelAnimationFrame(this.activeRafId);
  }
  this.activeRafId = requestAnimationFrame(rollStep);

  // 2. Ribbon slides rightwards over 900ms
  this.ribbonTrackEl.style.willChange = 'transform';
  const startTranslateX = -45 * cellWidth;
  const ribbonAnim = this.ribbonTrackEl.animate(
    [
      { transform: `translateX(${startTranslateX}px)` },
      { transform: 'translateX(0px)' }
    ],
    {
      duration: stepDuration,
      fill: 'both',
      easing: this.easingCssString
    }
  );
  this.activeAnimations.push(ribbonAnim);

  ribbonAnim.onfinish = () => {
    this.ribbonTrackEl.style.willChange = 'auto';
    this.ribbonTrackEl.style.transform = 'translateX(0px)';
  };

  // 3. Highlight re-sweeps over 400ms after slide
  setTimeout(() => {
    if (!this.isVisible) return;
    this.underlineBarEl.animate(
      [
        { transform: 'scaleX(0)' },
        { transform: 'scaleX(1)' }
      ],
      {
        duration: 400 * mult,
        fill: 'both',
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
      }
    );

    const matchedCells = this.ribbonTrackEl.querySelectorAll<HTMLElement>('.reveal-digit-cell[data-is-match="true"]');
    matchedCells.forEach((cell, idx) => {
      setTimeout(() => {
        if (!this.isVisible) return;
        cell.classList.add('is-match');
      }, idx * 30 * mult);
    });
  }, stepDuration);

  this.callbacks.onStepOccurrence?.(newOccIndex, newPos);
}

  public replay() {
  if (this.currentHit) {
    this.startReveal(this.currentHit);
    this.callbacks.onReplay?.();
  }
}

  /**
   * Updates supplementary data (all occurrences, total occurrences, longer format miss copy)
   * stream-populated after first-hit reveal begins.
   */
  public updateSupplementaryData(
    occurrences: number[],
    totalOccurrences: number,
    missedLongerFormat?: string,
    missedLongerPattern?: string,
    percentile?: number
  ) {
    if (!this.currentHit) return;
    this.currentHit.occurrences = occurrences;
    this.currentHit.totalOccurrences = totalOccurrences;
    if (percentile !== undefined) {
      this.currentHit.percentile = percentile;
    }
    if (missedLongerFormat && missedLongerPattern) {
      this.currentHit.missedLongerFormat = missedLongerFormat;
      this.currentHit.missedLongerPattern = missedLongerPattern;
    }
    this.setupResultsContent(this.currentHit);
  }

  private renderReducedMotionState(hit: RevealHitData) {
  this.overlayEl.style.opacity = '0.7';
  this.glassCardEl.style.opacity = '1';
  this.glassCardEl.style.transform = 'scale(1)';
  this.ribbonTrackEl.style.transform = 'translateX(0px)';
  this.underlineBarEl.style.transform = 'scaleX(1)';
  this.counterNumberEl.textContent = (hit.firstOccurrence + 1).toLocaleString();
  this.resultsBlockEl.style.opacity = '1';
  this.resultsBlockEl.style.transform = 'translateY(0px)';

  const allCells = this.ribbonTrackEl.querySelectorAll<HTMLElement>('.reveal-digit-cell');
  allCells.forEach(cell => {
    if (cell.dataset.isMatch === 'true') {
      cell.classList.add('is-match');
    } else {
      cell.classList.add('is-context');
    }
  });
}

  public dismiss() {
    this.cancelRunningAnimations();
    this.isVisible = false;
    this.resultsBlockEl.style.visibility = 'hidden';

    const overlayFade = this.overlayEl.animate(
      [{ opacity: '0.7' }, { opacity: '0' }],
      { duration: 200, fill: 'forwards', easing: 'ease-out' }
    );
    this.activeAnimations.push(overlayFade);

    const glassFade = this.glassCardEl.animate(
      [{ opacity: '1', transform: 'scale(1)' }, { opacity: '0', transform: 'scale(0.985)' }],
      { duration: 200, fill: 'forwards', easing: 'ease-in' }
    );
    this.activeAnimations.push(glassFade);

    glassFade.onfinish = () => {
      if (this.isVisible) return;
      this.overlayEl.style.display = 'none';
      this.modalContainerEl.style.display = 'none';
      try { overlayFade.cancel(); } catch {}
      try { glassFade.cancel(); } catch {}
      this.callbacks.onClose?.();
    };
  }

  private cancelRunningAnimations() {
    if (this.cipherIntervalId !== null) {
      clearInterval(this.cipherIntervalId);
      this.cipherIntervalId = null;
    }
    if (this.activeRafId !== null) {
      cancelAnimationFrame(this.activeRafId);
      this.activeRafId = null;
    }
    this.activeAnimations.forEach(anim => {
      try {
        anim.cancel();
      } catch { }
    });
    this.activeAnimations = [];

    // Cancel all animations on modal elements so fill does not lock opacity to 0
    [this.overlayEl, this.glassCardEl, this.resultsBlockEl, this.duelStackEl].forEach(el => {
      if (el && typeof el.getAnimations === 'function') {
        el.getAnimations().forEach(a => {
          try { a.cancel(); } catch {}
        });
      }
    });
  }
}
