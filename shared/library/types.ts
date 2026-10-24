// Library data types. Symbols are data files under /library/symbols (graphics, connection points,
// function type); company symbols drawn in the in-app editor use the same format.

import type { LText } from '../model/types';

/** Symbol graphics in symbol-local millimetres, y down, origin at the symbol's anchor point. */
export type Gfx =
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; dash?: boolean }
  | { t: 'poly'; pts: number[]; closed?: boolean; fill?: boolean; dash?: boolean }
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill?: boolean }
  | { t: 'circle'; cx: number; cy: number; r: number; fill?: boolean }
  /** Clockwise on screen, angles in degrees from the +x axis. */
  | { t: 'arc'; cx: number; cy: number; r: number; a0: number; a1: number }
  /** The text "{value}" is replaced by the element's value (a PLC address, a rating). */
  | { t: 'text'; x: number; y: number; text: string; size: number; anchor?: 'start' | 'middle' | 'end' };

export interface PinDef {
  id: string;
  x: number;
  y: number;
  /** The direction a wire leaves the pin. */
  dir: 'up' | 'down' | 'left' | 'right';
}

export interface SymbolDef {
  id: string;
  kind: 'symbol';
  title: LText & { en: string; it: string };
  category: string;
  /** What the symbol does: coil, contact-no, contact-nc, motor, fuse, terminal... */
  function: string;
  /** IEC 81346-2 letter code for the designation; empty for symbols that carry none. */
  designationLetter?: string;
  /** false: the designation is typed by hand (contacts take the designation of their coil). */
  autoNumber?: boolean;
  source: string;
  verification: 'primary' | 'secondary';
  verifiedFrom?: string;
  pins: PinDef[];
  graphics: Gfx[];
  /** Where the designation text sits, in local millimetres. */
  label?: { x: number; y: number };
  /** Alternative graphics under NFPA 79 / ANSI (same pins). */
  nfpa?: { source: string; graphics: Gfx[] };
}

export const SYMBOL_CATEGORIES = ['power', 'switching', 'protection', 'contacts', 'coils', 'machines', 'signalling', 'sources', 'electronics', 'terminals', 'plc', 'potentials'] as const;
export type SymbolCategory = (typeof SYMBOL_CATEGORIES)[number];

export interface Library {
  symbols: Map<string, SymbolDef>;
}
export function makeLibrary(symbols: SymbolDef[]): Library {
  return { symbols: new Map(symbols.map((s) => [s.id, s])) };
}
/** The library plus the company symbols a project embeds (project symbols win). */
export function withProjectSymbols(lib: Library, embedded: SymbolDef[]): Library {
  if (embedded.length === 0) return lib;
  const m = new Map(lib.symbols);
  for (const s of embedded) m.set(s.id, s);
  return { symbols: m };
}
