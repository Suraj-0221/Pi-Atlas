/**
 * Color system: Terracotta accent, muted 10-step earth tone ramp,
 * chromatic sand-clay-umber ramp for name walks.
 */

export interface ColorRGB {
  r: number;
  g: number;
  b: number;
  hex: string;
}

// 10-colour ramp specified for pi digits overview & region
export const DIGIT_COLORS: ColorRGB[] = [
  { r: 0x34, g: 0x31, b: 0x2c, hex: '#34312C' }, // 0: Charcoal
  { r: 0x7a, g: 0x4e, b: 0x36, hex: '#7A4E36' }, // 1: Umber
  { r: 0xb9, g: 0x8a, b: 0x5e, hex: '#B98A5E' }, // 2: Clay
  { r: 0xe0, g: 0xc9, b: 0xa0, hex: '#E0C9A0' }, // 3: Sand
  { r: 0xd9, g: 0xa4, b: 0x41, hex: '#D9A441' }, // 4: Ochre
  { r: 0x8e, g: 0x9b, b: 0x6b, hex: '#8E9B6B' }, // 5: Moss
  { r: 0x4f, g: 0x6b, b: 0x5b, hex: '#4F6B5B' }, // 6: Pine
  { r: 0x7c, g: 0x94, b: 0xa6, hex: '#7C94A6' }, // 7: Mineral Blue
  { r: 0x3f, g: 0x5a, b: 0x73, hex: '#3F5A73' }, // 8: Navy
  { r: 0xa8, g: 0xa3, b: 0x9a, hex: '#A8A39A' }  // 9: Gray
];

// Single accent: Terracotta
export const ACCENT_TERRACOTTA: ColorRGB = {
  r: 201,
  g: 100,
  b: 66,
  hex: '#C96442'
};

export const ACCENT_TERRACOTTA_HOVER: ColorRGB = {
  r: 181,
  g: 88,
  b: 58,
  hex: '#B5583A'
};

// Chromatic path colors (sand -> clay -> umber) for Name Walks
export const PATH_COLORS = [
  '#D1CCBF', // Sand
  '#C4BEAF',
  '#B7B0A0', // Clay
  '#9E9786',
  '#888272', // Umber
  '#706B5D'  // Deep Umber
];

export const PAPER_BG = '#F5F4EE';
export const SURFACE_BG = '#FAF9F5';
export const BORDER_COLOR = '#E3E0D5';
export const BORDER_SUBTLE = '#ECEAE2';
export const TEXT_PRIMARY = '#1F1E1D';
export const TEXT_SECONDARY = '#6B6860';
export const TEXT_DIMMED = 'rgba(31, 30, 29, 0.55)';
