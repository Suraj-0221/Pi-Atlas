/**
 * WebGL2 GPU Digit Field:
 * - One fullscreen quad, one draw call per frame.
 * - 10M digits uploaded once as an R8UI texture (4096 x 2442).
 * - Row-major layout with 1000 digits per world row.
 * - Semantic zoom in fragment shader:
 *     cell < 1.5px: flat colour from 10-colour ramp, nearest sampling.
 *     1.5px to 14px: coloured cells with 1px gutter.
 *     > 14px: JetBrains Mono SDF glyphs crossfaded via smoothstep, grouped in blocks of 10.
 * - Highlights passed as uniform arrays (start, len, tint).
 * - Zero JS allocations during frame rendering.
 */

import { generateDigitSdfAtlas, SdfAtlas } from './sdfAtlas.ts';

export interface GlHighlight {
  startIndex: number;
  length: number;
  tint: [number, number, number, number]; // r, g, b, a
}

const VERT_SHADER = `#version 300 es
precision highp float;

// Fullscreen quad positions (-1 to +1)
const vec2 POSITIONS[4] = vec2[4](
  vec2(-1.0, -1.0),
  vec2( 1.0, -1.0),
  vec2(-1.0,  1.0),
  vec2( 1.0,  1.0)
);

out vec2 v_screenCoord;

void main() {
  vec2 pos = POSITIONS[gl_VertexID];
  gl_Position = vec4(pos, 0.0, 1.0);
  v_screenCoord = pos; // -1 to 1
}
`;

const FRAG_SHADER = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

in vec2 v_screenCoord;
out vec4 fragColor;

// Uniforms
uniform vec2 u_viewportSize;      // In physical pixels (e.g. width, height)
uniform vec2 u_cameraCenter;      // World coordinates of camera center (in digits)
uniform float u_cameraScale;       // Pixels per digit (zoom)
uniform float u_dim;              // 0.0 to 1.0 field dim towards paper color (Task 5c)

uniform usampler2D u_digitTexture; // 4096 x 2442 R8UI texture
uniform sampler2D u_sdfAtlas;      // 10-glyph SDF texture (640 x 64)

// Highlights (up to 16)
uniform int u_highlightCount;
uniform int u_hlStart[16];
uniform int u_hlLen[16];
uniform vec4 u_hlTint[16];

// 10-color non-orange palette (#34312C, #7A4E36, #B98A5E, #E0C9A0, #D9A441, #8E9B6B, #4F6B5B, #7C94A6, #3F5A73, #A8A39A)
const vec3 COLOR_RAMP[10] = vec3[10](
  vec3(0.204, 0.192, 0.173), // 0: Charcoal #34312C
  vec3(0.478, 0.306, 0.212), // 1: Umber #7A4E36
  vec3(0.725, 0.541, 0.369), // 2: Clay #B98A5E
  vec3(0.878, 0.788, 0.627), // 3: Sand #E0C9A0
  vec3(0.851, 0.643, 0.255), // 4: Ochre #D9A441
  vec3(0.557, 0.608, 0.420), // 5: Moss #8E9B6B
  vec3(0.310, 0.420, 0.357), // 6: Pine #4F6B5B
  vec3(0.486, 0.580, 0.651), // 7: Mineral Blue #7C94A6
  vec3(0.247, 0.353, 0.451), // 8: Navy #3F5A73
  vec3(0.659, 0.639, 0.604)  // 9: Gray #A8A39A
);

const vec3 BG_COLOR = vec3(0.980, 0.976, 0.961);   // #FAF9F5
const vec3 PAPER_COLOR = vec3(0.961, 0.957, 0.933); // #F5F4EE (Task 5c)
const vec3 INK_COLOR = vec3(0.122, 0.118, 0.114);  // #1F1E1D
const vec3 GUTTER_COLOR = vec3(0.930, 0.920, 0.900); // Subtle grid line
const vec3 GROUP_LINE = vec3(0.820, 0.810, 0.790);   // 10-digit block line

