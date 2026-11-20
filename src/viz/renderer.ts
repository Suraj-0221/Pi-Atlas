/**
 * WebGL2 GPU Digit Field Visualizer:
 * - One fullscreen quad, one draw call per frame via GlField.
 * - Instanced GPU Image Gather via GlImageGather (up to 65,536 instances at 60 fps).
 * - Semantic zoom lives entirely inside the fragment shader:
 *     cell < 1.5px: flat 10-colour ramp.
 *     1.5px to 14px: coloured cells with 1px gutter.
 *     > 14px: JetBrains Mono SDF glyphs, blocks of 10 with thin separators.
 * - Highlights passed as small uniform arrays (start, len, tint).
 * - Render only inside requestAnimationFrame while camera moves or transition runs; zero redraws when idle.
 * - Zero per-frame JavaScript allocations.
 */

import { Camera } from './camera.ts';
import { GlField, GlHighlight } from './glField.ts';
import { GlImageGather, ImageGatherInstanceData } from './glImageGather.ts';
import { worldToDigit } from './levels.ts';

export interface HighlightRange {
  startIndex: number;
  length: number;
  label?: string;
  format?: string;
  patternStr?: string;
  letterLabels?: string[];
  tint?: [number, number, number, number];
}

export class Visualizer {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private camera: Camera;
  private glField: GlField;
  public glImageGather: GlImageGather;

  private isDirty: boolean = true;
  private rafId: number | null = null;
  private isRenderingLoopActive: boolean = false;

  public activeHighlight: HighlightRange | null = null;
  public oddEvenStyle: boolean = false;

  // Pointer interactions
  private isDragging: boolean = false;
  private dragStartX: number = 0;
  private dragStartY: number = 0;
  private activePointers: Map<number, { x: number; y: number }> = new Map();
  private pinchStartDist: number = 0;

  public onHoverPosition?: (digitIndex: number) => void;

  // Field letters overlay for name matches
  private lettersOverlayEl: HTMLElement | null = null;
  public showLettersMode: boolean = true;

