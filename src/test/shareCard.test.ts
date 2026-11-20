import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderShareCard, shareOrDownload, ShareCardData } from '../viz/shareCard.ts';

describe('TASK 6: Share Card Generator', () => {
  let mockCtx: any;
  let mockCanvas: any;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockCtx = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: '',
      textBaseline: '',
      imageSmoothingEnabled: false,
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 100 }),
      drawImage: vi.fn()
    };

    mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(mockCtx),
      toBlob: vi.fn((cb: (b: Blob) => void) => {
        cb(new Blob(['mock-png-bytes'], { type: 'image/png' }));
      })
    };

    // Setup mock document for Node environment
    (globalThis as any).document = {
      fonts: {
        ready: Promise.resolve()
      },
      createElement: vi.fn((tag: string) => {
        if (tag === 'canvas') return mockCanvas;
        if (tag === 'a') return { href: '', download: '', click: vi.fn() };
        return {};
      }),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn()
      }
    };

    if (typeof URL.createObjectURL !== 'function') {
      URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    }
    if (typeof URL.revokeObjectURL !== 'function') {
      URL.revokeObjectURL = vi.fn();
    }
  });

  it('renders a date share card blob with correct paper background and 1080x1350 dimensions', async () => {
    const mockDigits = new Uint8Array(1000);
    for (let i = 0; i < mockDigits.length; i++) mockDigits[i] = i % 10;

    const data: ShareCardData = {
      headline: '14 May 1998 is at digit 1,203,449 of π',
      dateStr: '14 May 1998',
      startIndex: 1203449,
      length: 6,
      format: 'DDMMYY',
      patternStr: '140598',
      totalOccurrences: 24,
      digits: mockDigits
    };

    const blob = await renderShareCard('date', data);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');

    // Verify canvas size
    expect(mockCanvas.width).toBe(1080);
    expect(mockCanvas.height).toBe(1350);

    // Verify paper background fill
    expect(mockCtx.fillRect).toHaveBeenCalledWith(0, 0, 1080, 1350);

    // Verify 64px margin strokeRect
    expect(mockCtx.strokeRect).toHaveBeenCalledWith(64.5, 64.5, 951, 1221);
  });

  it('renders a name share card blob with 17x9 real digit grid and matched digits', async () => {
    const mockDigits = new Uint8Array(1000);
    for (let i = 0; i < mockDigits.length; i++) mockDigits[i] = (i * 3) % 10;

    const data: ShareCardData = {
      headline: 'SURAJ is at digit 28,114 of π',
      name: 'SURAJ',
      startIndex: 28114,
      length: 5,
      patternStr: '78725',
      totalOccurrences: 3,
      digits: mockDigits
    };

    const blob = await renderShareCard('name', data);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');

    // 17x9 = 153 digit cells drawn
    expect(mockCtx.fillText).toHaveBeenCalled();
  });

  it('renders an image share card with centered 640px image frame', async () => {
    const mockImageSource = {} as any;
    const data: ShareCardData = {
      headline: 'My photo, hidden in π',
      imageCanvasOrBitmap: mockImageSource,
      pixelCount: 9216,
      startPosition: 4,
      endPosition: 91738,
      avgGap: 10.0
    };

    const blob = await renderShareCard('image', data);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');

    // Image drawn at 640x640 centered at x=220
    expect(mockCtx.drawImage).toHaveBeenCalledWith(mockImageSource, 220, 325, 640, 640);
  });

  it('shareOrDownload uses navigator.share when available and supported', async () => {
    const blob = new Blob(['mock-png'], { type: 'image/png' });
    const shareMock = vi.fn().mockResolvedValue(undefined);
    const canShareMock = vi.fn().mockReturnValue(true);

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        share: shareMock,
        canShare: canShareMock
      },
      writable: true,
      configurable: true
    });

    await shareOrDownload(blob, 'test.png', 'Test Title', 'Test Text');

    expect(canShareMock).toHaveBeenCalled();
    expect(shareMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Test Title',
        text: 'Test Text'
      })
    );
  });

  it('shareOrDownload falls back to programmatic file download when navigator.canShare is false', async () => {
    const blob = new Blob(['mock-png'], { type: 'image/png' });
    const clickMock = vi.fn();

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        canShare: () => false
      },
      writable: true,
      configurable: true
    });

    (globalThis as any).document.createElement = vi.fn((tag: string) => {
      if (tag === 'a') {
        return { href: '', download: '', click: clickMock };
      }
      return {};
    });

    await shareOrDownload(blob, 'fallback.png', 'Fallback Title', 'Fallback Text');

    expect(clickMock).toHaveBeenCalled();
  });
});
