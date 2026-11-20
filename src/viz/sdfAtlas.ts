/**
 * Generates an exact Signed Distance Field (SDF) texture for digits 0-9
 * in JetBrains Mono font.
 * Uses the linear-time Felzenszwalb-Huttenlocher distance transform.
 */

export interface SdfAtlas {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  glyphWidth: number;
  glyphHeight: number;
}

// 1D squared distance transform (Felzenszwalb & Huttenlocher)
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;

  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }

  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) {
      k++;
    }
    const dist = q - v[k];
    d[q] = dist * dist + f[v[k]];
  }
}

// 2D distance transform
function edt2d(grid: Float64Array, width: number, height: number): Float64Array {
  const output = new Float64Array(width * height);
  const maxDim = Math.max(width, height);
  const f = new Float64Array(maxDim);
  const d = new Float64Array(maxDim);
  const v = new Int32Array(maxDim);
  const z = new Float64Array(maxDim + 1);

  // Transform along columns
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      f[y] = grid[y * width + x];
    }
    edt1d(f, height, d, v, z);
    for (let y = 0; y < height; y++) {
      output[y * width + x] = d[y];
    }
  }

  // Transform along rows
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      f[x] = output[y * width + x];
    }
    edt1d(f, width, d, v, z);
    for (let x = 0; x < width; x++) {
      output[y * width + x] = d[x];
    }
  }

  return output;
}

export function generateDigitSdfAtlas(glyphSize = 64, radius = 12): SdfAtlas {
  const glyphCount = 10;
  const atlasWidth = glyphSize * glyphCount;
  const atlasHeight = glyphSize;

  // 1. Render black-and-white mask of digits 0-9
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = atlasWidth;
  maskCanvas.height = atlasHeight;
  const ctx = maskCanvas.getContext('2d', { willReadFrequently: true })!;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, atlasWidth, atlasHeight);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold ${Math.round(glyphSize * 0.72)}px "JetBrains Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < 10; i++) {
    const cx = i * glyphSize + glyphSize / 2;
    const cy = glyphSize / 2;
    ctx.fillText(i.toString(), cx, cy);
  }

  const imgData = ctx.getImageData(0, 0, atlasWidth, atlasHeight);
  const totalPixels = atlasWidth * atlasHeight;

  // 2. Prepare inside and outside distance grids
  const INF = 1e8;
  const gridInside = new Float64Array(totalPixels);
  const gridOutside = new Float64Array(totalPixels);

  for (let i = 0; i < totalPixels; i++) {
    const val = imgData.data[i * 4]; // 0 or 255 (or intermediate antialiased)
    if (val > 127) {
      gridInside[i] = 0;
      gridOutside[i] = INF;
    } else {
      gridInside[i] = INF;
      gridOutside[i] = 0;
    }
  }

  // 3. Compute 2D distance fields
  const distInside = edt2d(gridInside, atlasWidth, atlasHeight);
  const distOutside = edt2d(gridOutside, atlasWidth, atlasHeight);

  // 4. Combine into Signed Distance Field normalized to [0, 255]
  // 128 is the boundary (distance = 0)
  const atlasCanvas = document.createElement('canvas');
  atlasCanvas.width = atlasWidth;
  atlasCanvas.height = atlasHeight;
  const atlasCtx = atlasCanvas.getContext('2d')!;
  const atlasImgData = atlasCtx.createImageData(atlasWidth, atlasHeight);

  for (let i = 0; i < totalPixels; i++) {
    const dIn = Math.sqrt(distInside[i]);
    const dOut = Math.sqrt(distOutside[i]);
    // Negative inside, positive outside -> map to 0..255 with 128 = contour
    const dist = dOut - dIn;
    // Normalized signed distance: dist = 0 -> 0.5 (128)
    const norm = 0.5 - (dist / (2.0 * radius));
    const clamped = Math.max(0, Math.min(255, Math.round(norm * 255)));

    const p = i * 4;
    atlasImgData.data[p] = clamped;
    atlasImgData.data[p + 1] = clamped;
    atlasImgData.data[p + 2] = clamped;
    atlasImgData.data[p + 3] = 255;
  }

  atlasCtx.putImageData(atlasImgData, 0, 0);

  return {
    canvas: atlasCanvas,
    width: atlasWidth,
    height: atlasHeight,
    glyphWidth: glyphSize,
    glyphHeight: glyphSize
  };
}
