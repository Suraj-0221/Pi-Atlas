/**
 * Redesigned Image in π Panel (Task 5):
 * 5a. Remove the separate Prepare stage. Dropping a file, choosing a file, or tapping a sample chip
 *     immediately runs the search with defaults (96 px, dither on).
 *     Shows an inline progress state: dithered preview (140px) on the left, "Finding 9,216 pixels in π..." on the right.
 * 5b. Under the stage add one text link "Adjust" that opens a small row: Detail (Low 64 / Medium 96 / High 128) and Invert.
 *     Changing either re-runs the search.
 *     Removed the 192 size, dither toggle UI, and "start at my date" option.
 * 5e. Final buttons (text style): "Replay", "Try another", "Share".
 */

import { generateProceduralImageBuffer } from '../encode/proceduralImages.ts';
import { preprocessImage } from '../encode/image.ts';

export interface ImagePanelCallbacks {
  onSearch: (request: {
    rgbaBuffer: ArrayBuffer;
    srcWidth: number;
    srcHeight: number;
    targetSize: number;
    dither: boolean;
    invert: boolean;
    startDigitIndex: number;
  }) => void;
  onPlayGather: (durationMs: number) => void;
  onPauseGather: () => void;
  onScrubGather: (t: number) => void;
  onShare?: () => void;
  getDateHitPosition: () => number | null;
  onReplayCinematic?: () => void;
}

export class ImagePanel {
  private container: HTMLElement;
  private callbacks: ImagePanelCallbacks;

  // Settings
  private targetSize: number = 96;
  private isDitherOn: boolean = true;
  private isInvertOn: boolean = false;

  // Image source canvas
  private activeCanvas: HTMLCanvasElement | null = null;

  private currentResult: {
    positions: Uint32Array;
    levels: Uint8Array;
    width: number;
    height: number;
    pixelCount: number;
    startPosition: number;
    endPosition: number;
    avgGap: number;
  } | null = null;

  // DOM Elements
  private headlineEl!: HTMLElement;
  private chooseViewEl!: HTMLElement;
  private activeViewEl!: HTMLElement;
  private previewCanvas!: HTMLCanvasElement;
  private statusTextEl!: HTMLElement;
  private subStatusEl!: HTMLElement;
  private adjustRowEl!: HTMLElement;
  private adjustToggleBtn!: HTMLButtonElement;
  private invertToggleBtn!: HTMLButtonElement;
  private finalButtonsEl!: HTMLElement;

  constructor(container: HTMLElement, callbacks: ImagePanelCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
  }

