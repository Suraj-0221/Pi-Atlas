/**
 * About sheet explaining mathematical probabilities, digit conventions, client privacy,
 * and user preferences (Reveal Style: Glass vs Direct).
 */

export type RevealStyle = 'glass' | 'direct';

export interface AboutSheetCallbacks {
  onRevealStyleChange?: (style: RevealStyle) => void;
}

export class AboutSheet {
  private overlay: HTMLElement;
  private currentRevealStyle: RevealStyle = 'glass';
  private callbacks: AboutSheetCallbacks;

  constructor(callbacks?: AboutSheetCallbacks) {
    this.callbacks = callbacks || {};
    const saved = localStorage.getItem('pi_atlas_reveal_style');
    if (saved === 'direct' || saved === 'glass') {
      this.currentRevealStyle = saved;
    }

    this.overlay = document.createElement('div');
    this.overlay.className = 'about-overlay';
    this.overlay.style.display = 'none';

    this.overlay.innerHTML = `
      <div class="about-card">
        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px;">
          <h2 style="font-family: var(--font-serif); font-size: 1.25rem; font-weight: 500; color: var(--text-primary);">About π Atlas</h2>
          <button type="button" id="about-close-btn" class="tab-btn" style="padding: 2px 8px; font-size: 0.8rem;">Close [Esc]</button>
        </div>

        <div style="display: flex; flex-direction: column; gap: 12px; font-family: var(--font-serif); font-size: 0.88rem; line-height: 1.55; color: var(--text-secondary);">
          <!-- Reveal Style Preference -->
          <div style="padding: 10px; background: rgba(0,0,0,0.03); border-radius: 6px; font-family: var(--font-sans); font-size: 0.82rem;">
            <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">Search Reveal Animation:</div>
            <div style="display: flex; gap: 16px;">
              <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                <input type="radio" name="reveal-pref" value="glass" ${this.currentRevealStyle === 'glass' ? 'checked' : ''} />
                <span><b>Glass</b> (default: glass ribbon sequence, then field)</span>
              </label>
              <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                <input type="radio" name="reveal-pref" value="direct" ${this.currentRevealStyle === 'direct' ? 'checked' : ''} />
                <span><b>Direct</b> (skip glass, fly straight into field)</span>
              </label>
            </div>
          </div>

          <p>
            <strong style="color: var(--text-primary);">The Territory</strong>:
            This atlas renders 10,000,000 decimal digits of π on the GPU via a single WebGL2 quad with procedural semantic zoom and distance-field glyphs.
          </p>

          <p>
            <strong style="color: var(--text-primary);">The Odds & Honesty</strong>:
            An exact <em>N</em>-digit sequence occurs about once per $10^N$ digits. In 10M digits, 6-digit strings almost always hit (~99.995% chance), 8-digit strings occur ~9.5% of the time, and 10+ digits almost never.
          </p>

          <p>
            <strong style="color: var(--text-primary);">Client Privacy</strong>:
            All searches, name encodings, and image quantizations happen strictly inside your browser via Web Workers and GPU shaders. Nothing is uploaded.
          </p>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);

    const closeBtn = this.overlay.querySelector('#about-close-btn') as HTMLElement;
    closeBtn.addEventListener('click', () => this.hide());

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.hide();
    });

    const radios = this.overlay.querySelectorAll<HTMLInputElement>('input[name="reveal-pref"]');
    radios.forEach(r => {
      r.addEventListener('change', () => {
        if (r.checked) {
          this.currentRevealStyle = r.value as RevealStyle;
          localStorage.setItem('pi_atlas_reveal_style', this.currentRevealStyle);
          this.callbacks.onRevealStyleChange?.(this.currentRevealStyle);
        }
      });
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible()) {
        this.hide();
      }
    });
  }

  public getRevealStyle(): RevealStyle {
    return this.currentRevealStyle;
  }

  public show() {
    this.overlay.style.display = 'flex';
  }

  public hide() {
    this.overlay.style.display = 'none';
  }

  public isVisible(): boolean {
    return this.overlay.style.display !== 'none';
  }
}
