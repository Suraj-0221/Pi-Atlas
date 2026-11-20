/**
 * Date of Birth search panel:
 * - 3 auto-advancing fields (DD, MM, YYYY)
 * - Live Poisson chance line with 2px accent bar: 1 - exp(-N / 10^n)
 * - Headline in serif ("14 May 1998 appears at digit N.")
 * - Stepper buttons [<] [>] through occurrences
 * - Honest 8-digit degradation note
 * - Copy Link & Save as Image buttons
 * - Session-only Recent Searches (last 5)
 */

import { generateDateCandidates } from '../encode/date.ts';
import { DateCandidate, DateSearchResult } from '../workers/searchProtocol.ts';

export interface DatePanelCallbacks {
  onSearch: (candidates: DateCandidate[], day: number, month: number, year: number) => void;
  onNavigateToOccurrence: (index: number, length: number, format: string, patternStr: string) => void;
  onShare?: () => void;
  onChallengeFriend?: (day: number, month: number, year: number, hitPos: number) => void;
  onDuel?: (
    date1: { day: number; month: number; year: number },
    date2: { day: number; month: number; year: number }
  ) => void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export class DatePanel {
  private container: HTMLElement;
  private callbacks: DatePanelCallbacks;

  private dayInput!: HTMLInputElement;
  private monthInput!: HTMLInputElement;
  private yearInput!: HTMLInputElement;
  private dayInput2!: HTMLInputElement;
  private monthInput2!: HTMLInputElement;
  private yearInput2!: HTMLInputElement;
  private compareRow!: HTMLElement;
  private toggleCompareBtn!: HTMLElement;
  private closeCompareBtn!: HTMLElement;
  private isCompareActive: boolean = false;
  private vsFriendDate: { day: number; month: number; year: number; raw: string } | null = null;
  private friendPosition: number | null = null;
  private chanceText!: HTMLElement;
  private chanceBarFill!: HTMLElement;
  private resultContainer!: HTMLElement;
  private recentContainer!: HTMLElement;
  private headlineEl!: HTMLElement;

  private currentResult: DateSearchResult | null = null;
  private currentOccurrenceIdx: number = 0;
  private recentSearches: { day: number; month: number; year: number }[] = [];
  private autoSearchTimer: number | null = null;
  private isReady: boolean = false;
  private loadingPercent: number = 0;

  constructor(container: HTMLElement, callbacks: DatePanelCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
  }

  public render() {
    this.container.innerHTML = `
      <h1 class="stage-headline" id="dob-headline">Where is your birthday in π?</h1>
      <form id="dob-form" class="panel-body">
        <div class="stage-inputs-row">
          <input type="text" id="dob-day" class="stage-mono-input" placeholder="DD" maxlength="2" required aria-label="Day" inputmode="numeric" pattern="[0-9]*" autocomplete="off" />
          <span class="stage-input-sep">/</span>
          <input type="text" id="dob-month" class="stage-mono-input" placeholder="MM" maxlength="2" required aria-label="Month" inputmode="numeric" pattern="[0-9]*" autocomplete="off" />
          <span class="stage-input-sep">/</span>
          <input type="text" id="dob-year" class="stage-mono-input year-input" placeholder="YYYY" maxlength="4" required aria-label="Year" inputmode="numeric" pattern="[0-9]*" autocomplete="off" />
        </div>

        <!-- Compare Row (Task 4) -->
        <div id="dob-compare-section" class="stage-hide-collapsed" style="margin-top: 6px;">
          <div style="display: flex; align-items: center; justify-content: flex-start;">
            <button type="button" id="btn-toggle-compare" class="stage-chip-btn" style="padding: 2px 8px; font-size: 0.72rem; text-decoration: underline; background: transparent; border-style: dashed; color: var(--accent);">
              Compare with another date
            </button>
          </div>
          <div id="dob-compare-row" style="display: none; margin-top: 8px;">
            <div style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--text-muted); margin-bottom: 4px;">Compare with:</div>
            <div class="stage-inputs-row" style="justify-content: flex-start;">
              <input type="text" id="dob-day-2" class="stage-mono-input" placeholder="DD" maxlength="2" aria-label="Day 2" inputmode="numeric" pattern="[0-9]*" autocomplete="off" />
              <span class="stage-input-sep">/</span>
              <input type="text" id="dob-month-2" class="stage-mono-input" placeholder="MM" maxlength="2" aria-label="Month 2" inputmode="numeric" pattern="[0-9]*" autocomplete="off" />
              <span class="stage-input-sep">/</span>
              <input type="text" id="dob-year-2" class="stage-mono-input year-input" placeholder="YYYY" maxlength="4" aria-label="Year 2" inputmode="numeric" pattern="[0-9]*" autocomplete="off" />
              <button type="button" id="btn-close-compare" class="tab-btn" style="margin-left: 6px; padding: 2px 8px; font-size: 0.75rem;" title="Cancel comparison">✕</button>
            </div>
          </div>
        </div>

        <!-- "Try it" chips (Task 2d) -->
        <div class="stage-chips-row">
          <span class="stage-chips-label">Try it:</span>
          <button type="button" class="stage-chip-btn" id="chip-date-piday">Pi Day (14 Mar)</button>
          <button type="button" class="stage-chip-btn" id="chip-date-today">Today</button>
          <button type="button" class="stage-chip-btn" id="chip-date-2000">1 Jan 2000</button>
        </div>

        <!-- Live chance line with 2px accent bar -->
        <div class="stage-hide-collapsed" style="margin-top: 10px;">
          <div id="chance-text" style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--text-secondary); margin-bottom: 4px;">
            Enter date to estimate probability
          </div>
          <div style="width: 100%; height: 2px; background: var(--border-subtle); border-radius: 1px; overflow: hidden;">
            <div id="chance-bar-fill" style="width: 0%; height: 100%; background: var(--accent); transition: width 0.2s ease;"></div>
          </div>
        </div>

        <div style="margin-top: 12px;">
          <button type="submit" class="action-btn stage-hide-collapsed" id="dob-search-btn" style="width: 100%; max-width: 220px;" ${this.isReady ? '' : 'disabled'}>
            ${this.isReady ? 'Locate in π' : `Loading π… ${this.loadingPercent}%`}
          </button>
        </div>

        <div id="dob-results" class="result-note" style="display: none;"></div>

        <div id="dob-recent" class="stage-hide-collapsed" style="margin-top: 8px; font-size: 0.75rem; color: var(--text-secondary);">
          <div style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-muted); margin-bottom: 4px;">Recent searches:</div>
          <div id="recent-list" style="display: flex; flex-wrap: wrap; gap: 6px;"></div>
        </div>
      </form>
    `;

    this.headlineEl = this.container.querySelector('#dob-headline') as HTMLElement;
    this.dayInput = this.container.querySelector('#dob-day') as HTMLInputElement;
    this.monthInput = this.container.querySelector('#dob-month') as HTMLInputElement;
    this.yearInput = this.container.querySelector('#dob-year') as HTMLInputElement;
    this.dayInput2 = this.container.querySelector('#dob-day-2') as HTMLInputElement;
    this.monthInput2 = this.container.querySelector('#dob-month-2') as HTMLInputElement;
    this.yearInput2 = this.container.querySelector('#dob-year-2') as HTMLInputElement;
    this.compareRow = this.container.querySelector('#dob-compare-row') as HTMLElement;
    this.toggleCompareBtn = this.container.querySelector('#btn-toggle-compare') as HTMLElement;
    this.closeCompareBtn = this.container.querySelector('#btn-close-compare') as HTMLElement;
    this.chanceText = this.container.querySelector('#chance-text') as HTMLElement;
    this.chanceBarFill = this.container.querySelector('#chance-bar-fill') as HTMLElement;
    this.resultContainer = this.container.querySelector('#dob-results') as HTMLElement;
    this.recentContainer = this.container.querySelector('#recent-list') as HTMLElement;

    this.setupCompareUI();
    this.setupAutoAdvance();
    this.setupChips();
    this.updateProbability();
    this.renderRecentSearches();

    const form = this.container.querySelector('#dob-form') as HTMLFormElement;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.triggerSearch();
    });
  }

  private setupCompareUI() {
    this.toggleCompareBtn?.addEventListener('click', () => {
      this.isCompareActive = !this.isCompareActive;
      if (this.compareRow) {
        this.compareRow.style.display = this.isCompareActive ? 'block' : 'none';
      }
      if (this.isCompareActive) {
        this.dayInput2?.focus();
      }
    });

    this.closeCompareBtn?.addEventListener('click', () => {
      this.isCompareActive = false;
      if (this.compareRow) {
        this.compareRow.style.display = 'none';
      }
      if (this.dayInput2) this.dayInput2.value = '';
      if (this.monthInput2) this.monthInput2.value = '';
      if (this.yearInput2) this.yearInput2.value = '';
    });
  }

  public openCompare() {
    this.isCompareActive = true;
    if (this.compareRow) {
      this.compareRow.style.display = 'block';
    }
    this.dayInput2?.focus();
    this.dayInput2?.select();
  }

  public setupVsMode(vsDate: { day: number; month: number; year: number; raw: string }, friendPosition?: number) {
    this.vsFriendDate = vsDate;
    if (friendPosition !== undefined) {
      this.friendPosition = friendPosition;
      if (this.headlineEl) {
        this.headlineEl.textContent = `A friend's birthday is at digit ${(friendPosition + 1).toLocaleString()}. Where is yours?`;
      }
    } else {
      if (this.headlineEl) {
        this.headlineEl.textContent = "A friend's birthday is hidden in π. Where is yours?";
      }
    }
    this.clearAndFocus();
  }

  public updateFriendPosition(friendPosition: number) {
    this.friendPosition = friendPosition;
    if (this.headlineEl && this.vsFriendDate) {
      this.headlineEl.textContent = `A friend's birthday is at digit ${(friendPosition + 1).toLocaleString()}. Where is yours?`;
    }
  }

  public getFriendPosition(): number | null {
    return this.friendPosition;
  }

  private setupChips() {
    const chipPiDay = this.container.querySelector('#chip-date-piday');
    chipPiDay?.addEventListener('click', () => {
      this.dayInput.value = '14';
      this.monthInput.value = '03';
      this.yearInput.value = '2024';
      this.updateProbability();
      this.triggerSearch();
    });

    const chipToday = this.container.querySelector('#chip-date-today');
    chipToday?.addEventListener('click', () => {
      const now = new Date();
      this.dayInput.value = now.getDate().toString().padStart(2, '0');
      this.monthInput.value = (now.getMonth() + 1).toString().padStart(2, '0');
      this.yearInput.value = now.getFullYear().toString();
      this.updateProbability();
      this.triggerSearch();
    });

    const chip2000 = this.container.querySelector('#chip-date-2000');
    chip2000?.addEventListener('click', () => {
      this.dayInput.value = '01';
      this.monthInput.value = '01';
      this.yearInput.value = '2000';
      this.updateProbability();
      this.triggerSearch();
    });
  }

  private setupAutoAdvance() {
    const checkAutoSearch = () => {
      this.updateProbability();
      const d = this.dayInput.value;
      const m = this.monthInput.value;
      const y = this.yearInput.value;
      const d1Complete = d.length === 2 && m.length === 2 && y.length === 4;

      if (this.isCompareActive) {
        const d2 = this.dayInput2?.value || '';
        const m2 = this.monthInput2?.value || '';
        const y2 = this.yearInput2?.value || '';
        const d2Complete = d2.length === 2 && m2.length === 2 && y2.length === 4;

        if (d1Complete && d2Complete) {
          if (this.autoSearchTimer !== null) clearTimeout(this.autoSearchTimer);
          this.autoSearchTimer = window.setTimeout(() => {
            this.triggerSearch();
          }, 250);
        }
      } else if (this.vsFriendDate && d1Complete) {
        if (this.autoSearchTimer !== null) clearTimeout(this.autoSearchTimer);
        this.autoSearchTimer = window.setTimeout(() => {
          this.triggerSearch();
        }, 250);
      } else if (d1Complete) {
        if (this.autoSearchTimer !== null) clearTimeout(this.autoSearchTimer);
        this.autoSearchTimer = window.setTimeout(() => {
          this.triggerSearch();
        }, 250);
      }
    };

    this.dayInput.addEventListener('input', () => {
      this.dayInput.value = this.dayInput.value.replace(/[^0-9]/g, '');
      if (this.dayInput.value.length >= 2) {
        this.monthInput.focus();
        this.monthInput.select();
      }
      checkAutoSearch();
    });

    this.monthInput.addEventListener('input', () => {
      this.monthInput.value = this.monthInput.value.replace(/[^0-9]/g, '');
      if (this.monthInput.value.length >= 2) {
        this.yearInput.focus();
        this.yearInput.select();
      }
      checkAutoSearch();
    });

    this.yearInput.addEventListener('input', () => {
      this.yearInput.value = this.yearInput.value.replace(/[^0-9]/g, '');
      if (this.isCompareActive && this.yearInput.value.length === 4) {
        this.dayInput2?.focus();
        this.dayInput2?.select();
      }
      checkAutoSearch();
    });

    // Date 2 inputs (for comparison)
    this.dayInput2?.addEventListener('input', () => {
      this.dayInput2.value = this.dayInput2.value.replace(/[^0-9]/g, '');
      if (this.dayInput2.value.length >= 2) {
        this.monthInput2?.focus();
        this.monthInput2?.select();
      }
      checkAutoSearch();
    });

    this.monthInput2?.addEventListener('input', () => {
      this.monthInput2.value = this.monthInput2.value.replace(/[^0-9]/g, '');
      if (this.monthInput2.value.length >= 2) {
        this.yearInput2?.focus();
        this.yearInput2?.select();
      }
      checkAutoSearch();
    });

    this.yearInput2?.addEventListener('input', () => {
      this.yearInput2.value = this.yearInput2.value.replace(/[^0-9]/g, '');
      checkAutoSearch();
    });
  }

  /**
   * Live Poisson probability computation: P = 1 - exp(-N / 10^n)
   */
  private updateProbability() {
    const dLen = this.dayInput.value.length;
    const mLen = this.monthInput.value.length;
    const yLen = this.yearInput.value.length;
    const totalDigits = dLen + mLen + yLen;

    if (totalDigits === 0) {
      this.chanceText.textContent = 'Enter date to estimate probability';
      this.chanceBarFill.style.width = '0%';
      return;
    }

    const n = Math.min(8, Math.max(5, totalDigits));
    const N = 10_000_000;
    const lambda = N / Math.pow(10, n);
    const prob = 1 - Math.exp(-lambda);
    const probPct = (prob * 100).toFixed(n >= 8 ? 1 : 3);

    this.chanceText.textContent = `${n} digits: ${probPct}% chance of appearing in 10M digits`;
    this.chanceBarFill.style.width = `${Math.min(100, prob * 100)}%`;
  }

  public triggerSearch() {
    const day = parseInt(this.dayInput.value, 10);
    const month = parseInt(this.monthInput.value, 10);
    const year = parseInt(this.yearInput.value, 10);

    if (isNaN(day) || isNaN(month) || isNaN(year)) return;

    this.addRecentSearch(day, month, year);

    // Duel mode 1: If challenging against vs friend date
    if (this.vsFriendDate) {
      this.callbacks.onDuel?.(
        { day, month, year },
        { day: this.vsFriendDate.day, month: this.vsFriendDate.month, year: this.vsFriendDate.year }
      );
      return;
    }

    // Duel mode 2: If compare row is active
    if (this.isCompareActive && this.dayInput2 && this.monthInput2 && this.yearInput2) {
      const day2 = parseInt(this.dayInput2.value, 10);
      const month2 = parseInt(this.monthInput2.value, 10);
      const year2 = parseInt(this.yearInput2.value, 10);

      if (!isNaN(day2) && !isNaN(month2) && !isNaN(year2)) {
        this.callbacks.onDuel?.(
          { day, month, year },
          { day: day2, month: month2, year: year2 }
        );
        return;
      }
    }

    // Normal single-date search
    const candidates = generateDateCandidates(day, month, year);
    this.resultContainer.style.display = 'block';
    this.resultContainer.innerHTML = `<span style="color: var(--text-secondary);">Searching formats across 10,000,000 digits...</span>`;
    this.callbacks.onSearch(candidates, day, month, year);
  }

  public getInputs(): { day: number; month: number; year: number } {
    const day = parseInt(this.dayInput?.value || '14', 10);
    const month = parseInt(this.monthInput?.value || '5', 10);
    const year = parseInt(this.yearInput?.value || '1998', 10);
    return { day, month, year };
  }

  public showResults(result: DateSearchResult, autoNavigate: boolean = false) {
    this.currentResult = result;
    this.currentOccurrenceIdx = 0;
    this.resultContainer.style.display = 'block';

    if (!result.primaryHit) {
      this.resultContainer.innerHTML = `
        <div style="color: var(--text-secondary); line-height: 1.5;">
          ${result.explanation}
        </div>
      `;
      return;
    }

    const hit = result.primaryHit;
    const day = parseInt(this.dayInput.value, 10);
    const month = parseInt(this.monthInput.value, 10);
    const year = parseInt(this.yearInput.value, 10);
    const monthStr = MONTH_NAMES[month - 1] || 'Month';
    const dateFormatted = `${day} ${monthStr} ${year}`;

    let html = `
      <div style="font-family: var(--font-serif); font-size: 1.05rem; font-weight: 500; color: var(--text-primary); margin-bottom: 4px;">
        ${dateFormatted} appears at digit ${(hit.firstOccurrence + 1).toLocaleString()}.
      </div>
      <div style="font-family: var(--font-mono); font-size: 0.76rem; color: var(--text-secondary); display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
        <span>Format ${hit.format}, digits ${hit.patternStr}, <span id="occ-counter">first of ${hit.totalOccurrences} occurrences</span>.</span>
        <div style="display: flex; gap: 2px;">
          <button type="button" id="btn-prev-occ" class="tab-btn" style="padding: 1px 6px; font-size: 0.72rem; border-color: var(--border-color);">&lt;</button>
          <button type="button" id="btn-next-occ" class="tab-btn" style="padding: 1px 6px; font-size: 0.72rem; border-color: var(--border-color);">&gt;</button>
        </div>
      </div>
    `;

    if (result.longerMissExplanation) {
      html += `
        <div style="font-size: 0.8rem; color: var(--text-secondary); line-height: 1.45; margin-bottom: 8px;">
          ${result.longerMissExplanation}
        </div>
      `;
    }

    html += `
      <div style="display: flex; gap: 8px; margin-top: 10px;">
        <button type="button" id="btn-copy-link" class="tab-btn" style="flex: 1; font-size: 0.78rem; text-align: center; border-color: var(--border-color); background: var(--bg-paper);">
          Copy Link
        </button>
        <button type="button" id="btn-challenge-friend" class="tab-btn" style="flex: 1; font-size: 0.78rem; text-align: center; border-color: var(--border-color); background: var(--bg-paper); color: var(--accent);">
          Challenge a friend
        </button>
        <button type="button" id="btn-share-card" class="tab-btn" style="flex: 1; font-size: 0.78rem; text-align: center; border-color: var(--border-color); background: var(--bg-paper);">
          Share
        </button>
      </div>
    `;

    this.resultContainer.innerHTML = html;

    // Attach step buttons
    const prevBtn = this.container.querySelector('#btn-prev-occ') as HTMLElement;
    const nextBtn = this.container.querySelector('#btn-next-occ') as HTMLElement;
    prevBtn?.addEventListener('click', () => this.stepOccurrence(-1));
    nextBtn?.addEventListener('click', () => this.stepOccurrence(1));

    // Copy Link button (Task 2)
    const copyBtn = this.container.querySelector('#btn-copy-link') as HTMLButtonElement;
    copyBtn?.addEventListener('click', () => {
      navigator.clipboard?.writeText(window.location.href);
      copyBtn.textContent = 'Copied to Clipboard!';
      setTimeout(() => { copyBtn.textContent = 'Copy Link'; }, 2000);
    });

    // Challenge a friend button (Task 4)
    const challengeBtn = this.container.querySelector('#btn-challenge-friend') as HTMLButtonElement;
    challengeBtn?.addEventListener('click', () => {
      this.callbacks.onChallengeFriend?.(day, month, year, hit.firstOccurrence);
    });

    // Share button (Task 6b)
    const shareBtn = this.container.querySelector('#btn-share-card') as HTMLButtonElement;
    shareBtn?.addEventListener('click', () => {
      this.callbacks.onShare?.();
    });

    // Initial navigation only if autoNavigate is requested (otherwise Reveal Window handles it)
    if (autoNavigate) {
      this.callbacks.onNavigateToOccurrence(
        hit.firstOccurrence,
        hit.patternStr.length,
        hit.format,
        hit.patternStr
      );
    }
  }

  public stepOccurrence(delta: number) {
    if (!this.currentResult || !this.currentResult.primaryHit) return;
    const hit = this.currentResult.primaryHit;
    const total = hit.occurrences.length;
    if (total === 0) return;

    this.currentOccurrenceIdx = (this.currentOccurrenceIdx + delta + total) % total;
    const pos = hit.occurrences[this.currentOccurrenceIdx];

    const counter = this.container.querySelector('#occ-counter');
    if (counter) {
      counter.textContent = `occurrence ${this.currentOccurrenceIdx + 1} of ${total}`;
    }

    this.callbacks.onNavigateToOccurrence(pos, hit.patternStr.length, hit.format, hit.patternStr);
  }

  public setDate(day: number, month: number, year: number) {
    if (this.dayInput) this.dayInput.value = day.toString().padStart(2, '0');
    if (this.monthInput) this.monthInput.value = month.toString().padStart(2, '0');
    if (this.yearInput) this.yearInput.value = year.toString();
    this.updateProbability();
  }

  public updateLoadingProgress(percent: number) {
    this.loadingPercent = Math.round(percent);
    this.isReady = percent >= 100;
    const btn = this.container.querySelector('#dob-search-btn') as HTMLButtonElement | null;
    if (btn) {
      if (!this.isReady) {
        btn.textContent = `Loading π… ${this.loadingPercent}%`;
        btn.disabled = true;
      } else {
        btn.textContent = 'Locate in π';
        btn.disabled = false;
      }
    }
  }

  public clearAndFocus() {
    if (this.dayInput) {
      this.dayInput.value = '';
      this.monthInput.value = '';
      this.yearInput.value = '';
      this.updateProbability();
      this.dayInput.focus();
    }
  }

  public getPrimaryHitPosition(): number | null {
    return this.currentResult?.primaryHit?.firstOccurrence ?? null;
  }

  private addRecentSearch(day: number, month: number, year: number) {
    this.recentSearches = this.recentSearches.filter(
      r => !(r.day === day && r.month === month && r.year === year)
    );
    this.recentSearches.unshift({ day, month, year });
    if (this.recentSearches.length > 5) this.recentSearches.pop();
    this.renderRecentSearches();
  }

  private renderRecentSearches() {
    if (!this.recentContainer) return;
    if (this.recentSearches.length === 0) {
      this.recentContainer.innerHTML = `<span style="color: var(--text-muted);">None yet</span>`;
      return;
    }

    this.recentContainer.innerHTML = this.recentSearches.map(r => {
      const dStr = r.day.toString().padStart(2, '0');
      const mStr = r.month.toString().padStart(2, '0');
      return `<button type="button" class="preset-pill" data-d="${dStr}" data-m="${mStr}" data-y="${r.year}" style="border: none; background: none; text-decoration: underline; padding: 0; color: var(--text-secondary); cursor: pointer;">${dStr}/${mStr}/${r.year}</button>`;
    }).join(', ');

    const buttons = this.recentContainer.querySelectorAll<HTMLButtonElement>('button');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        this.dayInput.value = btn.dataset.d || '14';
        this.monthInput.value = btn.dataset.m || '05';
        this.yearInput.value = btn.dataset.y || '1998';
        this.updateProbability();
        this.triggerSearch();
      });
    });
  }

  public focus() {
    this.dayInput?.focus();
    this.dayInput?.select();
  }

  public getPrimaryHit() {
    return this.currentResult?.primaryHit || null;
  }

  public getDateFormatted(): string {
    const day = parseInt(this.dayInput.value, 10);
    const month = parseInt(this.monthInput.value, 10);
    const year = parseInt(this.yearInput.value, 10);
    const monthStr = MONTH_NAMES[month - 1] || 'Month';
    return `${day} ${monthStr} ${year}`;
  }
}
