/**
 * Main application coordinator:
 * Integrates WebGL2 GPU Digit Field, Worker search with request cancellation,
 * van Wijk and Nuij zoom-and-pan flight, Date / Name / Image panels,
 * and About Sheet preferences.
 */

import '@fontsource-variable/newsreader';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';

import { loadPiDigits } from './data/loadPi.ts';
import { Camera } from './viz/camera.ts';
import { Visualizer } from './viz/renderer.ts';
import { Minimap } from './viz/minimap.ts';
import { CameraAnimator } from './viz/tween.ts';
import { ReadoutBar } from './ui/readout.ts';
import { TabManager, TabType } from './ui/tabs.ts';
import { DatePanel } from './ui/datePanel.ts';
import { NamePanel } from './ui/namePanel.ts';
import { ImagePanel } from './ui/imagePanel.ts';
import { AboutSheet } from './ui/aboutSheet.ts';
import { RevealWindow } from './ui/revealWindow.ts';
import { digitToWorld, worldToDigit } from './viz/levels.ts';
import { SearchWorkerRequest, SearchWorkerResponse } from './workers/searchProtocol.ts';
import { renderShareCard, shareOrDownload } from './viz/shareCard.ts';
import { CURIOSITIES } from './viz/curiosities.ts';
import { sound } from './viz/sound.ts';
import { parseDeepLink, buildDateUrl, buildNameUrl, buildVsUrl } from './ui/deepLink.ts';
import { buildDateLookupTable, searchDateFast, computeDuelVerdict } from './encode/dateSearch.ts';
import { PiGame } from './ui/piGame.ts';

const canvas = document.getElementById('digit-canvas') as HTMLCanvasElement;
const inputPanelContainer = document.getElementById('input-panel') as HTMLElement;
const panelWrapper = document.getElementById('input-panel-wrapper') as HTMLElement;
const mobileSheetHandle = document.getElementById('mobile-sheet-handle') as HTMLElement;
const handleTitle = document.getElementById('handle-title') as HTMLElement;
const aboutBtn = document.getElementById('btn-open-about') as HTMLButtonElement;

let visualizer: Visualizer;
let camera: Camera;
let animator: CameraAnimator;
let readoutBar: ReadoutBar;
let tabManager: TabManager;
let aboutSheet: AboutSheet;

let datePanel: DatePanel;
let namePanel: NamePanel;
let imagePanel: ImagePanel;
let revealWindow: RevealWindow;
let piGame: PiGame;
let minimap: Minimap | null = null;
let stopDrift: () => void = () => {};
let lastImageMsg: any = null;

const btnNewSearch = document.getElementById('btn-new-search') as HTMLButtonElement;

function collapseStageBlock() {
  panelWrapper.classList.remove('stage-mode');
  panelWrapper.classList.add('collapsed-bar');
  if (btnNewSearch) {
    btnNewSearch.style.display = 'inline-block';
  }
  const paperOverlay = document.querySelector('.landing-paper-overlay') as HTMLElement;
  if (paperOverlay) paperOverlay.style.opacity = '0';
}

function expandStageBlock() {
  panelWrapper.classList.remove('collapsed-bar');
  panelWrapper.classList.add('stage-mode');
  if (btnNewSearch) {
    btnNewSearch.style.display = 'none';
  }
  const paperOverlay = document.querySelector('.landing-paper-overlay') as HTMLElement;
  if (paperOverlay) paperOverlay.style.opacity = '1';
}

let searchWorker: Worker;
let globalDigits: Uint8Array = new Uint8Array(10_000_000);
let dateLookupTable: Int32Array | null = null;
let currentSearchRequestId = 0;