  // Gather animation timer
  private gatherAnimId: number | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    camera: Camera,
    _tileCache: any,
    _walkManager: any,
    digits: Uint8Array
  ) {
    this.canvas = canvas;
    this.camera = camera;

    // Initialize WebGL2 GPU Field
    this.glField = new GlField(canvas, digits);
    const gl = canvas.getContext('webgl2')!;
    this.gl = gl;

    // Initialize GPU Instanced Image Gather
    this.glImageGather = new GlImageGather(gl);

    // Initialize DOM letters overlay over field
    if (typeof document !== 'undefined') {
      this.lettersOverlayEl = document.createElement('div');
      this.lettersOverlayEl.className = 'field-letters-overlay';
      this.lettersOverlayEl.style.display = 'none';
      this.canvas.parentElement?.appendChild(this.lettersOverlayEl);
    }

    this.setupInteractions();
    this.resize();

    // Start passive RAF loop that only renders when dirty
    this.startRenderLoop();
  }

  public updateDigits(piDigits: Uint8Array) {
    this.glField.updateDigitTexture(piDigits);
    this.requestRender();
  }

  public requestRender() {
    this.isDirty = true;
    if (!this.isRenderingLoopActive) {
      this.startRenderLoop();
    }
  }

  private startRenderLoop() {
    this.isRenderingLoopActive = true;
    const tick = () => {
      if (this.isDirty) {
        this.renderFrame();
        this.isDirty = false;
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  public stopRenderLoop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.isRenderingLoopActive = false;
  }

  private renderFrame() {
    const width = this.canvas.width;
    const height = this.canvas.height;
    if (width === 0 || height === 0) return;

    // 1. Draw GPU Digit Field (1 draw call)
    this.glField.setCamera(this.camera.x, this.camera.y, this.camera.zoom);
    this.glField.render();

    // 2. Draw GPU Instanced Image Gather if active (1 instanced draw call)
    if (this.glImageGather.hasData()) {
      this.gl.enable(this.gl.BLEND);
      this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

      this.glImageGather.render(
        width,
        height,
        this.camera.x,
        this.camera.y,
        this.camera.zoom
      );

      this.gl.disable(this.gl.BLEND);
    }

    // 3. Update field alphabet letters overlay
    this.updateLettersOverlay();
  }

  private updateLettersOverlay() {
    if (!this.lettersOverlayEl) return;
    const hl = this.activeHighlight;
    if (
      !hl ||
      !hl.letterLabels ||
      hl.letterLabels.length === 0 ||
      this.camera.zoom < 11 ||
      !this.showLettersMode
    ) {
      this.lettersOverlayEl.style.display = 'none';
      return;
    }

    this.lettersOverlayEl.style.display = 'block';

    const cellZoom = this.camera.zoom;
    const totalLetters = hl.letterLabels.length;

    let tiles = this.lettersOverlayEl.querySelectorAll<HTMLElement>('.field-letter-tile');
    let hud = this.lettersOverlayEl.querySelector<HTMLElement>('.field-letter-hud');

    if (tiles.length !== totalLetters) {
      this.lettersOverlayEl.innerHTML = '';

      hud = document.createElement('div');
      hud.className = 'field-letter-hud';
      const labelText = hl.label || (hl.letterLabels ? hl.letterLabels.join('') : 'Name');
      hud.innerHTML = `
        <span><b>Name:</b> ${labelText}</span>
        <button type="button" class="field-letter-toggle-btn" id="btn-toggle-field-mode">Show Digits</button>
      `;
      this.lettersOverlayEl.appendChild(hud);

      const toggleBtn = hud.querySelector('#btn-toggle-field-mode');
      toggleBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showLettersMode = !this.showLettersMode;
        if (toggleBtn) {
          toggleBtn.textContent = this.showLettersMode ? 'Show Digits' : 'Show Letters';
        }
        this.requestRender();
      });

      for (let i = 0; i < totalLetters; i++) {
        const letter = hl.letterLabels[i];
        const digitChar = hl.patternStr ? hl.patternStr[i] : '';

        const tile = document.createElement('div');
        tile.className = 'field-letter-tile';
        tile.innerHTML = `
          <span class="field-letter-char">${letter}</span>
          ${digitChar ? `<span class="field-digit-sub">${digitChar}</span>` : ''}
        `;
        this.lettersOverlayEl.appendChild(tile);
      }
      tiles = this.lettersOverlayEl.querySelectorAll<HTMLElement>('.field-letter-tile');
    }

    let firstSx = 0;
    let firstSy = 0;

    for (let i = 0; i < totalLetters; i++) {
      const digitIdx = hl.startIndex + i;
      const wx = digitIdx % 1000;
      const wy = Math.floor(digitIdx / 1000);

      const { sx, sy } = this.camera.worldToScreen(wx, wy);
      const tile = tiles[i];
      if (tile) {
        tile.style.left = `${Math.round(sx)}px`;
        tile.style.top = `${Math.round(sy)}px`;
        tile.style.width = `${Math.round(cellZoom)}px`;
        tile.style.height = `${Math.round(cellZoom)}px`;

        const charEl = tile.querySelector<HTMLElement>('.field-letter-char');
        if (charEl) {
          charEl.style.fontSize = `${Math.max(9, Math.round(cellZoom * 0.58))}px`;
        }
        const subEl = tile.querySelector<HTMLElement>('.field-digit-sub');
        if (subEl) {
          subEl.style.fontSize = `${Math.max(7, Math.round(cellZoom * 0.26))}px`;
        }
      }

      if (i === 0) {
        firstSx = sx;
        firstSy = sy;
      }
    }

    if (hud) {
      hud.style.left = `${Math.max(10, Math.round(firstSx))}px`;
      hud.style.top = `${Math.max(54, Math.round(firstSy - 34))}px`;
    }
  }

  public setHighlight(range: HighlightRange | null) {
    this.activeHighlight = range;
    if (!range) {
      this.glField.setHighlights([]);
      if (this.lettersOverlayEl) {
        this.lettersOverlayEl.style.display = 'none';
        this.lettersOverlayEl.innerHTML = '';
      }
    } else {
      const tint: [number, number, number, number] = range.tint ?? [1.0, 0.341, 0.133, 1.0]; // #FF5722 accent
      this.glField.setHighlights([
        {
          startIndex: range.startIndex,
          length: range.length,
          tint
        }
      ]);
    }
    this.requestRender();
  }

  public setMultiHighlights(highlights: GlHighlight[]) {
    this.glField.setHighlights(highlights);
    this.requestRender();
  }

  public setDim(amount: number) {
    this.glField.setDim(amount);
    this.requestRender();
  }

  public getDim(): number {
    return this.glField.getDim();
  }

  // ----------------------------------------------------
  // GPU Image Gather Animation Controller
  // ----------------------------------------------------
  public setImageGatherData(data: ImageGatherInstanceData) {
    const dpr = window.devicePixelRatio || 1;
    this.glImageGather.setData(data, this.canvas.width / dpr, this.canvas.height / dpr);
    this.requestRender();
  }

  public playImageGather(durationMs = 2400, onProgress?: (p: number) => void, onComplete?: () => void) {
    if (this.gatherAnimId !== null) {
      cancelAnimationFrame(this.gatherAnimId);
      this.gatherAnimId = null;
    }

    const startTime = performance.now();
    const startP = this.glImageGather.getProgress();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const frac = Math.min(1.0, elapsed / durationMs);
      const currentP = startP + (1.0 - startP) * frac;

      this.glImageGather.setProgress(currentP);
      onProgress?.(currentP);
      this.requestRender();

      if (frac < 1.0) {
        this.gatherAnimId = requestAnimationFrame(step);
      } else {
        this.gatherAnimId = null;
        onComplete?.();
      }
    };

    this.gatherAnimId = requestAnimationFrame(step);
  }

  public stopImageGather() {
    if (this.gatherAnimId !== null) {
      cancelAnimationFrame(this.gatherAnimId);
      this.gatherAnimId = null;
    }
  }

  public setImageGatherProgress(p: number) {
    this.stopImageGather();
    this.glImageGather.setProgress(p);
    this.requestRender();
  }

  public clearImageGather() {
    this.stopImageGather();
    this.glImageGather.clear();
    this.requestRender();
  }

  // ----------------------------------------------------
  // View Styles & Backwards Compatibility
  // ----------------------------------------------------
  public setOddEvenStyle(enabled: boolean) {
    this.oddEvenStyle = enabled;
    this.requestRender();
  }

  // ----------------------------------------------------
  // Interactions & Navigation
  // ----------------------------------------------------
  private setupInteractions() {
    const el = this.canvas;

    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.activePointers.size === 1) {
        this.isDragging = true;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
      } else if (this.activePointers.size === 2) {
        const pts = Array.from(this.activePointers.values());
        this.pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      }
    });

    el.addEventListener('pointermove', (e) => {
      if (this.activePointers.has(e.pointerId)) {
        this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      if (this.isDragging && this.activePointers.size === 1) {
        const dx = e.clientX - this.dragStartX;
        const dy = e.clientY - this.dragStartY;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;

        this.camera.panBy(dx, dy);
        this.requestRender();
      } else if (this.activePointers.size === 2) {
        const pts = Array.from(this.activePointers.values());
        const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (this.pinchStartDist > 0) {
          const factor = currentDist / this.pinchStartDist;
          const midX = (pts[0].x + pts[1].x) / 2;
          const midY = (pts[0].y + pts[1].y) / 2;
          this.camera.zoomAt(midX, midY, factor);
          this.requestRender();
        }
        this.pinchStartDist = currentDist;
      } else if (!this.isDragging) {
        // Hover coordinate tracking
        const { wx, wy } = this.camera.screenToWorld(e.clientX, e.clientY);
        const digitIndex = worldToDigit(wx, wy);
        this.onHoverPosition?.(digitIndex);
      }
    });

    const onPointerUp = (e: PointerEvent) => {
      this.activePointers.delete(e.pointerId);
      try { el.releasePointerCapture(e.pointerId); } catch {}
      if (this.activePointers.size === 0) {
        this.isDragging = false;
        this.pinchStartDist = 0;
      }
    };

    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);

    // Mouse wheel zoom centered under cursor
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      this.camera.zoomAt(e.clientX, e.clientY, zoomFactor);
      this.requestRender();
    }, { passive: false });

    window.addEventListener('resize', () => {
      this.resize();
    });
  }

  public resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.glField.resize(width, height);
    this.camera.setViewport(width, height);
    this.requestRender();
  }
}
