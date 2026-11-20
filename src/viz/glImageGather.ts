/**
 * WebGL2 Instanced Image Gather Animation:
 * - One instanced draw call (up to 65,536 instances) at 60 fps.
 * - Each instance has:
 *     attribute vec2 a_startWorldPos: digit position in the pi field (x, y)
 *     attribute vec2 a_endTargetPos: cell position in the gathered image (x, y)
 *     attribute float a_level: 0 to 9 quantized brightness
 *     attribute float a_rowIndex: row index for staggered delay
 * - Vertex shader mixes start to end using uniform float u_t (0.0 to 1.0) with per-row delay & ease-in-out.
 * - Fragment shader crossfades digit glyph into a flat grayscale square as t -> 1.0.
 * - Zero per-instance JavaScript during the animation.
 */

const GATHER_VERT = `#version 300 es
precision highp float;

// Unit quad (-0.5 to 0.5)
const vec2 QUAD[4] = vec2[4](
  vec2(-0.5, -0.5),
  vec2( 0.5, -0.5),
  vec2(-0.5,  0.5),
  vec2( 0.5,  0.5)
);

// Per-instance attributes
layout(location = 0) in vec2 a_startWorldPos;  // in field world units
layout(location = 1) in vec2 a_targetGrid;     // (col, row)
layout(location = 2) in float a_level;         // 0 to 9
layout(location = 3) in float a_rowIndex;      // 0 to height-1
layout(location = 4) in vec3 a_color;          // RGB color 0.0 to 1.0

uniform float u_t;               // 0.0 to 1.0
uniform float u_totalRows;       // image height
uniform vec2 u_viewportSize;     // in screen pixels
uniform vec2 u_cameraCenter;     // in field world units
uniform float u_cameraScale;     // pixels per world unit
uniform vec2 u_imageOrigin;      // in screen pixels
uniform float u_cellSize;        // size of image pixel cell in screen px (e.g. 3px)

out vec2 v_localUv;
out float v_level;
out float v_progress;
out vec3 v_color;

float easeInOutCubic(float t) {
  return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) * 0.5;
}

void main() {
  vec2 quadVertex = QUAD[gl_VertexID];
  v_localUv = quadVertex + 0.5; // 0 to 1
  v_level = a_level;
  v_color = a_color;

  // Staggered per-row delay: row delay up to 0.25 of total duration
  float rowDelay = (a_rowIndex / max(1.0, u_totalRows)) * 0.22;
  float localT = clamp((u_t - rowDelay) / (1.0 - 0.22), 0.0, 1.0);
  float easedT = easeInOutCubic(localT);
  v_progress = easedT;

  // Screen position at start: project field world pos to screen pixels
  vec2 startScreenPx = vec2(
    (a_startWorldPos.x + 0.5 - u_cameraCenter.x) * u_cameraScale + u_viewportSize.x * 0.5,
    (u_viewportSize.y * 0.5) - (a_startWorldPos.y + 0.5 - u_cameraCenter.y) * u_cameraScale
  );

  // Screen position at end: centered image target dynamically calculated from grid (col, row)
  vec2 endScreenPx = u_imageOrigin + (a_targetGrid + 0.5) * u_cellSize;

  // Current interpolated center
  vec2 currentCenterPx = mix(startScreenPx, endScreenPx, easedT);

  // Size in screen pixels (add 0.5px subpixel seam overlap to prevent background grid lines)
  float currentCellPx = mix(max(2.0, u_cameraScale), u_cellSize + 0.5, easedT);

  // Final screen pixel position of this quad vertex
  vec2 finalPx = currentCenterPx + quadVertex * currentCellPx;

  // Convert to clip space (-1 to 1)
  vec2 clipPos = (finalPx / u_viewportSize) * 2.0 - 1.0;
  clipPos.y = -clipPos.y; // flip Y for WebGL clip coordinates

  gl_Position = vec4(clipPos, 0.0, 1.0);
}
`;