  public render() {
    this.container.innerHTML = `
      <h1 class="stage-headline" id="img-stage-headline">Can a photo hide in π?</h1>
      <div class="panel-body">
        <!-- CHOOSE VIEW: Dropzone + Chips (Task 5a) -->
        <div id="img-stage-choose" class="img-stage-view">
          <div id="img-large-dropzone" class="img-large-dropzone">
            <div style="font-family: var(--font-serif); font-size: 1.25rem; font-weight: 500; color: var(--text-primary); margin-bottom: 4px;">
              Drop a photo
            </div>
            <div style="font-size: 0.76rem; color: var(--text-secondary); margin-bottom: 12px;">
              Processed in your browser. Nothing is uploaded.
            </div>
            <button type="button" id="img-browse-btn" class="tab-btn" style="padding: 4px 12px; font-size: 0.78rem;">
              Choose file
            </button>
            <input type="file" id="img-file-hidden" accept="image/*" style="display: none;" />
          </div>

          <!-- "Try it" chips (Task 2d) -->
          <div class="stage-chips-row" style="margin-top: 10px;">
            <span class="stage-chips-label">Try it:</span>
            <button type="button" class="stage-chip-btn" id="chip-img-pi">π symbol</button>
            <button type="button" class="stage-chip-btn" id="chip-img-heart">Heart</button>
            <button type="button" class="stage-chip-btn" id="chip-img-smile">Smile</button>
          </div>
        </div>

        <!-- ACTIVE VIEW: Inline Progress + Adjust + Final State (Task 5a, 5b, 5e) -->
        <div id="img-active-view" class="img-stage-view" style="display: none;">
          <div style="display: flex; gap: 14px; align-items: flex-start; margin-bottom: 8px;">
            <!-- 140px dithered preview frame on left -->
            <div class="img-preview-box" style="width: 140px; height: 140px; border: 1px solid var(--border-color); border-radius: 4px; background: #FAF9F5; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0;">
              <canvas id="img-dither-preview" width="140" height="140" style="image-rendering: pixelated; width: 100%; height: 100%; display: block;"></canvas>
            </div>

            <!-- Right column: Status + Adjust + Text Buttons -->
            <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
              <div id="img-status-text" style="font-family: var(--font-serif); font-size: 1.05rem; font-weight: 500; color: var(--text-primary); line-height: 1.35;">
                Finding 9,216 pixels in π...
              </div>
              <div id="img-sub-status" style="font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary); margin-top: 2px;"></div>

              <!-- "Adjust" text link (Task 5b) -->
              <div style="margin-top: 4px;">
                <button type="button" id="img-adjust-toggle" class="link-btn" style="background: none; border: none; font-size: 0.78rem; color: var(--accent); cursor: pointer; padding: 0; text-decoration: underline;">
                  Adjust
                </button>
              </div>

              <!-- Adjust row: Detail (Low 64 / Medium 96 / High 128) and Invert (Task 5b) -->
              <div id="img-adjust-row" style="display: none; flex-direction: column; gap: 6px; margin-top: 6px; padding: 6px 8px; border: 1px solid var(--border-subtle); border-radius: 4px; background: rgba(0,0,0,0.02);">
                <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.74rem;">
                  <span style="font-family: var(--font-mono); color: var(--text-muted);">Detail:</span>
                  <div class="segmented-control" id="img-detail-control" style="display: flex; flex-wrap: wrap; gap: 3px;">
                    <button type="button" class="tab-btn detail-btn" data-sz="64" style="padding: 2px 6px; font-size: 0.7rem;">Low 64</button>
                    <button type="button" class="tab-btn detail-btn active" data-sz="96" style="padding: 2px 6px; font-size: 0.7rem;">Medium 96</button>
                    <button type="button" class="tab-btn detail-btn" data-sz="128" style="padding: 2px 6px; font-size: 0.7rem;">High 128</button>
                    <button type="button" class="tab-btn detail-btn" data-sz="192" style="padding: 2px 6px; font-size: 0.7rem;">Ultra 192</button>
                    <button type="button" class="tab-btn detail-btn" data-sz="256" style="padding: 2px 6px; font-size: 0.7rem;">Max 256</button>
                  </div>
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.74rem;">
                  <span style="font-family: var(--font-mono); color: var(--text-muted);">Invert:</span>
                  <button type="button" id="img-adjust-invert" class="link-btn" style="background: none; border: none; font-size: 0.74rem; cursor: pointer; color: var(--text-secondary); padding: 0;">
                    Invert: <b>Off</b>
                  </button>
                </div>
              </div>

              <!-- Final text style buttons: "Replay", "Try another", "Share" (Task 5e) -->
              <div id="img-final-buttons" style="display: none; gap: 10px; margin-top: 8px; font-size: 0.78rem;">
                <button type="button" id="img-final-replay" class="link-btn" style="background: none; border: none; color: var(--accent); cursor: pointer; padding: 0; text-decoration: underline;">Replay</button>
                <button type="button" id="img-final-another" class="link-btn" style="background: none; border: none; color: var(--accent); cursor: pointer; padding: 0; text-decoration: underline;">Try another</button>
                <button type="button" id="img-final-share" class="link-btn" style="background: none; border: none; color: var(--accent); cursor: pointer; padding: 0; text-decoration: underline;">Share</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Info Box: How the image was calculated -->
        <div class="img-info-box stage-hide-collapsed" id="img-info-box">
          <button type="button" id="img-info-toggle" class="img-info-toggle-btn" aria-expanded="false">
            <span class="img-info-toggle-label">
              <span class="img-info-bullet">π</span>
              How was this calculated?
            </span>
            <span class="img-info-chevron" id="img-info-chevron">▾</span>
          </button>
          <div class="img-info-content" id="img-info-content" style="display: none;">
            <div class="img-info-step">
              <span class="img-info-step-num">1</span>
              <div>
                <strong class="img-info-step-title">Luminance & Auto-Levels</strong>
                <p class="img-info-step-desc">
                  The image is converted to grayscale luminance using ITU-R BT.601 weights (<code>Y = 0.299R + 0.587G + 0.114B</code>) and contrast-stretched across the full dynamic range.
                </p>
              </div>
            </div>
            <div class="img-info-step">
              <span class="img-info-step-num">2</span>
              <div>
                <strong class="img-info-step-title">10-Level Dithering (0–9)</strong>
                <p class="img-info-step-desc">
                  Luminance is quantized into 10 decimal digits: <code>0</code> (pure black) through <code>9</code> (pure white). Floyd-Steinberg error diffusion preserves continuous gradations and shadows.
                </p>
              </div>
            </div>
            <div class="img-info-step">
              <span class="img-info-step-num">3</span>
              <div>
                <strong class="img-info-step-title">Subsequence Matching in π</strong>
                <p class="img-info-step-desc">
                  Each pixel's target digit is located sequentially in π. Since each digit occurs roughly once every 10 places, an image of <em>N</em> pixels forms a natural subsequence spanning approximately 10×<em>N</em> digits (average gap ~10).
                </p>
              </div>
            </div>
            <div class="img-info-footer">
              100% browser-based computation via Web Workers. No images are ever uploaded or transmitted.
            </div>
          </div>
        </div>
      </div>
    `;

    this.headlineEl = this.container.querySelector('#img-stage-headline') as HTMLElement;
    this.chooseViewEl = this.container.querySelector('#img-stage-choose') as HTMLElement;
    this.activeViewEl = this.container.querySelector('#img-active-view') as HTMLElement;
    this.previewCanvas = this.container.querySelector('#img-dither-preview') as HTMLCanvasElement;
    this.statusTextEl = this.container.querySelector('#img-status-text') as HTMLElement;
    this.subStatusEl = this.container.querySelector('#img-sub-status') as HTMLElement;
    this.adjustRowEl = this.container.querySelector('#img-adjust-row') as HTMLElement;
    this.adjustToggleBtn = this.container.querySelector('#img-adjust-toggle') as HTMLButtonElement;
    this.invertToggleBtn = this.container.querySelector('#img-adjust-invert') as HTMLButtonElement;
    this.finalButtonsEl = this.container.querySelector('#img-final-buttons') as HTMLElement;

    this.setupEvents();
  }

