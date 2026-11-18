import { N } from '../../shared/engine';

export const INK = '#1f2a44';
export const CS = 20; // size of one board cell in SVG units

export const COLONY_COLORS: Record<string, string> = {
  A: '#9ad9d2',
  B: '#c9a8f0',
  C: '#f6b8a8',
  D: '#a9d3f5',
  E: '#f5c6e2',
  F: '#e9d9b0',
  me: '#ffd166',
};
export const COLONY_NAMES: Record<string, string> = { A: 'teal', B: 'violet', C: 'salmon', D: 'blue', E: 'pink', F: 'sand' };
export const SICK_COLOR = '#b6dc6a';

export type View = { x: number; y: number; w: number; h: number };
export const FULL_VIEW: View = { x: 0, y: 0, w: N * CS, h: N * CS };