async function bootstrap() {
  try {
    // 1. Initialize Camera and Animator immediately
    let lastReadoutTime = 0;
    camera = new Camera(() => {
      visualizer?.requestRender();
      minimap?.update();
      const now = performance.now();
      if (now - lastReadoutTime >= 100) {
        lastReadoutTime = now;
        const currentDigit = worldToDigit(camera.x, camera.y);
        readoutBar?.update(currentDigit, camera.zoom);
      }
    });

    animator = new CameraAnimator(camera);

    // 4. Initialize Readout Bar
    readoutBar = new ReadoutBar({
      onGoToPosition: (pos) => {
        flyToDigit(pos, 1, 'Go to');
      },
      onFitOverview: () => {
        resetToOverview();
      },
      onToggleOddEven: () => {
        visualizer.setOddEvenStyle(!visualizer.oddEvenStyle);
        readoutBar.updateOddEvenButton(visualizer.oddEvenStyle);
      }
    });

    // 5. Initialize WebGL2 GPU Visualizer
    visualizer = new Visualizer(canvas, camera, null, null, globalDigits);
    
    // Set camera to digit 0 at zoom 26 (Task 2a: do NOT show overview on load)
    camera.set(0.5, 0.5, 26.0);

    // 5b. Ambient Drift (Task 2a: camera.x increases by 26 px/sec, stops on interaction or search)
    let driftRafId: number | null = null;
    let isDrifting = false;
    let lastDriftTime = 0;

    const startDrift = () => {
      const prefersReduced =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (prefersReduced) return;

      isDrifting = true;
      lastDriftTime = performance.now();

      const tick = (now: number) => {
        if (!isDrifting) return;
        const dt = (now - lastDriftTime) / 1000;
        lastDriftTime = now;

        // At zoom 26, 26 px/sec = 1.0 world digit unit per second
        camera.set(camera.x + dt * (26 / camera.zoom), camera.y, camera.zoom);

        driftRafId = requestAnimationFrame(tick);
      };
      driftRafId = requestAnimationFrame(tick);
    };

    stopDrift = () => {
      if (!isDrifting) return;
      isDrifting = false;
      if (driftRafId !== null) {
        cancelAnimationFrame(driftRafId);
        driftRafId = null;
      }
    };

    window.addEventListener('pointerdown', stopDrift, { capture: true, once: true });
    window.addEventListener('wheel', stopDrift, { capture: true, once: true });
    window.addEventListener('keydown', stopDrift, { capture: true, once: true });

    startDrift();

    // 5c. Minimap (Task 2f)
    const minimapContainer = document.getElementById('minimap-strip');
    if (minimapContainer) {
      minimap = new Minimap(
        minimapContainer,
        camera,
        animator,
        globalDigits,
        () => visualizer.requestRender()
      );
    }

    visualizer.onHoverPosition = (digitIndex) => {
      if (!animator.isAnimating()) {
        readoutBar.update(digitIndex, camera.zoom);
      }
    };

    // 6. Initialize About Sheet
    aboutSheet = new AboutSheet();
    aboutBtn?.addEventListener('click', () => aboutSheet.show());

    // 7. Initialize Web Worker
    searchWorker = new Worker(new URL('./workers/search.worker.ts', import.meta.url), {
      type: 'module'
    });

    const MONTH_NAMES = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const handleDateShare = async (hitData?: any) => {
      const hit = hitData || datePanel?.getPrimaryHit();
      if (!hit) return;
      const dateStr = hitData?.day && hitData?.month && hitData?.year
        ? `${hitData.day} ${MONTH_NAMES[hitData.month - 1] || ''} ${hitData.year}`
        : (datePanel ? datePanel.getDateFormatted() : 'Date');

      // Copy share URL to clipboard (Task 2)
      if (hit.day && hit.month && hit.year) {
        const shareUrl = buildDateUrl(hit.day, hit.month, hit.year, 'share');
        navigator.clipboard?.writeText(shareUrl).catch(() => {});
      }

      const blob = await renderShareCard('date', {
        dateStr,
        startIndex: hit.firstOccurrence,
        length: hit.patternStr?.length || (hit.length ?? 6),
        patternStr: hit.patternStr,
        format: hit.format,
        totalOccurrences: hit.totalOccurrences,
        digits: globalDigits
      });
      const filename = `pi_atlas_date_${Date.now()}.png`;
      const text = `${dateStr} appears at digit ${(hit.firstOccurrence + 1).toLocaleString()} of π!`;
      await shareOrDownload(blob, filename, 'π Atlas · Date in π', text);
    };

    const handleNameShare = async (hitData?: any) => {
      const res = namePanel ? namePanel.getCurrentResult() : null;
      const nameStr = hitData?.name || res?.cleanName || (namePanel ? namePanel.getRawInput() : '') || 'Name';
      const startIdx = hitData ? hitData.firstOccurrence : (res?.firstOccurrence ?? 0);
      const patternStr = hitData?.patternStr || res?.digitStr || '';
      const totalOcc = hitData?.totalOccurrences || res?.totalOccurrences;

      // Copy share URL to clipboard (Task 2)
      if (nameStr) {
        const shareUrl = buildNameUrl(nameStr, 'share');
        navigator.clipboard?.writeText(shareUrl).catch(() => {});
      }

      const blob = await renderShareCard('name', {
        name: nameStr,
        startIndex: startIdx,
        length: patternStr.length || nameStr.length,
        patternStr,
        totalOccurrences: totalOcc,
        digits: globalDigits
      });
      const filename = `pi_atlas_name_${Date.now()}.png`;
      const text = `${nameStr} appears at digit ${(startIdx + 1).toLocaleString()} of π!`;
      await shareOrDownload(blob, filename, 'π Atlas · Name in π', text);
    };

    const handleImageShare = async () => {
      if (!lastImageMsg) return;
      const previewCanvas = imagePanel ? imagePanel.getPreviewCanvas() : null;
      const blob = await renderShareCard('image', {
        imageCanvasOrBitmap: previewCanvas || undefined,
        pixelCount: lastImageMsg.pixelCount,
        startPosition: lastImageMsg.startPosition,
        endPosition: lastImageMsg.endPosition,
        avgGap: lastImageMsg.avgGap
      });
      const filename = `pi_atlas_image_${Date.now()}.png`;
      const text = `My photo, hidden in π: assembled from ${lastImageMsg.pixelCount.toLocaleString()} digits of π!`;
      await shareOrDownload(blob, filename, 'π Atlas · Image in π', text);
    };

    const handleChallengeFriend = (day: number, month: number, year: number, hitPos: number) => {
      const vsUrl = buildVsUrl(day, month, year, 'share');
      const text = `My birthday is at digit ${(hitPos + 1).toLocaleString()} of π. Whose comes first? Enter yours:`;
      const fullShareText = `${text} ${vsUrl}`;

      if (navigator.clipboard) {
        navigator.clipboard.writeText(fullShareText).catch(() => {});
      }

      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        navigator.share({
          title: 'Whose birthday comes first in π? Take the challenge',
          text,
          url: vsUrl
        }).catch(() => {});
      } else {
        alert(`Challenge link copied to clipboard:\n\n${fullShareText}`);
      }
    };

    const handleDuel = (
      d1: { day: number; month: number; year: number },
      d2: { day: number; month: number; year: number }
    ) => {
      stopDrift();
      if (!dateLookupTable && globalDigits && globalDigits.length >= 1000) {
        dateLookupTable = buildDateLookupTable(globalDigits);
      }
      collapseStageBlock();
      const hit1 = searchDateFast(d1.day, d1.month, d1.year, globalDigits, dateLookupTable);
      const hit2 = searchDateFast(d2.day, d2.month, d2.year, globalDigits, dateLookupTable);

      const duelVerdict = computeDuelVerdict(
        { day: d1.day, month: d1.month, year: d1.year, hit: hit1 },
        { day: d2.day, month: d2.month, year: d2.year, hit: hit2 }
      );

      revealWindow.startDuelReveal(duelVerdict);
    };

    // 8. Initialize Reveal Window (glass window sequence)
    revealWindow = new RevealWindow({
      piDigits: globalDigits,
      container: document.getElementById('app') || document.body,
      callbacks: {
        onShowInField: (digitIndex, length, format, patternStr, letterLabels) => {
          flyToDigit(digitIndex, length, format || 'Match', undefined, patternStr, letterLabels);
        },
        onStepOccurrence: (_idx, pos) => {
          readoutBar.update(pos - 1, camera.zoom);
        },
        onUnderlineDigit: (idx) => {
          namePanel?.highlightTile(idx);
        },
        onClose: () => {
          namePanel?.clearTileHighlights();
          expandStageBlock();
        },
        onSwitchToName: () => {
          expandStageBlock();
          tabManager?.setTab('name');
        },
        onCompareDate: () => {
          expandStageBlock();
          if (tabManager?.getActiveTab() !== 'date') {
            tabManager?.setTab('date');
          }
          datePanel?.openCompare();
        },
        onTryAnotherName: () => {
          expandStageBlock();
          tabManager?.setTab('name');
          namePanel?.clearAndFocus();
        },
        onSwitchToDate: () => {
          expandStageBlock();
          tabManager?.setTab('date');
          datePanel?.clearAndFocus();
        },
        onShare: (hit) => {
          if (hit.name) handleNameShare(hit);
          else handleDateShare(hit);
        },
        onChallengeFriend: (day, month, year, hitPos) => {
          handleChallengeFriend(day, month, year, hitPos);
        }
      }
    });

    searchWorker.onmessage = (e: MessageEvent<SearchWorkerResponse>) => {
      const msg = e.data;
      if ('requestId' in msg && msg.requestId !== currentSearchRequestId) {
        return; // Stale request response dropped
      }

      switch (msg.type) {
        case 'DATE_FIRST_HIT': {
          stopDrift();
          collapseStageBlock();
          revealWindow.showSearchProgress(false);

          // Update address bar to shareable link (Task 2)
          window.history.replaceState({}, '', buildDateUrl(msg.day, msg.month, msg.year));

          const revealPref = aboutSheet.getRevealStyle();
          if (revealPref === 'direct') {
            flyToDigit(msg.hit.firstOccurrence, msg.hit.patternStr.length, 'Date Match', msg.hit.format, msg.hit.patternStr);
          } else {
            revealWindow.startReveal({
              day: msg.day,
              month: msg.month,
              year: msg.year,
              format: msg.hit.format,
              patternStr: msg.hit.patternStr,
              firstOccurrence: msg.hit.firstOccurrence,
              occurrences: [msg.hit.firstOccurrence],
              currentOccurrenceIndex: 0,
              totalOccurrences: msg.hit.totalOccurrences ?? 1,
              percentile: msg.hit.percentile
            });
          }
          break;
        }

        case 'DATE_RESULTS': {
          revealWindow.showSearchProgress(false);
          if (msg.result.primaryHit) {
            collapseStageBlock();
            const hit = msg.result.primaryHit;
            const missedLonger = msg.result.misses.find(m => m.patternStr.length > hit.patternStr.length);
            revealWindow.updateSupplementaryData(
              hit.occurrences,
              hit.totalOccurrences,
              missedLonger?.format,
              missedLonger?.patternStr,
              hit.percentile
            );
          } else {
            revealWindow.dismiss();
          }
          datePanel.showResults(msg.result, false);
          break;
        }

        case 'NAME_RESULTS': {
          namePanel.showResults(msg.result);
          if (msg.silent) {
            break;
          }
          stopDrift();
          collapseStageBlock();

          // Update address bar to shareable link (Task 2)
          if (msg.result.cleanName) {
            window.history.replaceState({}, '', buildNameUrl(msg.result.cleanName));
          }

          const revealPref = aboutSheet.getRevealStyle();

          const letterLabels = msg.result.cleanName ? msg.result.cleanName.toUpperCase().split('') : undefined;

          if (revealPref === 'direct') {
            flyToDigit(msg.result.firstOccurrence, msg.result.digitStr.length, 'Name Match', 'Keypad', msg.result.digitStr, letterLabels);
          } else {
            namePanel.clearTileHighlights();
            if (msg.result.foundAs === 'pieces') {
              revealWindow.startReveal({
                name: msg.result.cleanName,
                letterLabels,
                format: 'Keypad (Pieces)',
                patternStr: msg.result.digitStr,
                firstOccurrence: msg.result.firstOccurrence,
                occurrences: msg.result.occurrences,
                currentOccurrenceIndex: 0,
                totalOccurrences: msg.result.totalOccurrences,
                pieces: msg.result.pieces?.map(p => ({
                  pieceStr: p.digitStr,
                  startIndex: p.startIndexInName,
                  firstOccurrence: p.firstOccurrenceInPi,
                  letterLabels: msg.result.cleanName.slice(p.startIndexInName, p.startIndexInName + p.digitStr.length).toUpperCase().split('')
                }))
              });
            } else {
              revealWindow.startReveal({
                name: msg.result.cleanName,
                letterLabels,
                format: 'Keypad',
                patternStr: msg.result.digitStr,
                firstOccurrence: msg.result.firstOccurrence,
                occurrences: msg.result.occurrences,
                currentOccurrenceIndex: 0,
                totalOccurrences: msg.result.totalOccurrences
              });
            }
          }
          break;
        }

        case 'IMAGE_RESULTS': {
          stopDrift();
          runCinematicSequence(msg);
          break;
        }

        case 'ERROR': {
          console.error('[Search Worker Error]', msg.message);
          break;
        }
      }
    };

    // 9. Initialize Panels
    datePanel = new DatePanel(inputPanelContainer, {
      onSearch: (candidates, day, month, year) => {
        currentSearchRequestId++;
        revealWindow.showSearchProgress(true);
        searchWorker.postMessage({
          type: 'SEARCH_DATE',
          requestId: currentSearchRequestId,
          candidates,
          day,
          month,
          year
        } satisfies SearchWorkerRequest);
      },
      onNavigateToOccurrence: (startIndex, length, format, patternStr) => {
        flyToDigit(startIndex, length, 'Date Match', format, patternStr);
      },
      onShare: () => {
        handleDateShare();
      },
      onChallengeFriend: (day, month, year, hitPos) => {
        handleChallengeFriend(day, month, year, hitPos);
      },
      onDuel: (d1, d2) => {
        handleDuel(d1, d2);
      }
    });

    namePanel = new NamePanel(inputPanelContainer, {
      onSearch: (request) => {
        currentSearchRequestId++;
        searchWorker.postMessage({
          type: 'SEARCH_NAME',
          requestId: currentSearchRequestId,
          ...request
        } satisfies SearchWorkerRequest);
      },
      onNavigateToOccurrence: (startIndex, length, label, letterLabels) => {
        flyToDigit(startIndex, length, label, undefined, undefined, letterLabels);
      },
      onShare: () => {
        handleNameShare();
      },
      onSwitchToDate: () => {
        expandStageBlock();
        tabManager?.setTab('date');
        datePanel?.clearAndFocus();
      }
    });

    // 8b. Cinematic Image Gather Sequence (Task 5c, 5d, 5e)
    let isCinematicRunning = false;
    let cinematicRafId: number | null = null;
    let cinematicTimeoutId: number | null = null;

    const cancelCinematic = () => {
      isCinematicRunning = false;
      if (cinematicRafId !== null) {
        cancelAnimationFrame(cinematicRafId);
        cinematicRafId = null;
      }
      if (cinematicTimeoutId !== null) {
        clearTimeout(cinematicTimeoutId);
        cinematicTimeoutId = null;
      }
    };

    const finishCinematic = () => {
      cancelCinematic();
      visualizer.stopImageGather();
      visualizer.setDim(0.8);
      visualizer.setImageGatherProgress(1.0);

      if (lastImageMsg) {
        imagePanel.showResult(lastImageMsg);

        const rect = visualizer.glImageGather.getImageRect();
        const overlay = document.getElementById('img-cinematic-overlay');
        const frame = document.getElementById('img-cinematic-frame');
        const caption = document.getElementById('img-cinematic-caption');
        const title = document.getElementById('cinematic-caption-title');
        const sub = document.getElementById('cinematic-caption-sub');

        if (overlay && frame && caption && rect) {
          overlay.style.display = 'block';
          frame.style.left = `${rect.x}px`;
          frame.style.top = `${rect.y}px`;
          frame.style.width = `${rect.width}px`;
          frame.style.height = `${rect.height}px`;

          caption.style.left = `${rect.x}px`;
          caption.style.width = `${rect.width}px`;
          caption.style.top = `${rect.y + rect.height + 14}px`;

          if (title) title.textContent = `Your image, in ${lastImageMsg.pixelCount.toLocaleString()} digits of π`;
          if (sub) sub.textContent = `digits ${(lastImageMsg.startPosition + 1).toLocaleString()} to ${(lastImageMsg.endPosition + 1).toLocaleString()}`;

          caption.classList.add('visible');
        }
      }
    };

    const skipCinematic = () => {
      if (!isCinematicRunning || !lastImageMsg) return;
      animator.stop();
      const startRow = Math.floor(lastImageMsg.startPosition / 1000);
      const endRow = Math.floor(lastImageMsg.endPosition / 1000);
      const { targetX, targetY, targetZoom } = camera.fitSpan(startRow, endRow);
      camera.set(targetX, targetY, targetZoom);
      finishCinematic();
    };

    window.addEventListener('keydown', (e) => {
      if (isCinematicRunning && (e.code === 'Space' || e.key === ' ')) {
        e.preventDefault();
        skipCinematic();
      }
    });

    window.addEventListener('pointerdown', (e) => {
      if (isCinematicRunning) {
        const t = e.target as HTMLElement;
        if (!t.closest('#input-panel-wrapper') && !t.closest('.tab-nav')) {
          skipCinematic();
        }
      }
    });

    const runCinematicSequence = (msg: any) => {
      cancelCinematic();
      lastImageMsg = msg;
      isCinematicRunning = true;

      const overlay = document.getElementById('img-cinematic-overlay');
      const caption = document.getElementById('img-cinematic-caption');
      if (overlay) overlay.style.display = 'none';
      if (caption) caption.classList.remove('visible');

      if (window.innerWidth <= 768) {
        panelWrapper.classList.add('collapsed');
      }

      visualizer.setImageGatherData({
        startPositions: msg.positions,
        levels: msg.levels,
        colors: msg.colors,
        width: msg.width,
        height: msg.height,
        startDigitIndex: msg.startPosition,
        endDigitIndex: msg.endPosition
      });
      visualizer.setImageGatherProgress(0.0);
      visualizer.setDim(0.0);

      const startRow = Math.floor(msg.startPosition / 1000);
      const endRow = Math.floor(msg.endPosition / 1000);
      const { targetX, targetY, targetZoom } = camera.fitSpan(startRow, endRow);

      // 1. fitSpan camera move (0.9s)
      animator.flyTo({
        targetX,
        targetY,
        targetZoom,
        durationMs: 900,
        onUpdate: () => visualizer.requestRender(),
        onComplete: () => {
          if (!isCinematicRunning) return;

          // 2. Dim field: animate u_dim from 0 to 0.8 over 400ms
          const dimStart = performance.now();
          const dimDuration = 400;

          const dimStep = (now: number) => {
            if (!isCinematicRunning) return;
            const elapsed = now - dimStart;
            const progress = Math.min(1.0, elapsed / dimDuration);
            const eased = 1 - Math.pow(1 - progress, 3);
            visualizer.setDim(eased * 0.8);

            if (progress < 1.0) {
              cinematicRafId = requestAnimationFrame(dimStep);
            } else {
              visualizer.setDim(0.8);
              cinematicRafId = null;

              // 3. Hold 500ms so user sees scattered chosen digits
              cinematicTimeoutId = window.setTimeout(() => {
                if (!isCinematicRunning) return;

                // 4. Run the gather (2.4s, ease-in-out)
                visualizer.playImageGather(2400, (p) => imagePanel.updateScrubber(p), () => {
                  if (!isCinematicRunning) return;
                  // 5. Draw 1px frame and fade in caption plate
                  finishCinematic();
                });
              }, 500);
            }
          };
          cinematicRafId = requestAnimationFrame(dimStep);
        }
      });
    };

    // Overlay button listeners (Task 5e)
    const cinematicReplayBtn = document.getElementById('cinematic-btn-replay');
    cinematicReplayBtn?.addEventListener('click', () => {
      if (lastImageMsg) runCinematicSequence(lastImageMsg);
    });

    const cinematicAnotherBtn = document.getElementById('cinematic-btn-another');
    cinematicAnotherBtn?.addEventListener('click', () => {
      cancelCinematic();
      visualizer.setDim(0);
      visualizer.clearImageGather();
      const overlay = document.getElementById('img-cinematic-overlay');
      if (overlay) overlay.style.display = 'none';
      expandStageBlock();
      imagePanel.resetToChoose();
    });

    const cinematicShareBtn = document.getElementById('cinematic-btn-share');
    cinematicShareBtn?.addEventListener('click', () => {
      handleImageShare();
    });

    imagePanel = new ImagePanel(inputPanelContainer, {
      onSearch: (request) => {
        currentSearchRequestId++;
        searchWorker.postMessage(
          {
            type: 'PROCESS_AND_SEARCH_IMAGE',
            requestId: currentSearchRequestId,
            ...request
          } satisfies SearchWorkerRequest,
          [request.rgbaBuffer]
        );
      },
      onPlayGather: (dur) => {
        visualizer.playImageGather(dur, (p) => imagePanel.updateScrubber(p));
      },
      onPauseGather: () => {
        visualizer.stopImageGather();
      },
      onScrubGather: (t) => {
        visualizer.setImageGatherProgress(t);
      },
      onShare: () => {
        handleImageShare();
      },
      getDateHitPosition: () => {
        return datePanel.getPrimaryHitPosition();
      },
      onReplayCinematic: () => {
        if (lastImageMsg) runCinematicSequence(lastImageMsg);
      }
    });

    // 10. Tab Manager
    tabManager = new TabManager((tab) => {
      switchTab(tab);
    });

    // Default view: Date tab open
    switchTab('date');

    // 11. Mobile Bottom Sheet handle toggle
    window.addEventListener('resize', () => {
      visualizer.resize();
      minimap?.resize();
    });

    btnNewSearch?.addEventListener('click', () => {
      expandStageBlock();
    });

    if (mobileSheetHandle) {
      mobileSheetHandle.addEventListener('click', () => {
        panelWrapper.classList.toggle('collapsed');
      });
    }

    // 12. Global Keyboard Shortcuts
    setupKeyboardShortcuts();

    // 13. Curiosities Discovery Modal
    const curiositiesModal = document.getElementById('curiosities-modal');
    const btnOpenCuriosities = document.getElementById('btn-open-curiosities');
    const btnCloseCuriosities = document.getElementById('btn-close-curiosities');
    const curiositiesGrid = document.getElementById('curiosities-grid');

    if (curiositiesGrid) {
      curiositiesGrid.innerHTML = CURIOSITIES.map(c => `
        <div class="curiosity-item-card" data-curiosity-id="${c.id}">
          <div class="curiosity-item-info">
            <div class="curiosity-item-title">${c.title}</div>
            <div class="curiosity-item-desc">${c.description}</div>
            <div style="font-family: var(--font-mono); font-size: 11px; color: var(--accent); margin-top: 4px;">
              Pos ${(c.digitIndex + 1).toLocaleString()} · Probability ${c.probability}
            </div>
          </div>
          <div class="curiosity-item-digits">${c.sequence}</div>
        </div>
      `).join('');

      curiositiesGrid.querySelectorAll<HTMLElement>('.curiosity-item-card').forEach(card => {
        card.addEventListener('click', () => {
          const id = card.dataset.curiosityId;
          const c = CURIOSITIES.find(item => item.id === id);
          if (c) {
            if (curiositiesModal) {
              curiositiesModal.style.display = 'none';
              curiositiesModal.style.opacity = '0';
            }
            collapseStageBlock();
            const url = new URL(window.location.href);
            url.searchParams.set('curiosity', c.id);
            window.history.replaceState({}, '', url.toString());
            sound.playChime();
            flyToDigit(c.digitIndex, c.sequence.length, c.title, 'Curiosity', c.sequence);
          }
        });
      });
    }

    const openCuriosities = () => {
      visualizer.clearImageGather();
      visualizer.setDim(0);
      const overlay = document.getElementById('img-cinematic-overlay');
      if (overlay) overlay.style.display = 'none';
      if (curiositiesModal) {
        curiositiesModal.style.display = 'block';
        curiositiesModal.style.opacity = '1';
      }
    };
    const closeCuriosities = () => {
      if (curiositiesModal) {
        curiositiesModal.style.display = 'none';
        curiositiesModal.style.opacity = '0';
      }
    };

    btnOpenCuriosities?.addEventListener('click', openCuriosities);
    btnCloseCuriosities?.addEventListener('click', closeCuriosities);
    curiositiesModal?.addEventListener('click', (e) => {
      if (e.target === curiositiesModal) {
        closeCuriosities();
      }
    });

    // 13b. π Challenge Game Modal
    piGame = new PiGame(document.getElementById('app') || document.body, globalDigits, {
      onShowInField: (startIndex, length, label, patternStr) => {
        collapseStageBlock();
        flyToDigit(startIndex, length, label, 'Pi Game', patternStr);
      }
    });

    const btnOpenGame = document.getElementById('btn-open-game');
    btnOpenGame?.addEventListener('click', () => {
      visualizer.clearImageGather();
      visualizer.setDim(0);
      const overlay = document.getElementById('img-cinematic-overlay');
      if (overlay) overlay.style.display = 'none';
      piGame.open();
    });

    // 14. Sound Synthesizer UI Toggle
    const btnToggleSound = document.getElementById('btn-toggle-sound');
    const soundLabel = document.getElementById('sound-label');
    const updateSoundUI = () => {
      if (soundLabel) {
        soundLabel.textContent = sound.isEnabled() ? '🔊 Sound: On' : '🔈 Sound: Off';
      }
    };
    updateSoundUI();
    btnToggleSound?.addEventListener('click', () => {
      sound.setEnabled(!sound.isEnabled());
      updateSoundUI();
      if (sound.isEnabled()) {
        sound.playChime();
      }
    });

    // 15. URL Deep-linking Handler (Task 2 & 4: ?d=DDMMYYYY, ?n=name, ?vs=DDMMYYYY)
    const handleUrlDeepLink = () => {
      const parsed = parseDeepLink();

      if (parsed.vs) {
        tabManager.setTab('date');
        const friendHit = searchDateFast(parsed.vs.day, parsed.vs.month, parsed.vs.year, globalDigits, dateLookupTable);
        if (friendHit) {
          datePanel.setupVsMode(parsed.vs, friendHit.firstOccurrence);
        } else {
          datePanel.setupVsMode(parsed.vs);
        }
        return;
      }

      if (parsed.d) {
        tabManager.setTab('date');
        datePanel.setDate(parsed.d.day, parsed.d.month, parsed.d.year);
        datePanel.triggerSearch();
        return;
      }

      if (parsed.n) {
        tabManager.setTab('name');
        namePanel.setName(parsed.n);
        namePanel.triggerSearch(false);
        return;
      }

      // Curiosity deep link fallback
      const params = new URLSearchParams(window.location.search);
      const curiosityParam = params.get('curiosity');
      if (curiosityParam) {
        const c = CURIOSITIES.find(item => item.id === curiosityParam);
        if (c) {
          collapseStageBlock();
          flyToDigit(c.digitIndex, c.sequence.length, c.title, 'Curiosity', c.sequence);
          return;
        }
      }
    };

    // 16. Fast background loading of 10M digits (parallel chunks)
    loadPiDigits((percent: number) => {
      datePanel?.updateLoadingProgress(percent);
      namePanel?.updateLoadingProgress(percent);
    }).then((loadedDigits) => {
      globalDigits = loadedDigits;
      dateLookupTable = buildDateLookupTable(globalDigits);
      visualizer.updateDigits(globalDigits);
      minimap?.updateDigits(globalDigits);
      revealWindow.updatePiDigits(globalDigits);
      piGame?.updateDigits(globalDigits);
      searchWorker.postMessage({
        type: 'INIT',
        digits: globalDigits
      } satisfies SearchWorkerRequest);
      datePanel?.updateLoadingProgress(100);
      namePanel?.updateLoadingProgress(100);
      handleUrlDeepLink();
    }).catch((err) => {
      console.error('[Pi Atlas] Failed to load pi digits:', err);
    });

    if (import.meta.env.DEV) {
      (window as any).__PI_ATLAS__ = {
        get digits() { return globalDigits; },
        camera,
        visualizer,
        animator,
        readoutBar,
        tabManager,
        datePanel,
        namePanel,
        imagePanel,
        revealWindow,
        aboutSheet,
        piGame
      };
      console.log('[Pi Atlas WebGL2] Initialized.');
    }
  } catch (err) {
    console.error('[Pi Atlas] Fatal error during bootstrap:', err);
  }
}


