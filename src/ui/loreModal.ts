/**
 * π Atlas · Lore Modal (The Story of π in 6 Slides)
 *
 * Requirements:
 * - 6 slides: wonder first, honesty at the end.
 * - Word-by-word staggered reveal on hook line (~40ms/word).
 * - Desktop: Centered card (~16:10, max-width 860px, two-column: Left 38% Visual, Right 62% Text).
 * - Mobile: Bottom sheet (up to 88dvh, single column: top visual strip ~28%, no scrolling inside slides).
 * - Lightweight canvas visuals: 60fps, paused when inactive, reduced-motion compliant.
 * - Auto-open on first visit only via try/catch localStorage("piatlas_lore_seen").
 * - Persistent "Lore" button in top nav reopens from slide 1 anytime.
 * - Full accessibility: role="dialog", aria-modal="true", aria-labelledby, focus trap, 44px tap targets.
 */

export interface LoreModalCallbacks {
  onFindYours?: () => void;
  onExploreCuriosities?: () => void;
  onClose?: () => void;
}

export interface SlideData {
  tagline: string;
  hook: string;
  support: string;
  smallPrint?: string;
  isFinal?: boolean;
}

export const LORE_SLIDES: SlideData[] = [
  {
    tagline: 'Chapter I · Infinity',
    hook: 'Somewhere in π, this exact sentence is already written.',
    support:
      'Every book ever written. Every painting ever painted. Your birthday. Your name. Your life story, and every wrong version of it.'
  },
  {
    tagline: 'Chapter II · The Axiom',
    hook: 'It all rests on one unproven idea.',
    support:
      'If π is a "normal" number, its digits behave like an endless random stream, so every finite sequence of digits appears somewhere, infinitely often. Turn any text, image or sound into digits and it\'s in there.',
    smallPrint:
      'Nobody has proven this for π. Trillions of digits pass every test, but no proof yet.'
  },
  {
    tagline: 'Chapter III · The Library',
    hook: 'Borges imagined it in 1941.',
    support:
      'In "The Library of Babel", a library holds every possible book. Almost all of it is gibberish, and the true catalogue of the library is in there somewhere, hidden among countless false ones. Pi is that library, written as a single number.'
  },
  {
    tagline: 'Chapter IV · The Circle',
    hook: 'Sagan hid God in the digits.',
    support:
      'In the novel Contact, the hero computes π in base 11 and finds a long run of 0s and 1s that, laid out in a grid, forms a perfect circle. A signature from whoever built the universe, hidden deep inside π.',
    smallPrint:
      'Real birthday finders are quieter magic. Any 6-digit date (like DDMMYY) almost surely sits inside the first 10 million digits you can explore here. A full 8-digit date has only about a 1 in 10 chance of being in this range.'
  },
  {
    tagline: 'Chapter V · The Paradox',
    hook: 'The catch: the address costs as much as the message.',
    support:
      'To point at a 1 MB photo inside π, the position number is about as long as the photo itself. Nothing is saved. And a string of n digits first shows up around position 10^n, so even a tiny image sits beyond anything that could ever be computed. The book is there, and so is every copy with one typo.'
  },
  {
    tagline: 'Chapter VI · The Reality',
    hook: "π is simple. What it contains isn't.",
    support:
      'A few lines of code generate every digit, yet its digits seem to contain every possible message. Almost every number is believed to be like this, but π is the one people fell in love with. The honest status: almost certainly true, never proven. That\'s where the magic lives.',
    isFinal: true
  }
];

export class LoreModal {
  private container: HTMLElement;
  private callbacks: LoreModalCallbacks;

  private overlayEl!: HTMLElement;
  private cardEl!: HTMLElement;
  private visualCanvas!: HTMLCanvasElement;
  private visualCtx: CanvasRenderingContext2D | null = null;

  private taglineEl!: HTMLElement;
  private skipBtn!: HTMLButtonElement;
  private closeBtn!: HTMLButtonElement;

