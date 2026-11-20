/**
 * Procedural sample image generator for Image in π (Task 2d)
 * Generates 96x96 binary/grayscale canvases for:
 * - "π symbol"
 * - "Heart"
 * - "Smile"
 * Returns an ArrayBuffer containing RGBA pixels.
 */

export function generateProceduralImageBuffer(
  type: 'pi' | 'heart' | 'smile',
  size = 96
): { rgbaBuffer: ArrayBuffer; width: number; height: number } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // 1. Fill clean white paper background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, size, size);

  // 2. Render figures with vibrant colors
  if (type === 'pi') {
    ctx.fillStyle = '#D32F2F';
    ctx.font = `bold ${Math.round(size * 0.72)}px "Newsreader", Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('π', size / 2, size / 2 + size * 0.04);
  } else if (type === 'heart') {
    const cx = size / 2;
    const cy = size / 2 - size * 0.08;
    const s = size / 32;

    ctx.fillStyle = '#E53935';
    ctx.beginPath();
    ctx.moveTo(cx, cy + 5 * s);
    ctx.bezierCurveTo(cx - 12 * s, cy - 8 * s, cx - 14 * s, cy + 4 * s, cx, cy + 14 * s);
    ctx.bezierCurveTo(cx + 14 * s, cy + 4 * s, cx + 12 * s, cy - 8 * s, cx, cy + 5 * s);
    ctx.fill();
  } else if (type === 'smile') {
    const cx = size / 2;
    const cy = size / 2;
    const r = size * 0.36;

    // Face circle in warm sunny yellow
    ctx.fillStyle = '#FDD835';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Border & features in dark ink
    ctx.strokeStyle = '#1F1E1D';
    ctx.fillStyle = '#1F1E1D';
    ctx.lineWidth = Math.max(2.5, size * 0.05);
    ctx.stroke();

    // Eyes
    const eyeR = size * 0.055;
    ctx.beginPath();
    ctx.arc(cx - r * 0.4, cy - r * 0.22, eyeR, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.4, cy - r * 0.22, eyeR, 0, Math.PI * 2);
    ctx.fill();

    // Smile arc
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.52, 0.22 * Math.PI, 0.78 * Math.PI, false);
    ctx.stroke();
  }

  const imageData = ctx.getImageData(0, 0, size, size);
  const rgbaBuffer = imageData.data.buffer.slice(
    imageData.data.byteOffset,
    imageData.data.byteOffset + imageData.data.byteLength
  );

  return { rgbaBuffer, width: size, height: size };
}