  private setupEvents() {
    const dropzone = this.container.querySelector('#img-large-dropzone') as HTMLElement;
    const fileInput = this.container.querySelector('#img-file-hidden') as HTMLInputElement;
    const browseBtn = this.container.querySelector('#img-browse-btn') as HTMLButtonElement;

    browseBtn?.addEventListener('click', () => fileInput.click());
    dropzone?.addEventListener('click', (e) => {
      if (e.target !== browseBtn) fileInput.click();
    });

    dropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--accent)';
    });
    dropzone?.addEventListener('dragleave', () => {
      dropzone.style.borderColor = 'var(--border-color)';
    });
    dropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--border-color)';
      if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
        this.loadFile(e.dataTransfer.files[0]);
      }
    });

    fileInput?.addEventListener('change', () => {
      if (fileInput.files && fileInput.files[0]) {
        this.loadFile(fileInput.files[0]);
      }
    });

    // Sample chips (Task 2d) - immediately run search with defaults (Task 5a)
    const chipPi = this.container.querySelector('#chip-img-pi');
    chipPi?.addEventListener('click', () => {
      this.loadProcedural('pi');
    });

    const chipHeart = this.container.querySelector('#chip-img-heart');
    chipHeart?.addEventListener('click', () => {
      this.loadProcedural('heart');
    });

    const chipSmile = this.container.querySelector('#chip-img-smile');
    chipSmile?.addEventListener('click', () => {
      this.loadProcedural('smile');
    });

    // Adjust toggle (Task 5b)
    this.adjustToggleBtn?.addEventListener('click', () => {
      const isHidden = this.adjustRowEl.style.display === 'none';
      this.adjustRowEl.style.display = isHidden ? 'flex' : 'none';
    });

    // Detail buttons: Low 64 / Medium 96 / High 128 (Task 5b)
    const detailBtns = this.container.querySelectorAll<HTMLButtonElement>('.detail-btn');
    detailBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        detailBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.targetSize = parseInt(btn.dataset.sz || '96', 10);
        this.executeSearchWithCurrentSource();
      });
    });

    // Invert toggle (Task 5b)
    this.invertToggleBtn?.addEventListener('click', () => {
      this.isInvertOn = !this.isInvertOn;
      this.invertToggleBtn.innerHTML = `Invert: <b>${this.isInvertOn ? 'On' : 'Off'}</b>`;
      this.invertToggleBtn.style.color = this.isInvertOn ? 'var(--accent)' : 'var(--text-secondary)';
      this.executeSearchWithCurrentSource();
    });

    // Final buttons: Replay, Try another, Share (Task 5e)
    const replayBtn = this.container.querySelector('#img-final-replay');
    replayBtn?.addEventListener('click', () => {
      this.callbacks.onReplayCinematic?.();
    });

    const anotherBtn = this.container.querySelector('#img-final-another');
    anotherBtn?.addEventListener('click', () => {
      this.resetToChoose();
    });

    const shareBtn = this.container.querySelector('#img-final-share');
    shareBtn?.addEventListener('click', () => {
      this.callbacks.onShare?.();
    });

    // Info Box toggle
    const infoToggle = this.container.querySelector('#img-info-toggle') as HTMLButtonElement;
    const infoContent = this.container.querySelector('#img-info-content') as HTMLElement;
    const infoChevron = this.container.querySelector('#img-info-chevron') as HTMLElement;

    infoToggle?.addEventListener('click', () => {
      const isExpanded = infoContent.style.display !== 'none';
      infoContent.style.display = isExpanded ? 'none' : 'flex';
      infoToggle.setAttribute('aria-expanded', isExpanded ? 'false' : 'true');
      if (infoChevron) infoChevron.textContent = isExpanded ? '▾' : '▴';
    });
  }

  public getPreviewCanvas(): HTMLCanvasElement {
    return this.previewCanvas;
  }

  private loadFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        this.activeCanvas = c;
        this.executeSearchWithCurrentSource();
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  private loadProcedural(type: 'pi' | 'heart' | 'smile') {
    const { rgbaBuffer, width, height } = generateProceduralImageBuffer(type, this.targetSize);
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d')!;
    const imgData = new ImageData(new Uint8ClampedArray(rgbaBuffer), width, height);
    ctx.putImageData(imgData, 0, 0);
    this.activeCanvas = c;
    this.executeSearchWithCurrentSource();
  }

  private executeSearchWithCurrentSource() {
    if (!this.activeCanvas) return;

    // Preprocess dither preview on 140px canvas (Task 5a)
    const prep = preprocessImage(this.activeCanvas, {
      targetLongSide: this.targetSize,
      dither: this.isDitherOn,
      invert: this.isInvertOn
    });

    const pixelCount = prep.width * prep.height;

    // Render preview on 140x140 canvas
    this.previewCanvas.width = prep.width;
    this.previewCanvas.height = prep.height;
    const pCtx = this.previewCanvas.getContext('2d')!;
    pCtx.drawImage(this.activeCanvas, 0, 0, prep.width, prep.height);

    // Show active view, hide choose view and stage headline
    if (this.headlineEl) this.headlineEl.style.display = 'none';
    this.chooseViewEl.style.display = 'none';
    this.activeViewEl.style.display = 'block';
    this.finalButtonsEl.style.display = 'none';
    this.statusTextEl.textContent = `Finding ${pixelCount.toLocaleString()} pixels in π...`;
    this.subStatusEl.textContent = `Target size ${prep.width}×${prep.height}`;

    // Transferable buffer
    const ctx = this.activeCanvas.getContext('2d')!;
    const fullImgData = ctx.getImageData(0, 0, this.activeCanvas.width, this.activeCanvas.height);
    const buffer = fullImgData.data.buffer.slice(0);

    this.callbacks.onSearch({
      rgbaBuffer: buffer,
      srcWidth: this.activeCanvas.width,
      srcHeight: this.activeCanvas.height,
      targetSize: this.targetSize,
      dither: this.isDitherOn,
      invert: this.isInvertOn,
      startDigitIndex: 0
    });
  }

  public showResult(result: {
    positions: Uint32Array;
    levels: Uint8Array;
    width: number;
    height: number;
    pixelCount: number;
    startPosition: number;
    endPosition: number;
    avgGap: number;
  }) {
    this.currentResult = result;
    this.statusTextEl.textContent = `Your image, in ${result.pixelCount.toLocaleString()} digits of π`;
    this.subStatusEl.textContent = `digits ${(result.startPosition + 1).toLocaleString()} to ${(result.endPosition + 1).toLocaleString()} (avg gap ${result.avgGap.toFixed(1)})`;
    this.finalButtonsEl.style.display = 'flex';
  }

  public getCurrentResult() {
    return this.currentResult;
  }

  public resetToChoose() {
    this.activeCanvas = null;
    this.currentResult = null;
    if (this.headlineEl) this.headlineEl.style.display = '';
    this.activeViewEl.style.display = 'none';
    this.chooseViewEl.style.display = 'block';
    this.adjustRowEl.style.display = 'none';
  }

  public updateScrubber(_t: number) {
    // Kept for backward compatibility if visualizer notifies scrubber
  }
}