  private slideContentEl!: HTMLElement;
  private hookHeadingEl!: HTMLElement;
  private supportTextEl!: HTMLElement;
  private smallPrintEl!: HTMLElement;
  private curiositiesLinkEl!: HTMLElement;

  private dotsContainerEl!: HTMLElement;
  private backBtn!: HTMLButtonElement;
  private nextBtn!: HTMLButtonElement;
  private ctaBtn!: HTMLButtonElement;

  private currentSlideIndex: number = 0;
  private isOpen: boolean = false;
  private lastFocusedElement: HTMLElement | null = null;

  // Animation Loop State
  private rafId: number | null = null;
  private animStartTime: number = 0;
  private isReducedMotion: boolean = false;

  // Touch tracking
  private touchStartX: number = 0;
  private touchStartY: number = 0;
  private isHandleDrag: boolean = false;

  constructor(container: HTMLElement, callbacks?: LoreModalCallbacks) {
    this.container = container;
    this.callbacks = callbacks || {};

    this.checkReducedMotion();
    this.buildDOM();
    this.attachEventListeners();
  }

  private checkReducedMotion() {
    if (typeof window !== 'undefined' && window.matchMedia) {
      this.isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
  }

  private buildDOM() {
    this.overlayEl = document.createElement('div');
    this.overlayEl.className = 'lore-overlay';
    this.overlayEl.setAttribute('role', 'dialog');
    this.overlayEl.setAttribute('aria-modal', 'true');
    this.overlayEl.setAttribute('aria-labelledby', 'lore-hook-heading');

    this.cardEl = document.createElement('div');
    this.cardEl.className = 'lore-card';
    this.cardEl.tabIndex = -1;

    this.cardEl.innerHTML = `
      <!-- Mobile Sheet Drag Handle -->
      <div class="lore-drag-handle" id="lore-drag-handle">
        <div class="lore-drag-bar"></div>
      </div>

      <!-- Close Button (×) -->
      <button type="button" class="lore-close-btn" id="lore-close-btn" aria-label="Close story">&times;</button>

      <!-- LEFT COLUMN: Visual Stage -->
      <div class="lore-visual-panel" id="lore-visual-panel">
        <canvas class="lore-visual-canvas" id="lore-visual-canvas"></canvas>
      </div>

      <!-- RIGHT COLUMN: Story Content & Controls -->
      <div class="lore-content-panel">
        <!-- Top Meta Row -->
        <div class="lore-top-bar">
          <span class="lore-tagline" id="lore-tagline">Chapter I</span>
          <button type="button" class="lore-btn-skip" id="lore-btn-skip">Skip story</button>
        </div>

        <!-- Slide Viewport -->
        <div class="lore-slide-viewport" id="lore-slide-viewport">
          <div class="lore-slide-content" id="lore-slide-content">
            <h2 class="lore-hook-heading" id="lore-hook-heading"></h2>
            <p class="lore-support-text" id="lore-support-text"></p>
            <p class="lore-small-print" id="lore-small-print" style="display: none;"></p>
            <button type="button" class="lore-curiosities-link" id="lore-curiosities-link" style="display: none;">
              Explore the curiosities &rarr;
            </button>
          </div>
        </div>

        <!-- Footer: Progress Dots + Navigation -->
        <div class="lore-footer">
          <div class="lore-dots-container" id="lore-dots-container" role="tablist" aria-label="Story slides">
            ${LORE_SLIDES.map((_, i) => `
              <button type="button" class="lore-dot ${i === 0 ? 'is-active' : ''}" data-slide-index="${i}" role="tab" aria-selected="${i === 0}" aria-label="Slide ${i + 1} of ${LORE_SLIDES.length}"></button>
            `).join('')}
          </div>

          <div class="lore-nav-buttons">
            <button type="button" class="lore-btn-back" id="lore-btn-back" disabled aria-label="Previous slide">Back</button>
            <button type="button" class="lore-btn-next" id="lore-btn-next" aria-label="Next slide">Next</button>
            <button type="button" class="lore-btn-cta" id="lore-btn-cta" style="display: none;">Find yours in π</button>
          </div>
        </div>
      </div>
    `;

    this.overlayEl.appendChild(this.cardEl);
    this.container.appendChild(this.overlayEl);

    // Cache elements
    this.visualCanvas = this.cardEl.querySelector('#lore-visual-canvas') as HTMLCanvasElement;
    this.visualCtx = this.visualCanvas.getContext('2d');
    this.taglineEl = this.cardEl.querySelector('#lore-tagline') as HTMLElement;
    this.skipBtn = this.cardEl.querySelector('#lore-btn-skip') as HTMLButtonElement;
    this.closeBtn = this.cardEl.querySelector('#lore-close-btn') as HTMLButtonElement;

    this.slideContentEl = this.cardEl.querySelector('#lore-slide-content') as HTMLElement;
    this.hookHeadingEl = this.cardEl.querySelector('#lore-hook-heading') as HTMLElement;
    this.supportTextEl = this.cardEl.querySelector('#lore-support-text') as HTMLElement;
    this.smallPrintEl = this.cardEl.querySelector('#lore-small-print') as HTMLElement;
    this.curiositiesLinkEl = this.cardEl.querySelector('#lore-curiosities-link') as HTMLElement;

    this.dotsContainerEl = this.cardEl.querySelector('#lore-dots-container') as HTMLElement;
    this.backBtn = this.cardEl.querySelector('#lore-btn-back') as HTMLButtonElement;
    this.nextBtn = this.cardEl.querySelector('#lore-btn-next') as HTMLButtonElement;
    this.ctaBtn = this.cardEl.querySelector('#lore-btn-cta') as HTMLButtonElement;
  }

  private attachEventListeners() {
    // Backdrop click
    this.overlayEl.addEventListener('click', (e) => {
      if (e.target === this.overlayEl) {
        this.close();
      }
    });

    // Close and Skip buttons
    this.closeBtn.addEventListener('click', () => this.close());
    this.skipBtn.addEventListener('click', () => this.close());

    // Navigation buttons
    this.backBtn.addEventListener('click', () => this.prevSlide());
    this.nextBtn.addEventListener('click', () => this.nextSlide());

    // Slide 6 Primary CTA: "Find yours in π"
    this.ctaBtn.addEventListener('click', () => {
      this.close();
      this.callbacks.onFindYours?.();
    });

    // Slide 6 Secondary Link: "Explore the curiosities"
    this.curiositiesLinkEl.addEventListener('click', () => {
      this.close();
      this.callbacks.onExploreCuriosities?.();
    });

    // Progress dots click
    this.dotsContainerEl.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('.lore-dot') as HTMLButtonElement | null;
      if (target && target.dataset.slideIndex !== undefined) {
        const idx = parseInt(target.dataset.slideIndex, 10);
        if (!isNaN(idx)) {
          this.goToSlide(idx);
        }
      }
    });

