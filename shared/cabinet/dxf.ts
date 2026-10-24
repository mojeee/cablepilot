// DXF of the cabinet layout (M6 part 3): the 2D views at real size with one layer per kind of item, and the
// mounting-plate drawing for drilling (plate outline and the fixing holes of rails, ducts and plate-mounted
// devices). Hole sizes and spacings are generic company assumptions (docs/to-verify.md): check them against
// the rail, duct and device data sheets before drilling.

import { buildPage } from '../draw/page';
import type { Prim } from '../draw/primitives';
import { writeDxf } from '../export/dxf';
import type { Library } from '../library/types';
import type { CabEl, Page, Project } from '../model/types';
import { cabinetOf, isCab, isLayoutPage } from './model';
import { transformPrims } from './draw';
import { mountOfDevice } from './place';

/** Fixing hole diameter in millimetres (an M5 screw clearance hole, to verify) and spacing along rails and ducts. */
export const HOLE_DIAMETER = 5.5;
export const HOLE_PITCH = 200;
/** Distance of the first hole from the end of a rail or duct, and of the corner holes from the edge of a screwed device (to verify). */
export const HOLE_END = 20;
export const DEVICE_HOLE_INSET = 10;

const LAYER: Record<string, string> = { enclosure: 'ENCLOSURE', plate: 'PLATE', rail: 'RAILS', duct: 'DUCTS', device: 'DEVICES', zone: 'ZONES', cover: 'COVERS', dim: 'DIMENSIONS' };

/** The DXF of one layout page (front, door or side view) at real size, in millimetres. */
export function layoutPageDxf(project: Project, page: Page, lib: Library): string {
  if (!isLayoutPage(page)) return writeDxf([], 100);
  const built = buildPage(project, page, lib, project.pages.indexOf(page), 'edit');
  const itemOf = new Map(page.elements.filter(isCab).map((e) => [e.id, e.item]));
  const layer = (p: Prim): string => (p.id && LAYER[itemOf.get(p.id) ?? '']) || (page.layout.view === 'side' ? 'SIDEVIEW' : 'NOTES');
  return writeDxf(built.prims, page.layout.h, layer);
}

export interface Hole {
  x: number;
  y: number;
  kind: 'rail' | 'duct' | 'device';
}

const along = (len: number): number[] => {
  if (len <= 2 * HOLE_END) return [len / 2];
  const n = Math.max(1, Math.ceil((len - 2 * HOLE_END) / HOLE_PITCH));
  return Array.from({ length: n + 1 }, (_, i) => HOLE_END + ((len - 2 * HOLE_END) * i) / n);
};

/** The fixing holes of the plate, in millimetres from its top-left corner (y down). Devices on a rail have none: the rail carries them. */
export function drillHoles(project: Project, lib: Library): Hole[] {
  const cab = cabinetOf(project);
  const o = cab.plate ?? cab.enclosure;
  if (!o) return [];
  const out: Hole[] = [];
  const rd = (v: number) => Math.round(v * 100) / 100;
  for (const { el } of [...cab.rails, ...cab.ducts]) {
    const horizontal = el.w >= el.h;
    for (const t of along(horizontal ? el.w : el.h)) out.push({ kind: el.item as 'rail' | 'duct', x: rd(horizontal ? el.x - o.x + t : el.x - o.x + el.w / 2), y: rd(horizontal ? el.y - o.y + el.h / 2 : el.y - o.y + t) });
  }
  for (const p of cab.devices) {
    if (cab.doors.includes(p.page)) continue;
    const e = p.el;
    if (e.rail || mountOfDevice(project, lib, e.designation as string) !== 'plate') continue;
    const i = Math.min(DEVICE_HOLE_INSET, e.w / 4, e.h / 4);
    for (const [dx, dy] of [[i, i], [e.w - i, i], [e.w - i, e.h - i], [i, e.h - i]]) out.push({ kind: 'device', x: rd(e.x - o.x + dx), y: rd(e.y - o.y + dy) });
  }
  return out;
}

/** The mounting-plate DXF for drilling: outline, holes (circles, one layer per kind), the outlines of what is mounted and a hole count note. */
export function drillingDxf(project: Project, lib: Library): string {
  const cab = cabinetOf(project);
  const o: CabEl | undefined = cab.plate ?? cab.enclosure;
  if (!o) return writeDxf([], 100, 'PLATE');
  const holes = drillHoles(project, lib);
  const st = project.settings.style;
  const prims: (Prim & { layer: string })[] = [];
  const rect = (e: CabEl, layer: string): Prim & { layer: string } => ({ k: 'poly', pts: [e.x - o.x, e.y - o.y, e.x - o.x + e.w, e.y - o.y, e.x - o.x + e.w, e.y - o.y + e.h, e.x - o.x, e.y - o.y + e.h], closed: true, w: 0.25, c: st.colours.symbol, layer });
  prims.push(rect(o, 'PLATE'));
  for (const p of [...cab.rails, ...cab.ducts, ...cab.zones]) prims.push(rect(p.el, p.el.item === 'rail' ? 'RAILS' : p.el.item === 'duct' ? 'DUCTS' : 'ZONES'));
  for (const p of cab.devices) if (!cab.doors.includes(p.page)) prims.push(rect(p.el, 'DEVICES'));
  for (const h of holes) prims.push({ k: 'circle', cx: h.x, cy: h.y, r: HOLE_DIAMETER / 2, w: 0.25, c: st.colours.symbol, layer: `DRILL_${h.kind.toUpperCase()}` });
  const count = (k: Hole['kind']) => holes.filter((h) => h.kind === k).length;
  prims.push({ k: 'text', x: 0, y: o.h + 14, text: `Ø${HOLE_DIAMETER} mm: ${count('rail')} (rails), ${count('duct')} (ducts), ${count('device')} (devices); ${Math.round(o.w)} x ${Math.round(o.h)} mm`, size: 6, anchor: 'start', rot: 0, c: st.colours.text, layer: 'NOTES' });
  const layers = new Map<Prim, string>(prims.map((p) => [p, p.layer]));
  return writeDxf(prims, o.h, (p) => layers.get(p) ?? 'PLATE');
}

/** All layout views (front, door, side) in one DXF at real size, side by side with a gap, one layer per kind of item. */
export function layoutViewsDxf(project: Project, lib: Library): string {
  const prims: Prim[] = [];
  const kind = new Map<Prim, string>();
  let x = 0, height = 100;
  for (const page of project.pages.filter(isLayoutPage)) {
    const built = buildPage(project, page, lib, project.pages.indexOf(page), 'edit');
    const itemOf = new Map(page.elements.filter(isCab).map((e) => [e.id, e.item]));
    for (const p of transformPrims(built.prims, 1, x, 0)) {
      prims.push(p);
      kind.set(p, (p.id && LAYER[itemOf.get(p.id) ?? '']) || (page.layout.view === 'side' ? 'SIDEVIEW' : 'NOTES'));
    }
    x += page.layout.w + 100;
    height = Math.max(height, page.layout.h);
  }
  return writeDxf(prims, height, (p) => kind.get(p) ?? 'NOTES');
}