const GATHER_FRAG = `#version 300 es
precision highp float;

in vec2 v_localUv;
in float v_level;
in float v_progress;
in vec3 v_color;

out vec4 fragColor;

const vec3 ACCENT_COLOR = vec3(1.0, 0.341, 0.133); // #FF5722

void main() {
  // Grayscale value (level 0 is dark 0.1, level 9 is bright 0.95)
  float gray = mix(0.10, 0.95, v_level / 9.0);
  vec3 grayColor = vec3(gray);

  // If color is present, blend to color; otherwise fallback to grayscale
  vec3 targetColor = (length(v_color) > 0.01) ? v_color : grayColor;

  // Color transition: start tinted in accent color (#FF5722) in the field, crossfade to target image color
  vec3 col = mix(ACCENT_COLOR, targetColor, smoothstep(0.15, 0.85, v_progress));

  fragColor = vec4(col, 1.0);
}
`;

export interface ImageGatherInstanceData {
  startPositions: Uint32Array; // digit indices in pi
  levels: Uint8Array;
  colors?: Uint8Array;
  width: number;
  height: number;
  startDigitIndex: number;
  endDigitIndex: number;
}

export class GlImageGather {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject | null = null;
  private instanceVbo: WebGLBuffer | null = null;

  private uTLoc: WebGLUniformLocation | null = null;
  private uTotalRowsLoc: WebGLUniformLocation | null = null;
  private uViewportSizeLoc: WebGLUniformLocation | null = null;
  private uCameraCenterLoc: WebGLUniformLocation | null = null;
  private uCameraScaleLoc: WebGLUniformLocation | null = null;
  private uImageOriginLoc: WebGLUniformLocation | null = null;
  private uCellSizeLoc: WebGLUniformLocation | null = null;