void main() {
  // Screen pixel from bottom-left (0 to width, 0 to height)
  vec2 screenPx = (v_screenCoord * 0.5 + 0.5) * u_viewportSize;

  // Invert Y so world (0,0) is top-left
  vec2 offsetFromCenterPx = vec2(screenPx.x - u_viewportSize.x * 0.5, (u_viewportSize.y * 0.5) - screenPx.y);

  // World coordinates (1 digit = 1.0 world units)
  vec2 worldPos = (offsetFromCenterPx / u_cameraScale) + u_cameraCenter;

  int worldX = int(floor(worldPos.x));
  int worldY = int(floor(worldPos.y));

  // 1000 digits per world row, 10,000 rows (10M digits)
  if (worldX < 0 || worldX >= 1000 || worldY < 0 || worldY >= 10000) {
    vec3 col = BG_COLOR;
    if (u_dim > 0.0) col = mix(col, PAPER_COLOR, clamp(u_dim, 0.0, 1.0));
    fragColor = vec4(col, 1.0);
    return;
  }

  int digitIndex = worldY * 1000 + worldX;
  if (digitIndex >= 10000000) {
    vec3 col = BG_COLOR;
    if (u_dim > 0.0) col = mix(col, PAPER_COLOR, clamp(u_dim, 0.0, 1.0));
    fragColor = vec4(col, 1.0);
    return;
  }

  // Fetch integer digit (0-9) from R8UI texture (4096 texels wide)
  int texU = digitIndex % 4096;
  int texV = digitIndex / 4096;
  uint digit = texelFetch(u_digitTexture, ivec2(texU, texV), 0).r;
  int d = int(digit % 10u);

  // Base cell color
  vec3 cellColor = COLOR_RAMP[d];

  // Check highlights
  vec4 highlightTint = vec4(0.0);
  for (int i = 0; i < 16; i++) {
    if (i >= u_highlightCount) break;
    int hStart = u_hlStart[i];
    int hEnd = hStart + u_hlLen[i];
    if (digitIndex >= hStart && digitIndex < hEnd) {
      highlightTint = u_hlTint[i];
      break;
    }
  }

  // Fraction inside the current digit cell (0.0 to 1.0)
  vec2 cellFrac = fract(worldPos);

  // ----------------------------------------------------
  // SEMANTIC ZOOM LEVEL
  // ----------------------------------------------------
  vec3 finalColor = cellColor;

  // Level 1: cell < 1.5 px (Overview mode: flat colour, nearest sampling, no averaging)
  if (u_cameraScale < 1.5) {
    if (highlightTint.a > 0.0) {
      finalColor = mix(finalColor, highlightTint.rgb, highlightTint.a);
    }
  } else if (u_cameraScale <= 14.0) {
    // Level 2: 1.5 px to 14 px (Coloured cells with a 1px gutter)
    vec2 pixelInCell = cellFrac * u_cameraScale;
    bool isGutter = (pixelInCell.x < 1.0) || (pixelInCell.y < 1.0);

    finalColor = isGutter ? GUTTER_COLOR : cellColor;
    if (highlightTint.a > 0.0 && !isGutter) {
      finalColor = mix(finalColor, highlightTint.rgb, highlightTint.a);
    }
  } else {
    // Level 3: above 14 px (Digit glyph from 10-glyph SDF atlas, grouped in 10s with separators)
    vec3 cellBg = BG_COLOR;
    if (highlightTint.a > 0.0) {
      cellBg = mix(BG_COLOR, highlightTint.rgb, highlightTint.a * 0.35);
    }

    vec2 pxInCell = cellFrac * u_cameraScale;
    bool isBlockSep = (worldX % 10 == 9) && (pxInCell.x >= u_cameraScale - 1.5);
    bool isBottomLine = (pxInCell.y >= u_cameraScale - 1.0);

    vec3 baseBg = isBlockSep ? GROUP_LINE : (isBottomLine ? GUTTER_COLOR : cellBg);

    float uMin = float(d) / 10.0;
    float uWidth = 1.0 / 10.0;

    float padX = 0.12;
    float padY = 0.12;
    vec2 glyphBox = (cellFrac - vec2(padX, padY)) / vec2(1.0 - 2.0 * padX, 1.0 - 2.0 * padY);

    finalColor = baseBg;

    if (glyphBox.x >= 0.0 && glyphBox.x <= 1.0 && glyphBox.y >= 0.0 && glyphBox.y <= 1.0) {
      vec2 atlasUv = vec2(uMin + glyphBox.x * uWidth, glyphBox.y);
      float sdfDist = texture(u_sdfAtlas, atlasUv).r;

      float screenPxRange = 2.0 / u_cameraScale;
      float alpha = smoothstep(0.5 - screenPxRange, 0.5 + screenPxRange, sdfDist);

      float zoomFade = smoothstep(14.0, 20.0, u_cameraScale);

      vec3 textInk = (highlightTint.a > 0.0) ? highlightTint.rgb : INK_COLOR;
      finalColor = mix(baseBg, textInk, alpha * zoomFade);
    }
  }

  // Multiply toward paper color by u_dim (Task 5c)
  if (u_dim > 0.0) {
    finalColor = mix(finalColor, PAPER_COLOR, clamp(u_dim, 0.0, 1.0));
  }

  fragColor = vec4(finalColor, 1.0);
}
`;

export class GlField {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;

  // Textures
  private digitTexture: WebGLTexture;
  private sdfTexture: WebGLTexture;

  // Uniform locations
  private uViewportSizeLoc: WebGLUniformLocation | null = null;
  private uCameraCenterLoc: WebGLUniformLocation | null = null;
  private uCameraScaleLoc: WebGLUniformLocation | null = null;
  private uDigitTextureLoc: WebGLUniformLocation | null = null;
  private uSdfAtlasLoc: WebGLUniformLocation | null = null;
  private uHighlightCountLoc: WebGLUniformLocation | null = null;
  private uHlStartLoc: WebGLUniformLocation | null = null;
  private uHlLenLoc: WebGLUniformLocation | null = null;
  private uHlTintLoc: WebGLUniformLocation | null = null;
  private uDimLoc: WebGLUniformLocation | null = null;

  // State
  private cameraX = 500.0;
  private cameraY = 5000.0;
  private cameraScale = 0.09; // overview scale
  private dimAmount = 0.0;
  private highlights: GlHighlight[] = [];

  // Reusable typed arrays for uniforms to avoid per-frame allocations
  private hlStarts = new Int32Array(16);
  private hlLens = new Int32Array(16);
  private hlTints = new Float32Array(64); // 16 * 4

  private vao: WebGLVertexArrayObject | null = null;

  constructor(canvas: HTMLCanvasElement, piDigits: Uint8Array) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance'
    });

    if (!gl) {
      throw new Error('WebGL2 is not supported on this device/browser.');
    }
    this.gl = gl;

    // 1. Compile Shaders & Link Program
    this.program = this.createProgram(VERT_SHADER, FRAG_SHADER);
    this.lookupUniforms();

    // 2. Setup Fullscreen Quad VAO
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    // 3. Upload 10M Digits as R8UI Texture (4096 x 2442)
    this.digitTexture = this.createDigitTexture(piDigits);

    // 4. Generate & Upload SDF Atlas for 0-9
    const sdfAtlas = generateDigitSdfAtlas(64, 12);
    this.sdfTexture = this.createSdfTexture(sdfAtlas);
  }

  private createProgram(vertSrc: string, fragSrc: string): WebGLProgram {
    const gl = this.gl;
    const vert = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vert, vertSrc);
    gl.compileShader(vert);
    if (!gl.getShaderParameter(vert, gl.COMPILE_STATUS)) {
      throw new Error(`Vert shader error: ${gl.getShaderInfoLog(vert)}`);
    }

    const frag = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(frag, fragSrc);
    gl.compileShader(frag);
    if (!gl.getShaderParameter(frag, gl.COMPILE_STATUS)) {
      throw new Error(`Frag shader error: ${gl.getShaderInfoLog(frag)}`);
    }

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`Program link error: ${gl.getProgramInfoLog(prog)}`);
    }

    return prog;
  }

  private lookupUniforms() {
    const gl = this.gl;
    const p = this.program;
    this.uViewportSizeLoc = gl.getUniformLocation(p, 'u_viewportSize');
    this.uCameraCenterLoc = gl.getUniformLocation(p, 'u_cameraCenter');
    this.uCameraScaleLoc = gl.getUniformLocation(p, 'u_cameraScale');
    this.uDigitTextureLoc = gl.getUniformLocation(p, 'u_digitTexture');
    this.uSdfAtlasLoc = gl.getUniformLocation(p, 'u_sdfAtlas');
    this.uHighlightCountLoc = gl.getUniformLocation(p, 'u_highlightCount');
    this.uHlStartLoc = gl.getUniformLocation(p, 'u_hlStart');
    this.uHlLenLoc = gl.getUniformLocation(p, 'u_hlLen');
    this.uHlTintLoc = gl.getUniformLocation(p, 'u_hlTint');
    this.uDimLoc = gl.getUniformLocation(p, 'u_dim');
  }

  public setDim(amount: number) {
    this.dimAmount = Math.max(0.0, Math.min(1.0, amount));
  }

  public getDim(): number {
    return this.dimAmount;
  }

  private createDigitTexture(piDigits: Uint8Array): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);

    const width = 4096;
    const height = 2442;
    // Total texels = 10,002,432 >= 10,000,000
    const texData = new Uint8Array(width * height);
    texData.set(piDigits.subarray(0, Math.min(piDigits.length, width * height)));

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8UI,
      width,
      height,
      0,
      gl.RED_INTEGER,
      gl.UNSIGNED_BYTE,
      texData
    );

    // Nearest filtering: exact integer texel fetch
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    return tex;
  }

  public updateDigitTexture(piDigits: Uint8Array) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.digitTexture);
    const width = 4096;
    const height = 2442;
    const texData = new Uint8Array(width * height);
    texData.set(piDigits.subarray(0, Math.min(piDigits.length, width * height)));

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      width,
      height,
      gl.RED_INTEGER,
      gl.UNSIGNED_BYTE,
      texData
    );
  }

  private createSdfTexture(atlas: SdfAtlas): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);

    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      atlas.width,
      atlas.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      atlas.canvas
    );

    // Linear filtering for smooth SDF interpolation
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    return tex;
  }

  public setCamera(x: number, y: number, scale: number) {
    this.cameraX = x;
    this.cameraY = y;
    this.cameraScale = scale;
  }

  public setHighlights(highlights: GlHighlight[]) {
    this.highlights = highlights.slice(0, 16);
  }

  /**
   * Single draw call per frame. Zero JavaScript allocations.
   */
  public render() {
    const gl = this.gl;

    const width = this.canvas.width;
    const height = this.canvas.height;
    gl.viewport(0, 0, width, height);

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = width / dpr;
    const cssHeight = height / dpr;

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    // Set camera uniforms (viewport size in CSS pixels)
    gl.uniform2f(this.uViewportSizeLoc, cssWidth, cssHeight);
    gl.uniform2f(this.uCameraCenterLoc, this.cameraX, this.cameraY);
    gl.uniform1f(this.uCameraScaleLoc, this.cameraScale);
    gl.uniform1f(this.uDimLoc, this.dimAmount);

    // Bind texture unit 0: Digits
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.digitTexture);
    gl.uniform1i(this.uDigitTextureLoc, 0);

    // Bind texture unit 1: SDF Atlas
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.sdfTexture);
    gl.uniform1i(this.uSdfAtlasLoc, 1);

    // Set highlights into reusable arrays
    const count = Math.min(16, this.highlights.length);
    gl.uniform1i(this.uHighlightCountLoc, count);

    for (let i = 0; i < count; i++) {
      const hl = this.highlights[i];
      this.hlStarts[i] = hl.startIndex;
      this.hlLens[i] = hl.length;
      const tIdx = i * 4;
      this.hlTints[tIdx] = hl.tint[0];
      this.hlTints[tIdx + 1] = hl.tint[1];
      this.hlTints[tIdx + 2] = hl.tint[2];
      this.hlTints[tIdx + 3] = hl.tint[3];
    }

    if (count > 0) {
      gl.uniform1iv(this.uHlStartLoc, this.hlStarts);
      gl.uniform1iv(this.uHlLenLoc, this.hlLens);
      gl.uniform4fv(this.uHlTintLoc, this.hlTints);
    }

    // Single draw call: 1 fullscreen quad (TRIANGLE_STRIP, 4 vertices)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  public resize(width: number, height: number) {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
  }

  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }
}