function switchTab(tab: TabType) {
  visualizer.setHighlight(null);
  visualizer.clearImageGather();
  visualizer.setDim(0);
  const overlay = document.getElementById('img-cinematic-overlay');
  if (overlay) overlay.style.display = 'none';
  expandStageBlock();

  if (handleTitle) {
    handleTitle.textContent =
      tab === 'date' ? 'Date in π' : tab === 'name' ? 'Name in π' : 'Image in π';
  }

  if (tab === 'date') {
    datePanel.render();
  } else if (tab === 'name') {
    namePanel.render();
  } else if (tab === 'image') {
    imagePanel.render();
  }
}

function announce(text: string) {
  const el = document.getElementById('aria-announcer');
  if (el) el.textContent = text;
}

function flyToDigit(
  startIndex: number,
  length: number,
  label?: string,
  format?: string,
  patternStr?: string,
  letterLabels?: string[]
) {
  stopDrift();
  visualizer.clearImageGather();
  visualizer.setDim(0);
  const overlay = document.getElementById('img-cinematic-overlay');
  if (overlay) overlay.style.display = 'none';

  minimap?.setResultIndices([startIndex]);
  const { x, y } = digitToWorld(startIndex);
  visualizer.setHighlight({ startIndex, length, label, format, patternStr, letterLabels });

  announce(`${label || 'Match'} at position ${(startIndex + 1).toLocaleString()}`);

  animator.flyTo({
    targetX: x + length / 2,
    targetY: y + 0.5,
    targetZoom: 32.0,
    onUpdate: () => visualizer.requestRender(),
    onComplete: () => {
      readoutBar.update(
        startIndex,
        camera.zoom,
        `${label || 'Match'} "${patternStr || ''}" at ${(startIndex + 1).toLocaleString()}`
      );
    }
  });
}

function resetToOverview() {
  visualizer.setHighlight(null);
  visualizer.clearImageGather();
  minimap?.setResultIndices([]);
  camera.fitOverview();
}

function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    switch (e.key) {
      case '1':
        tabManager.setTab('date');
        break;
      case '2':
        tabManager.setTab('name');
        break;
      case '3':
        tabManager.setTab('image');
        break;
      case 'f':
      case 'F':
        resetToOverview();
        break;
      case '+':
      case '=':
        camera.zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1.25);
        visualizer.requestRender();
        break;
      case '-':
      case '_':
        camera.zoomAt(window.innerWidth / 2, window.innerHeight / 2, 0.8);
        visualizer.requestRender();
        break;
      case '?':
        aboutSheet?.show();
        break;
    }
  });
}

// Start application
bootstrap();
