// What the cabinet needs to place: the devices of the schematic that sit in the cabinet, their body size
// (from the part's dimensions, rule 1: the size is never typed twice), where they are mounted and how
// they group by function. Pure; built from the device index and the BOM data.

import { deviceIndex, type Device } from '../devices';
import { findPart, withProjectSymbols, type Library, type PartDef, type PartMount } from '../library/types';
import type { Project } from '../model/types';

/** Default mounting by part category when a part does not say (`mount` in its file). Plate: screwed to the plate; none: not a body of its own. */
export const CATEGORY_MOUNT: Record<string, PartMount> = {
  contactors: 'rail', relays: 'rail', breakers: 'rail', 'motor-protection': 'rail', terminals: 'rail', plc: 'rail', 'hmi-network': 'rail',
  'power-electronics': 'plate', transformers: 'plate', sensors: 'field', 'operator-devices': 'door', machines: 'field',
  connectors: 'none', cables: 'none', enclosures: 'none', accessories: 'none',
};
export const partMount = (p: PartDef): PartMount => p.mount ?? CATEGORY_MOUNT[p.category] ?? 'plate';

/** The body of a part when it has no dimensions: a generic module, flagged as assumed (the user sets the real size). */
export const DEFAULT_BODY = { w: 45, h: 90, d: 60 };

export type LayoutGroup = 'power' | 'heavy' | 'control' | 'terminals' | 'door';
export interface CabDevice {
  key: string;
  mount: 'rail' | 'plate' | 'door';
  group: LayoutGroup;
  w: number;
  h: number;
  d: number;
  part?: PartDef;
  /** The part has no dimensions: the default module size is used. */
  assumed: boolean;
  /** Reading order in the schematic: page, then y, then x. */
  order: [number, number, number];
  /** The part's mounting height and depth are those of one terminal; terminals counts the strip. */
  terminals: number;
}

/** Width of the end stops of a terminal strip, one on each side (to verify with the part). */
const STRIP_ENDS = 16;

function groupOf(part: PartDef | undefined, mount: 'rail' | 'plate' | 'door'): LayoutGroup {
  if (mount === 'door') return 'door';
  const c = part?.category ?? '';
  if (c === 'terminals') return 'terminals';
  if (mount === 'plate') return 'heavy';
  if (c === 'breakers' || c === 'motor-protection' || c === 'contactors' || c === 'power-electronics' || c === 'transformers') return 'power';
  return 'control';
}

/** The device's cabinet body, or undefined when it is not in the cabinet (no part, a field device, a module's own sub-part). */
export function cabDevice(project: Project, lib: Library, d: Device): CabDevice | undefined {
  const syms = withProjectSymbols(lib, project.symbols).symbols;
  const parts = (d.rec?.parts ?? []).map((u) => findPart(lib, project.parts, u.part)).filter((p): p is PartDef => !!p);
  const part = parts.find((p) => partMount(p) !== 'none');
  if (!part) return undefined;
  const mount = partMount(part);
  if (mount === 'field' || mount === 'none') return undefined;
  const terminals = d.reps.filter((r) => r.symbolId && syms.get(r.symbolId)?.function === 'terminal').length;
  const dim = part.dimensions;
  const base = dim ?? DEFAULT_BODY;
  const w = terminals > 0 ? Math.max(base.w * terminals + STRIP_ENDS, 20) : base.w;
  const first = d.reps.slice().sort((a, b) => a.pageIndex - b.pageIndex || a.y - b.y || a.x - b.x)[0];
  return { key: d.key, mount, group: groupOf(part, mount), w, h: base.h, d: base.d, part, assumed: !dim, order: first ? [first.pageIndex, first.y, first.x] : [1e9, 0, 0], terminals };
}

/** Every device of the project that belongs in the cabinet, in schematic order. */
export function cabinetDevices(project: Project, lib: Library): CabDevice[] {
  const out: CabDevice[] = [];
  for (const d of deviceIndex(project, lib).devices) {
    const c = cabDevice(project, lib, d);
    if (c) out.push(c);
  }
  return out.sort((a, b) => a.order[0] - b.order[0] || a.order[1] - b.order[1] || a.order[2] - b.order[2] || a.key.localeCompare(b.key, 'en', { numeric: true }));
}

/** Wire outer diameter in millimetres by conductor cross-section (mm²), insulated flexible single-core wire. Typical catalogue values: unverified (docs/to-verify.md). */
export const WIRE_DIAMETER: [number, number][] = [[0.5, 2.1], [0.75, 2.4], [1, 2.6], [1.5, 3], [2.5, 3.6], [4, 4.2], [6, 4.8], [10, 6.4], [16, 7.8], [25, 9.8], [35, 11.2], [50, 13.4]];
/** Outer diameter of a wire of a given cross-section: the next size up in the table, the largest beyond it. */
export function wireDiameter(xs: number): number {
  if (!Number.isFinite(xs) || xs <= 0) return WIRE_DIAMETER[3][1];
  for (const [x, d] of WIRE_DIAMETER) if (xs <= x + 1e-9) return d;
  return WIRE_DIAMETER[WIRE_DIAMETER.length - 1][1];
}