  private instanceCount = 0;
  private imageWidth = 0;
  private imageHeight = 0;
  private progress = 0; // 0.0 to 1.0
  private lastImageRect: { x: number; y: number; width: number; height: number } | null = null;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = this.createProgram(GATHER_VERT, GATHER_FRAG);
    this.lookupUniforms();
  }

  private createProgram(vSrc: string, fSrc: string): WebGLProgram {
    const gl = this.gl;
    const v = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(v, vSrc);
    gl.compileShader(v);

    const f = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(f, fSrc);
    gl.compileShader(f);

    const p = gl.createProgram()!;
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    return p;
  }

  private lookupUniforms() {
    const gl = this.gl;
    const p = this.program;
    this.uTLoc = gl.getUniformLocation(p, 'u_t');
    this.uTotalRowsLoc = gl.getUniformLocation(p, 'u_totalRows');
    this.uViewportSizeLoc = gl.getUniformLocation(p, 'u_viewportSize');
    this.uCameraCenterLoc = gl.getUniformLocation(p, 'u_cameraCenter');
    this.uCameraScaleLoc = gl.getUniformLocation(p, 'u_cameraScale');
    this.uImageOriginLoc = gl.getUniformLocation(p, 'u_imageOrigin');
    this.uCellSizeLoc = gl.getUniformLocation(p, 'u_cellSize');
  }

  public setData(data: ImageGatherInstanceData, viewportWidth?: number, viewportHeight?: number) {
    const gl = this.gl;
    this.instanceCount = data.startPositions.length;
    this.imageWidth = data.width;
    this.imageHeight = data.height;

    // Build instance attribute buffer
    // Layout per instance (9 floats = 36 bytes):
    // float startX, startY;  (location in field world coords, 1000 per row)
    // float col, row;        (target grid cell in image)
    // float level;
    // float rowIndex;
    // float colorR, colorG, colorB;
    const buffer = new Float32Array(this.instanceCount * 9);

    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    const cssW = (viewportWidth && viewportWidth > 0) ? (viewportWidth > 500 && dpr > 1 ? viewportWidth / dpr : viewportWidth) : 1200;
    const cssH = (viewportHeight && viewportHeight > 0) ? (viewportHeight > 500 && dpr > 1 ? viewportHeight / dpr : viewportHeight) : 800;
    const maxDimension = Math.min(cssW * 0.58, cssH * 0.58);
    const initialCellSize = Math.max(1.5, maxDimension / Math.max(data.width, data.height));
    const totalImgW = data.width * initialCellSize;
    const totalImgH = data.height * initialCellSize;

    this.lastImageRect = {
      x: (cssW - totalImgW) * 0.5,
      y: (cssH - totalImgH) * 0.46,
      width: totalImgW,
      height: totalImgH
    };

    for (let i = 0; i < this.instanceCount; i++) {
      const digitIdx = data.startPositions[i];
      const startX = digitIdx % 1000;
      const startY = Math.floor(digitIdx / 1000);

      const col = i % data.width;
      const row = Math.floor(i / data.width);

      const lvl = data.levels[i] ?? 0;

      const hasColors = Boolean(data.colors && data.colors.length >= (i + 1) * 3);
      const colorR = hasColors ? (data.colors![i * 3 + 0] / 255.0) : 0.0;
      const colorG = hasColors ? (data.colors![i * 3 + 1] / 255.0) : 0.0;
      const colorB = hasColors ? (data.colors![i * 3 + 2] / 255.0) : 0.0;

      const base = i * 9;
      buffer[base + 0] = startX;
      buffer[base + 1] = startY;
      buffer[base + 2] = col;
      buffer[base + 3] = row;
      buffer[base + 4] = lvl;
      buffer[base + 5] = row;
      buffer[base + 6] = colorR;
      buffer[base + 7] = colorG;
      buffer[base + 8] = colorB;
    }

    if (!this.vao) {
      this.vao = gl.createVertexArray();
    }
    gl.bindVertexArray(this.vao);

    if (!this.instanceVbo) {
      this.instanceVbo = gl.createBuffer();
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVbo);
    gl.bufferData(gl.ARRAY_BUFFER, buffer, gl.STATIC_DRAW);

    const stride = 9 * 4; // 36 bytes
    // location 0: vec2 startWorldPos
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(0, 1);

    // location 1: vec2 targetGrid (col, row)
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
    gl.vertexAttribDivisor(1, 1);

    // location 2: float level
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(2, 1);

    // location 3: float rowIndex
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 20);
    gl.vertexAttribDivisor(3, 1);

    // location 4: vec3 color
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 3, gl.FLOAT, false, stride, 24);
    gl.vertexAttribDivisor(4, 1);

    gl.bindVertexArray(null);
  }

  public setProgress(t: number) {
    this.progress = Math.max(0.0, Math.min(1.0, t));
  }

  public getProgress(): number {
    return this.progress;
  }

  public getImageRect(): { x: number; y: number; width: number; height: number } | null {
    return this.lastImageRect;
  }

  public hasData(): boolean {
    return this.instanceCount > 0;
  }

  public clear() {
    this.instanceCount = 0;
  }

  /**
   * One instanced draw call per frame: gl.drawArraysInstanced(TRIANGLE_STRIP, 0, 4, instanceCount)
   */
  public render(
    viewportWidth: number,
    viewportHeight: number,
    cameraX: number,
    cameraY: number,
    cameraScale: number
  ) {
    if (this.instanceCount === 0 || !this.vao) return;

    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    const canvas = gl.canvas as HTMLCanvasElement;
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas ? canvas.width / dpr : viewportWidth;
    const cssHeight = canvas ? canvas.height / dpr : viewportHeight;

    const maxDimension = Math.min(cssWidth * 0.58, cssHeight * 0.58);
    const cellSize = Math.max(1.5, maxDimension / Math.max(this.imageWidth, this.imageHeight));
    const totalImgW = this.imageWidth * cellSize;
    const totalImgH = this.imageHeight * cellSize;

    const imgOriginX = (cssWidth - totalImgW) * 0.5;
    const imgOriginY = (cssHeight - totalImgH) * 0.46; // centered slightly above midpoint

    this.lastImageRect = {
      x: imgOriginX,
      y: imgOriginY,
      width: totalImgW,
      height: totalImgH
    };

    gl.uniform1f(this.uTLoc, this.progress);
    gl.uniform1f(this.uTotalRowsLoc, this.imageHeight);
    gl.uniform2f(this.uViewportSizeLoc, cssWidth, cssHeight);
    gl.uniform2f(this.uCameraCenterLoc, cameraX, cameraY);
    gl.uniform1f(this.uCameraScaleLoc, cameraScale);
    gl.uniform2f(this.uImageOriginLoc, imgOriginX, imgOriginY);
    gl.uniform1f(this.uCellSizeLoc, cellSize);

    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.instanceCount);
    gl.bindVertexArray(null);
  }
}