    // Keyboard navigation & Focus trap
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.nextSlide();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.prevSlide();
      } else if (e.key === 'Tab') {
        this.handleFocusTrap(e);
      }
    });

    // Mobile Swipe Gestures
    this.cardEl.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this.touchStartX = e.touches[0].clientX;
        this.touchStartY = e.touches[0].clientY;
        this.isHandleDrag = !!(e.target as HTMLElement).closest('.lore-drag-handle');
      }
    }, { passive: true });

    this.cardEl.addEventListener('touchend', (e) => {
      if (e.changedTouches.length === 1) {
        const deltaX = e.changedTouches[0].clientX - this.touchStartX;
        const deltaY = e.changedTouches[0].clientY - this.touchStartY;

        // If swipe down on handle -> close
        if (this.isHandleDrag && deltaY > 50 && Math.abs(deltaY) > Math.abs(deltaX)) {
          this.close();
          return;
        }

        // Horizontal swipe between slides
        if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY)) {
          if (deltaX < 0) {
            this.nextSlide();
          } else {
            this.prevSlide();
          }
        }
      }
    }, { passive: true });

    // Handle visibility change (pause canvas loop if tab hidden)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.stopAnimationLoop();
      } else if (this.isOpen) {
        this.startAnimationLoop();
      }
    });

    // Window resize (canvas DPI)
    window.addEventListener('resize', () => {
      if (this.isOpen) {
        this.resizeCanvas();
      }
    });
  }

  private handleFocusTrap(e: KeyboardEvent) {
    const focusableSelectors = [
      'button:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
      'a[href]'
    ].join(', ');

    const focusables = Array.from(this.cardEl.querySelectorAll<HTMLElement>(focusableSelectors))
      .filter(el => el.offsetParent !== null); // only visible elements

    if (focusables.length === 0) return;

    const firstEl = focusables[0];
    const lastEl = focusables[focusables.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      }
    } else {
      if (document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
  }

  // ------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------

  public open(startSlideIndex = 0, triggerEl?: HTMLElement | null) {
    if (this.isOpen) return;
    this.isOpen = true;
    this.lastFocusedElement = triggerEl || (document.activeElement as HTMLElement | null);

    // Mark seen in localStorage (wrapped in try/catch)
    try {
      localStorage.setItem('piatlas_lore_seen', '1');
    } catch {
      // Ignore storage restrictions
    }

    // Scroll lock
    document.body.classList.add('lore-open');

    // Reset slide
    this.currentSlideIndex = Math.max(0, Math.min(LORE_SLIDES.length - 1, startSlideIndex));
    this.renderSlide(this.currentSlideIndex, 'none');

    // Show overlay
    this.overlayEl.classList.add('is-open');

    // Setup canvas
    this.resizeCanvas();
    this.startAnimationLoop();

    // Focus
    setTimeout(() => {
      this.cardEl.focus();
    }, 50);
  }

  public close() {
    if (!this.isOpen) return;
    this.isOpen = false;

    this.overlayEl.classList.remove('is-open');
    document.body.classList.remove('lore-open');
    this.stopAnimationLoop();

    // Return focus
    if (this.lastFocusedElement && typeof this.lastFocusedElement.focus === 'function') {
      try {
        this.lastFocusedElement.focus();
      } catch {}
    }

    this.callbacks.onClose?.();
  }

  public nextSlide() {
    if (this.currentSlideIndex < LORE_SLIDES.length - 1) {
      this.goToSlide(this.currentSlideIndex + 1, 'next');
    } else {
      // On final slide, Next functions as CTA
      this.close();
      this.callbacks.onFindYours?.();
    }
  }

  public prevSlide() {
    if (this.currentSlideIndex > 0) {
      this.goToSlide(this.currentSlideIndex - 1, 'prev');
    }
  }

  public goToSlide(targetIndex: number, direction?: 'next' | 'prev') {
    if (targetIndex < 0 || targetIndex >= LORE_SLIDES.length || targetIndex === this.currentSlideIndex) {
      return;
    }

    const dir = direction || (targetIndex > this.currentSlideIndex ? 'next' : 'prev');
    this.currentSlideIndex = targetIndex;
    this.renderSlide(this.currentSlideIndex, dir);
  }

  public getCurrentSlideIndex(): number {
    return this.currentSlideIndex;
  }

  public isModalOpen(): boolean {
    return this.isOpen;
  }

  // ------------------------------------------------------------
  // Slide Rendering & Text Animations
  // ------------------------------------------------------------

  private renderSlide(index: number, direction: 'next' | 'prev' | 'none') {
    const slide = LORE_SLIDES[index];

    // Update Top Meta & Dots
    this.taglineEl.textContent = slide.tagline;

    const dots = this.dotsContainerEl.querySelectorAll<HTMLButtonElement>('.lore-dot');
    dots.forEach((dot, i) => {
      const active = i === index;
      dot.classList.toggle('is-active', active);
      dot.setAttribute('aria-selected', active.toString());
    });

    // Update Nav Buttons
    this.backBtn.disabled = index === 0;

    if (slide.isFinal) {
      this.nextBtn.style.display = 'none';
      this.ctaBtn.style.display = 'inline-block';
      this.curiositiesLinkEl.style.display = 'inline-block';
    } else {
      this.nextBtn.style.display = 'inline-block';
      this.ctaBtn.style.display = 'none';
      this.curiositiesLinkEl.style.display = 'none';
    }

    // Small print
    if (slide.smallPrint) {
      this.smallPrintEl.textContent = slide.smallPrint;
      this.smallPrintEl.style.display = 'block';
    } else {
      this.smallPrintEl.style.display = 'none';
    }

    // Support text
    this.supportTextEl.textContent = slide.support;

    // Word-by-word staggered reveal on Hook Line
    this.renderHookWithWordStagger(slide.hook);

    // Transition animation on content panel
    if (!this.isReducedMotion && direction !== 'none') {
      const exitClass = direction === 'next' ? 'slide-exit-left' : 'slide-exit-right';
      const enterClass = direction === 'next' ? 'slide-enter-right' : 'slide-enter-left';

      this.slideContentEl.classList.add(exitClass);

      setTimeout(() => {
        this.slideContentEl.classList.remove(exitClass);
        this.slideContentEl.classList.add(enterClass);

        // Force reflow
        void this.slideContentEl.offsetWidth;

        this.slideContentEl.classList.remove(enterClass);
      }, 150);
    }
  }

  private renderHookWithWordStagger(hookText: string) {
    this.hookHeadingEl.innerHTML = '';

    if (this.isReducedMotion) {
      this.hookHeadingEl.textContent = hookText;
      return;
    }

    const words = hookText.split(' ');
    words.forEach((word, i) => {
      const span = document.createElement('span');
      span.className = 'lore-word';
      span.style.animationDelay = `${i * 40}ms`;
      span.textContent = word;
      this.hookHeadingEl.appendChild(span);

      if (i < words.length - 1) {
        this.hookHeadingEl.appendChild(document.createTextNode(' '));
      }
    });
  }

  // ------------------------------------------------------------
  // Lightweight Canvas Visual Animations
  // 60fps on mid-range phone, 0% CPU when inactive
  // ------------------------------------------------------------

  private resizeCanvas() {
    if (!this.visualCanvas) return;
    const rect = this.visualCanvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.visualCanvas.width = Math.round(rect.width * dpr);
    this.visualCanvas.height = Math.round(rect.height * dpr);

    if (this.visualCtx) {
      this.visualCtx.resetTransform?.();
      this.visualCtx.scale(dpr, dpr);
    }
  }

  private startAnimationLoop() {
    this.stopAnimationLoop();
    this.animStartTime = performance.now();

    const loop = (now: number) => {
      if (!this.isOpen) return;

      const elapsed = (now - this.animStartTime) / 1000;
      this.drawVisualFrame(this.currentSlideIndex, elapsed);

      if (!this.isReducedMotion) {
        this.rafId = requestAnimationFrame(loop);
      }
    };

    if (this.isReducedMotion) {
      this.drawVisualFrame(this.currentSlideIndex, 1.0);
    } else {
      this.rafId = requestAnimationFrame(loop);
    }
  }

  private stopAnimationLoop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private drawVisualFrame(slideIndex: number, elapsed: number) {
    const ctx = this.visualCtx;
    if (!ctx) return;

    const rect = this.visualCanvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w <= 0 || h <= 0) return;

    // Clear background
    ctx.fillStyle = '#F2EFEB';
    ctx.fillRect(0, 0, w, h);

    switch (slideIndex) {
      case 0:
        this.drawSlide1Stream(ctx, w, h, elapsed);
        break;
      case 1:
        this.drawSlide2Magnifier(ctx, w, h, elapsed);
        break;
      case 2:
        this.drawSlide3Shelves(ctx, w, h, elapsed);
        break;
      case 3:
        this.drawSlide4Circle(ctx, w, h, elapsed);
        break;
      case 4:
        this.drawSlide5AddressCost(ctx, w, h, elapsed);
        break;
      case 5:
        this.drawSlide6ColorsResolve(ctx, w, h, elapsed);
        break;
      default:
        break;
    }
  }

  // Slide 1: Stream of digits scrolling slowly, one short highlighted run of digits glowing
  private drawSlide1Stream(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const piStream = '31415926535897932384626433832795028841971693993751058209749445923078164062862089986280348253421170679';
    const rowHeight = 22;
    const totalRows = Math.ceil(h / rowHeight) + 2;
    const charWidth = 14;

    ctx.font = '13px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';

    const speed = 20; // px/sec
    const targetRow = Math.floor(totalRows / 2);

    for (let r = 0; r < totalRows; r++) {
      const y = r * rowHeight + 10;
      const rowOffset = (r % 2 === 0 ? t * speed : -t * speed * 0.8) + (r * 18);
      const charsInRow = Math.ceil(w / charWidth) + 4;

      for (let c = -2; c < charsInRow; c++) {
        const x = c * charWidth - (rowOffset % charWidth);
        const charIdx = Math.abs(Math.floor((c + Math.floor(rowOffset / charWidth) + r * 7)) % piStream.length);
        const char = piStream[charIdx];

        // Is this character within the highlighted "found" span on the target row?
        const isTargetRow = r === targetRow;
        const targetStartCol = Math.floor(charsInRow / 2) - 3;
        const isHighlighted = isTargetRow && c >= targetStartCol && c <= targetStartCol + 5;

        if (isHighlighted) {
          // Orange highlight tile
          ctx.fillStyle = '#FF5722';
          ctx.fillRect(x - 1, y - 9, charWidth, 18);

          // Crisp white digit
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 13px "JetBrains Mono", monospace';
          ctx.fillText(char, x + 2, y);
          ctx.font = '13px "JetBrains Mono", monospace';
        } else {
          // Quiet background digits
          ctx.fillStyle = isTargetRow ? '#6B6860' : '#B8B5AD';
          ctx.fillText(char, x + 2, y);
        }
      }
    }

    // Subtle center marker brackets around found run
    const centerX = w / 2;
    const centerY = targetRow * rowHeight + 10;
    ctx.strokeStyle = '#FF5722';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(centerX - 46, centerY - 11, 92, 22);
  }

  // Slide 2: "HI" turning into 0809 and magnifier sliding along digit stream
  private drawSlide2Magnifier(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const cycle = (t * 0.7) % 3.0; // 3 second cycle

    // Top: Text conversion visual ("HI" -> "0809")
    ctx.font = '500 16px "Newsreader Variable", serif';
    ctx.fillStyle = '#1F1E1D';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const morphProgress = Math.min(1.0, Math.max(0, (cycle - 0.4) / 0.8));
    const topY = h * 0.32;

    // Box 1: Text "H I"
    ctx.strokeStyle = 'rgba(31, 30, 29, 0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(w * 0.22, topY - 16, 54, 32);
    ctx.fillStyle = '#1F1E1D';
    ctx.fillText('H I', w * 0.22 + 27, topY);

    // Arrow ->
    ctx.font = '13px "JetBrains Mono", monospace';
    ctx.fillStyle = '#FF5722';
    ctx.fillText('&rarr;', w * 0.43, topY);

    // Box 2: Encoded "0809"
    ctx.strokeRect(w * 0.52, topY - 16, 72, 32);
    ctx.fillStyle = morphProgress > 0.5 ? '#FF5722' : '#6B6860';
    ctx.fillText('0809', w * 0.52 + 36, topY);

    // Bottom: Digit stream with magnifying lens
    const streamY = h * 0.70;
    const digits = '3141590809265358979323846264338327950288';
    ctx.font = '13px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';

    const charW = 12;
    const totalW = digits.length * charW;
    const streamStartX = (w - totalW) / 2;

    for (let i = 0; i < digits.length; i++) {
      const dx = streamStartX + i * charW;
      const isTarget = i >= 6 && i <= 9; // '0809'
      ctx.fillStyle = isTarget ? '#1F1E1D' : '#B8B5AD';
      ctx.fillText(digits[i], dx, streamY);
    }

    // Sliding Magnifier Loupe
    const targetX = streamStartX + 7.5 * charW;
    const startX = streamStartX + 2 * charW;
    const lensProgress = Math.min(1.0, Math.max(0, (cycle - 1.0) / 1.2));
    const ease = 1 - Math.pow(1 - lensProgress, 3);
    const lensX = startX + (targetX - startX) * ease;
    const lensRadius = 18;

    // Lens circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(lensX, streamY, lensRadius, 0, Math.PI * 2);
    ctx.strokeStyle = '#FF5722';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(255, 87, 34, 0.08)';
    ctx.fill();
    ctx.stroke();

    // Handle
    ctx.beginPath();
    ctx.moveTo(lensX + lensRadius * 0.7, streamY + lensRadius * 0.7);
    ctx.lineTo(lensX + lensRadius * 1.5, streamY + lensRadius * 1.5);
    ctx.strokeStyle = '#1F1E1D';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
  }

  // Slide 3: Borges Library of Babel - quiet shelves drawn in thin lines, made of tiny digits
  private drawSlide3Shelves(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const shelfCount = 4;
    const padX = 24;
    const shelfW = w - padX * 2;
    const startY = h * 0.18;
    const shelfSpacing = (h * 0.70) / shelfCount;

    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(31, 30, 29, 0.2)';

    const piChunk = '141592653589793238462643383279502884197169399375105820974944592307816406286208998628034825342117';

    for (let s = 0; s < shelfCount; s++) {
      const sy = startY + s * shelfSpacing;

      // Thin shelf plank
      ctx.beginPath();
      ctx.moveTo(padX, sy);
      ctx.lineTo(padX + shelfW, sy);
      ctx.stroke();

      // Books sitting on shelf, drawn with vertical micro-digits
      const bookCount = Math.floor(shelfW / 14);
      for (let b = 0; b < bookCount; b++) {
        const bx = padX + 4 + b * 14;
        const bookH = 26 + (Math.sin(b * 3.7 + s * 2.1) * 6);
        const bookTop = sy - bookH;

        // Spine outline
        ctx.strokeStyle = 'rgba(31, 30, 29, 0.12)';
        ctx.strokeRect(bx, bookTop, 11, bookH);

        // One special highlighted spine with subtle accent marker
        const isSpecialBook = s === 1 && b === Math.floor(bookCount * 0.55);

        if (isSpecialBook) {
          ctx.fillStyle = '#FF5722';
          ctx.fillRect(bx, bookTop, 11, 4);
          ctx.fillStyle = 'rgba(255, 87, 34, 0.12)';
          ctx.fillRect(bx, bookTop + 4, 11, bookH - 4);
        }

        // Micro-digits on spine
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.fillStyle = isSpecialBook ? '#FF5722' : 'rgba(110, 107, 99, 0.45)';
        ctx.textAlign = 'center';

        const digitChar = piChunk[(b * 3 + s * 11 + Math.floor(t * 2)) % piChunk.length];
        ctx.fillText(digitChar, bx + 5.5, bookTop + 14);
      }
    }
  }

  // Slide 4: Sagan Contact circle drawn out of 0s and 1s
  private drawSlide4Circle(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const cols = 22;
    const rows = 14;
    const cellW = w / (cols + 2);
    const cellH = h / (rows + 2);
    const centerX = w / 2;
    const centerY = h / 2;
    const radius = Math.min(w, h) * 0.34;

    const drawProgress = Math.min(1.0, ((t * 0.6) % 3.2) / 2.2);
    const maxAngle = drawProgress * Math.PI * 2;

    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c + 1.5) * cellW;
        const y = (r + 1.5) * cellH;

        const dist = Math.hypot(x - centerX, y - centerY);
        const isOnCircle = Math.abs(dist - radius) < (cellW * 0.75);

        let isLit = false;
        if (isOnCircle) {
          const angle = (Math.atan2(y - centerY, x - centerX) + Math.PI * 2) % (Math.PI * 2);
          if (angle <= maxAngle) {
            isLit = true;
          }
        }

        if (isLit) {
          ctx.fillStyle = '#FF5722';
          ctx.fillText('1', x, y);
        } else {
          ctx.fillStyle = 'rgba(142, 139, 131, 0.3)';
          const binaryDigit = (r * cols + c) % 3 === 0 ? '1' : '0';
          ctx.fillText(binaryDigit, x, y);
        }
      }
    }

    // Delicate circle guide line
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, maxAngle);
    ctx.strokeStyle = 'rgba(255, 87, 34, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Slide 5: Address cost: an arrow pointing to a position counter growing exponentially
  private drawSlide5AddressCost(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const cycle = (t * 0.6) % 3.6;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    // Top Label
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillStyle = 'var(--text-secondary, #6B6860)';
    ctx.fillText('Index &rarr; Target', 24, 28);

    // Number of digits that have spilled onto canvas
    const maxDigits = 240;
    const progress = Math.min(1.0, cycle / 2.6);
    const count = Math.floor(progress * maxDigits);

    const charW = 10;
    const charH = 16;
    const cols = Math.floor((w - 48) / charW);
    const startY = 56;

    ctx.font = '11px "JetBrains Mono", monospace';

    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 24 + col * charW;
      const y = startY + row * charH;

      if (y > h - 20) break;

      const d = ((i * 7 + 3) % 10).toString();
      if (i < 8) {
        ctx.fillStyle = '#FF5722';
      } else {
        ctx.fillStyle = '#1F1E1D';
      }
      ctx.fillText(d, x, y);
    }

    // Growing position exponent label at bottom
    ctx.textAlign = 'right';
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.fillStyle = '#FF5722';
    const exponent = Math.floor(progress * 1000000);
    ctx.fillText(`Pos: 10^${exponent.toLocaleString()}`, w - 24, h - 20);
  }

  // Slide 6: Highlighted digits resolving into π Atlas search field colours
  private drawSlide6ColorsResolve(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const cols = 12;
    const rows = 8;
    const cellW = (w - 40) / cols;
    const cellH = (h - 40) / rows;
    const startX = 20;
    const startY = 20;

    // The signature π Atlas color ramp
    const colorRamp = ['#E8E5DD', '#DDD9CE', '#D1CCBF', '#C4BEAF', '#B7B0A0', '#9E9786', '#888272', '#706B5D'];

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '11px "JetBrains Mono", monospace';

    const settleProgress = Math.min(1.0, ((t * 0.5) % 3.0) / 1.8);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = startX + c * cellW + cellW / 2;
        const y = startY + r * cellH + cellH / 2;

        const isMatchSpan = r === 3 && c >= 3 && c <= 8;

        if (isMatchSpan) {
          // Orange match block
          ctx.fillStyle = '#FF5722';
          ctx.fillRect(x - cellW / 2 + 1, y - cellH / 2 + 1, cellW - 2, cellH - 2);

          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 12px "JetBrains Mono", monospace';
          const digit = ((r * cols + c) % 10).toString();
          ctx.fillText(digit, x, y);
          ctx.font = '11px "JetBrains Mono", monospace';
        } else {
          // Resolving earth tones
          const colorIdx = (r + c + Math.floor(settleProgress * 3)) % colorRamp.length;
          ctx.fillStyle = colorRamp[colorIdx];
          ctx.fillRect(x - cellW / 2 + 1, y - cellH / 2 + 1, cellW - 2, cellH - 2);

          ctx.fillStyle = 'rgba(31, 30, 29, 0.45)';
          const digit = ((r * cols + c * 3) % 10).toString();
          ctx.fillText(digit, x, y);
        }
      }
    }
  }
}
