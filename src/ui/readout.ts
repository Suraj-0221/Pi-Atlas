/**
 * Readout Bar pinned to bottom of field (32px)
 * - Digit position & total counter
 * - Zoom level description
 * - View toggles: Digits vs Tones, Normal vs Odd/Even dots
 * - Go to position input
 */

export interface ReadoutCallbacks {
  onGoToPosition: (pos: number) => void;
  onFitOverview: () => void;
  onToggleOddEven: () => void;
}

export class ReadoutBar {
  private posElement: HTMLElement;
  private scaleElement: HTMLElement;
  private barContainer: HTMLElement;
  private callbacks: ReadoutCallbacks;

  private oddEvenBtn!: HTMLButtonElement;
  private mapBtn!: HTMLButtonElement;

  constructor(callbacks: ReadoutCallbacks) {
    this.callbacks = callbacks;
    this.posElement = document.getElementById('readout-position') as HTMLElement;
    this.scaleElement = document.getElementById('readout-scale') as HTMLElement;
    this.barContainer = document.getElementById('readout-bar') as HTMLElement;

    this.setupControls();
  }

  private setupControls() {
    const rightSection = document.getElementById('readout-stats') as HTMLElement;
    if (!rightSection) return;

    const controlsWrapper = document.createElement('div');
    controlsWrapper.style.display = 'flex';
    controlsWrapper.style.alignItems = 'center';
    controlsWrapper.style.gap = '8px';

    // Text button "Map" calling fit-overview
    this.mapBtn = document.createElement('button');
    this.mapBtn.id = 'btn-map-overview';
    this.mapBtn.type = 'button';
    this.mapBtn.textContent = 'Map';
    this.mapBtn.title = 'Zoom out to view all 10,000,000 digits (Esc)';
    this.mapBtn.className = 'tab-btn';
    this.mapBtn.style.fontSize = '0.74rem';
    this.mapBtn.style.padding = '1px 7px';
    this.mapBtn.style.border = '1px solid var(--border-color)';
    this.mapBtn.addEventListener('click', () => {
      this.callbacks.onFitOverview();
    });

    // Odd / Even style toggle
    this.oddEvenBtn = document.createElement('button');
    this.oddEvenBtn.type = 'button';
    this.oddEvenBtn.className = 'tab-btn';
    this.oddEvenBtn.style.fontSize = '0.74rem';
    this.oddEvenBtn.style.padding = '1px 7px';
    this.oddEvenBtn.style.border = '1px solid var(--border-color)';
    this.oddEvenBtn.textContent = 'Dots: Off';
    this.oddEvenBtn.title = 'Toggle Odd/Even hollow vs solid dots reading style';
    this.oddEvenBtn.addEventListener('click', () => {
      this.callbacks.onToggleOddEven();
    });

    // Go-to input
    const gotoWrapper = document.createElement('div');
    gotoWrapper.style.display = 'flex';
    gotoWrapper.style.alignItems = 'center';
    gotoWrapper.style.gap = '4px';

    const label = document.createElement('label');
    label.textContent = 'Go:';
    label.htmlFor = 'goto-input';
    label.style.color = 'var(--text-secondary)';

    const input = document.createElement('input');
    input.id = 'goto-input';
    input.type = 'text';
    input.placeholder = '1 – 10M';
    input.style.width = '75px';
    input.style.padding = '1px 6px';
    input.style.fontSize = '0.74rem';
    input.style.fontFamily = 'var(--font-mono)';
    input.style.backgroundColor = 'var(--bg-paper)';
    input.style.border = '1px solid var(--border-color)';
    input.style.borderRadius = 'var(--radius-sm)';
    input.style.color = 'var(--text-primary)';
    input.style.outline = 'none';

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const raw = input.value.replace(/,/g, '').trim();
        const num = parseInt(raw, 10);
        if (!isNaN(num) && num >= 1 && num <= 10_000_000) {
          this.callbacks.onGoToPosition(num - 1);
          input.blur();
        }
      }
    });

    gotoWrapper.appendChild(label);
    gotoWrapper.appendChild(input);

    controlsWrapper.appendChild(this.mapBtn);
    controlsWrapper.appendChild(this.oddEvenBtn);
    controlsWrapper.appendChild(gotoWrapper);
    this.barContainer.appendChild(controlsWrapper);
  }

  public updateOddEvenButton(isOddEven: boolean) {
    if (this.oddEvenBtn) {
      this.oddEvenBtn.textContent = isOddEven ? 'Dots: On' : 'Dots: Off';
      this.oddEvenBtn.style.color = isOddEven ? 'var(--accent)' : 'var(--text-secondary)';
    }
  }

  public update(currentDigitIndex: number, zoom: number, matchInfo?: string) {
    if (this.posElement) {
      this.posElement.textContent = (Math.max(0, currentDigitIndex) + 1).toLocaleString();
    }

    if (this.scaleElement) {
      let scaleLabel = 'Overview (1 px / digit)';
      if (zoom >= 6.0) {
        scaleLabel = 'Reading (Monospace Ledger)';
      } else if (zoom >= 0.35) {
        scaleLabel = 'Region (Coloured Cells)';
      }

      if (matchInfo) {
        this.scaleElement.innerHTML = `<span style="color: var(--accent); font-weight: 500;">${matchInfo}</span> · ${scaleLabel}`;
      } else {
        this.scaleElement.textContent = scaleLabel;
      }
    }
  }
}
