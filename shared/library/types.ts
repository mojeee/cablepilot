// Library data types. Symbols are data files under /library/symbols (graphics, connection points,
// function type); company symbols drawn in the in-app editor use the same format.

import type { El, LText } from '../model/types';

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

/**
 * A generic part (rule 9): what a device is made of in the BOM. Data under /library/parts, same
 * source rules as symbols. Never manufacturer catalogue data unless licensed.
 */
/** rail: on a DIN rail; plate: screwed to the plate; door: in the door; field: outside the cabinet; none: not a separate body (a module's capacitor, a cable). */
export type PartMount = 'rail' | 'plate' | 'door' | 'field' | 'none';
export const PART_MOUNTS: readonly PartMount[] = ['rail', 'plate', 'door', 'field', 'none'];
export interface PartDef {
  id: string;
  kind: 'part';
  title: LText & { en: string; it: string };
  category: string;
  /** Part code shown in the BOM (a generic code for built-in parts). */
  code: string;
  manufacturer: string;
  description: LText & { en: string; it: string };
  /** Electrical and other data as name and value, with the unit in the value ("16 A"). */
  data: Record<string, string>;
  /** Body size in millimetres, for the cabinet layout (M6). */
  dimensions?: { w: number; h: number; d: number };
  /** Where the part is mounted (cabinet layout); absent: the default of its category (shared/cabinet/size.ts). */
  mount?: PartMount;
  source: string;
  verification: 'primary' | 'secondary';
  verifiedFrom?: string;
}
export const PART_CATEGORIES = ['contactors', 'relays', 'breakers', 'motor-protection', 'terminals', 'plc', 'cables', 'enclosures', 'power-electronics', 'transformers', 'sensors', 'operator-devices', 'machines', 'connectors', 'hmi-network', 'accessories'] as const;

/** A macro: a group of symbols, boxes and wires saved to the (company) library and placed again. */
export interface MacroDef {
  id: string;
  kind: 'macro';
  title: LText & { en: string; it: string };
  category: string;
  source: string;
  verification: 'primary' | 'secondary';
  verifiedFrom?: string;
  /** Size of the group in millimetres. */
  size: { w: number; h: number };
  /** The elements, with coordinates relative to the group's top-left corner. */
  elements: El[];
}

export interface Library {
  symbols: Map<string, SymbolDef>;
  parts: Map<string, PartDef>;
}
export function makeLibrary(symbols: SymbolDef[], parts: PartDef[] = []): Library {
  return { symbols: new Map(symbols.map((s) => [s.id, s])), parts: new Map(parts.map((p) => [p.id, p])) };
}
/** The library plus the company symbols a project embeds (project symbols win). */
export function withProjectSymbols(lib: Library, embedded: SymbolDef[]): Library {
  if (embedded.length === 0) return lib;
  const m = new Map(lib.symbols);
  for (const s of embedded) m.set(s.id, s);
  return { ...lib, symbols: m };
}
/** A part by id: the project's embedded copy first, then the library. */
export function findPart(lib: Library, embedded: PartDef[], id: string): PartDef | undefined {
  return embedded.find((p) => p.id === id) ?? lib.parts.get(id);
}

/** What a symbol is within its device: the coil, a main contact or power part, or an auxiliary contact. */
export type Role = 'coil' | 'main' | 'aux';
export function symbolRole(def: SymbolDef | undefined): Role {
  if (!def) return 'main';
  if (def.function === 'coil') return 'coil';
  if (def.function === 'contact-no' || def.function === 'contact-nc') return 'aux';
  return 'main';
}

/** Parts that count once per terminal of a strip: terminal parts with a conductor cross-section (end plates and stops count once). */
export const isTerminalPart = (p: PartDef | undefined): boolean => !!p && p.category === 'terminals' && 'Conductor cross-section' in p.data;
