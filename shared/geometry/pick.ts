// Picking and snapping on a page: which element is under the cursor, and where a point snaps to
// (pins, wire ends and junctions first, then the grid).
import { boxPinsWorld } from '../draw/box';
import { pinWorld } from '../draw/symbol';
import type { Box } from '../draw/primitives';
import { inBox } from '../draw/primitives';
import type { SpatialIndex } from './spatial';
import { distToPolyline } from './wires';
import type { El, Page, Pt } from '../model/types';
import type { Library } from '../library/types';

export const GRID = 2.5;
export const snapGrid = (v: number, grid = GRID): number => Math.round(v / grid) * grid;

function distToBox(b: Box, x: number, y: number): number {
  const dx = Math.max(b[0] - x, 0, x - b[2]), dy = Math.max(b[1] - y, 0, y - b[3]);
  return Math.hypot(dx, dy);
}

/** Distance from a point to the border of a box (0 on the border). */
function distToBorder(b: Box, x: number, y: number): number {
  return distToPolyline(x, y, [{ x: b[0], y: b[1] }, { x: b[2], y: b[1] }, { x: b[2], y: b[3] }, { x: b[0], y: b[3] }, { x: b[0], y: b[1] }]);
}

/**
 * The element under (x, y), topmost first. Wires and lines are hit near the line; rectangles only
 * near their border (so symbols inside a dashed outline stay selectable); the rest by their box.
 */
export function hitTest(page: Page, items: { id: string; box: Box }[], idx: SpatialIndex, x: number, y: number, tol: number): string | null {
  const byId = new Map(page.elements.map((e, i) => [e.id, { e, i }]));
  const boxOf = new Map(items.map((it) => [it.id, it.box]));
  const cands = idx.at(x, y, tol).map((id) => byId.get(id)).filter((c): c is { e: El; i: number } => !!c).sort((a, b) => b.i - a.i);
  let rectHit: string | null = null;
  for (const { e } of cands) {
    const box = boxOf.get(e.id);
    if (!box) continue;
    switch (e.kind) {
      case 'wire':
      case 'line': if (distToPolyline(x, y, e.points) <= tol) return e.id; break;
      case 'junction': if (Math.hypot(x - e.x, y - e.y) <= tol) return e.id; break;
      case 'rect': if (!rectHit && distToBorder(box, x, y) <= tol) rectHit = e.id; break;
      default: if (inBox(box, x, y, tol * 0.5)) return e.id;
    }
  }
  return rectHit;
}

/** Elements whose box lies inside the rectangle (rubber-band selection). */
export function inRect(items: { id: string; box: Box }[], r: Box): string[] {
  return items.filter((it) => it.box[0] >= r[0] && it.box[2] <= r[2] && it.box[1] >= r[1] && it.box[3] <= r[3]).map((it) => it.id);
}

export interface Snap {
  x: number;
  y: number;
  /** What the point snapped to: a connection point, or the grid. */
  on: 'pin' | 'wire-end' | 'junction' | 'grid';
}

/** Snaps to the nearest connection point within `radius` mm, else to the grid. */
export function snapPoint(page: Page, lib: Library, x: number, y: number, radius: number, grid = GRID): Snap {
  let best: Snap | null = null;
  let bd = radius;
  const consider = (p: Pt, on: Snap['on']) => {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= bd) { bd = d; best = { x: p.x, y: p.y, on }; }
  };
  for (const e of page.elements) {
    if (e.kind === 'symbol') {
      const def = lib.symbols.get(e.symbolId);
      if (def) for (const p of pinWorld(def, e)) consider(p, 'pin');
    } else if (e.kind === 'box') {
      for (const p of boxPinsWorld(e)) consider(p, 'pin');
    } else if (e.kind === 'wire') {
      consider(e.points[0], 'wire-end');
      consider(e.points[e.points.length - 1], 'wire-end');
    } else if (e.kind === 'junction') consider(e, 'junction');
  }
  return best ?? { x: snapGrid(x, grid), y: snapGrid(y, grid), on: 'grid' };
}

/** Whether a point lies on a wire (not just at its ends): a wire can end there and connect. */
export function onAnyWire(page: Page, p: Pt): boolean {
  return page.elements.some((e) => e.kind === 'wire' && distToPolyline(p.x, p.y, e.points) < 1e-6);
}
