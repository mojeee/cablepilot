// Editing geometry for TRIM, EXTEND, OFFSET and the grips. Pure functions on points; the commands
// that apply the results are built in the renderer and go through the command layer.

import type { Command } from '../commands';
import { moveWireEnd } from '../commands';
import type { El, Pt } from '../model/types';
import { closestOnSeg, dist, lineHitsSeg, same, segIntersect, type Seg } from './geom';

/**
 * TRIM: removes the part of segment a-b under `pick` that lies between the nearest cutting edges. Gives
 * the pieces that remain (none, one or two), or null when no edge crosses the segment.
 */
export function trimSegment(a: Pt, b: Pt, edges: Seg[], pick: Pt): Pt[][] | null {
  const ts: number[] = [];
  for (const e of edges) {
    const h = segIntersect(a, b, e.a, e.b);
    if (h && h.t > 1e-6 && h.t < 1 - 1e-6) ts.push(h.t);
  }
  if (!ts.length) return null;
  const tp = closestOnSeg(a, b, pick).t;
  const lo = Math.max(0, ...ts.filter((t) => t <= tp));
  const hi = Math.min(1, ...ts.filter((t) => t > tp));
  const at = (t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const out: Pt[][] = [];
  if (lo > 1e-6) out.push([a, at(lo)]);
  if (hi < 1 - 1e-6) out.push([at(hi), b]);
  return out;
}

/** EXTEND: lengthens the end of a-b that is nearer to `pick` up to the nearest boundary it reaches, or null. */
export function extendSegment(a: Pt, b: Pt, bounds: Seg[], pick: Pt): [Pt, Pt] | null {
  const startEnd = dist(pick, a) < dist(pick, b);
  let best: { t: number; pt: Pt } | null = null;
  for (const e of bounds) {
    const h = lineHitsSeg(a, b, e.a, e.b);
    if (!h) continue;
    const beyond = startEnd ? h.t < -1e-6 : h.t > 1 + 1e-6;
    if (beyond && (!best || (startEnd ? h.t > best.t : h.t < best.t))) best = h;
  }
  if (!best) return null;
  return startEnd ? [best.pt, b] : [a, best.pt];
}

/** OFFSET of a straight line: a parallel line `d` away, on the side of `side`. */
export function offsetSegment(a: Pt, b: Pt, d: number, side: Pt): [Pt, Pt] {
  const len = dist(a, b) || 1;
  let nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
  if ((side.x - a.x) * nx + (side.y - a.y) * ny < 0) { nx = -nx; ny = -ny; }
  return [{ x: a.x + nx * d, y: a.y + ny * d }, { x: b.x + nx * d, y: b.y + ny * d }];
}
/** OFFSET of a rectangle outline: grown when `side` is outside, shrunk when inside; null if it would vanish. */
export function offsetRect(r: { x: number; y: number; w: number; h: number }, d: number, side: Pt): { x: number; y: number; w: number; h: number } | null {
  const inside = side.x > r.x && side.x < r.x + r.w && side.y > r.y && side.y < r.y + r.h;
  const k = inside ? -d : d;
  const w = r.w + 2 * k, h = r.h + 2 * k;
  return w > 0 && h > 0 ? { x: r.x - k, y: r.y - k, w, h } : null;
}
/** OFFSET of a circle: the radius changes by `d`, outwards when `side` is outside the circle; null if it would vanish. */
export function offsetCircle(c: { x: number; y: number; r: number }, d: number, side: Pt): number | null {
  const r = dist(side, c) > c.r ? c.r + d : c.r - d;
  return r > 0 ? r : null;
}

export interface Grip {
  /** Index within the element's grips. */
  i: number;
  pt: Pt;
  role: 'move' | 'vertex' | 'corner' | 'radius';
}

/** The grips of an element: stretch points for lines, wire ends, rectangle corners and circles, one move grip for the rest. */
export function gripsOf(el: El): Grip[] {
  switch (el.kind) {
    case 'line': return el.points.map((pt, i) => ({ i, pt, role: 'vertex' as const }));
    case 'wire': return [{ i: 0, pt: el.points[0], role: 'vertex' }, { i: 1, pt: el.points[el.points.length - 1], role: 'vertex' }];
    case 'rect': return [{ x: el.x, y: el.y }, { x: el.x + el.w, y: el.y }, { x: el.x + el.w, y: el.y + el.h }, { x: el.x, y: el.y + el.h }].map((pt, i) => ({ i, pt, role: 'corner' as const }));
    case 'circle': return [{ i: 0, pt: { x: el.x, y: el.y }, role: 'move' }, { i: 1, pt: { x: el.x + el.r, y: el.y }, role: 'radius' }];
    case 'junction': return [];
    case 'symbol': case 'box': case 'text': case 'table': case 'image': case 'warning': case 'form': case 'report': return [{ i: 0, pt: { x: el.x, y: el.y }, role: 'move' }];
  }
}

/** The command that drags grip `i` of an element to `to` (grips of moved objects follow the move). */
export function gripCommand(page: string, el: El, i: number, to: Pt): Command | null {
  const upd = (patch: Record<string, unknown>): Command => ({ type: 'el/update', page, id: el.id, patch });
  const g = gripsOf(el).find((x) => x.i === i);
  if (!g || same(g.pt, to)) return null;
  switch (el.kind) {
    case 'line': return upd({ points: el.points.map((p, k) => (k === i ? to : p)) });
    case 'wire': return upd({ points: moveWireEnd(el.points, i === 0 ? 'start' : 'end', to) });
    case 'rect': {
      const opp = gripsOf(el)[(i + 2) % 4].pt;
      const w = Math.abs(to.x - opp.x), h = Math.abs(to.y - opp.y);
      return w > 0 && h > 0 ? upd({ x: Math.min(to.x, opp.x), y: Math.min(to.y, opp.y), w, h }) : null;
    }
    case 'circle': return g.role === 'radius' ? (dist(to, el) > 0 ? upd({ r: dist(to, el) }) : null) : { type: 'el/move', page, ids: [el.id], dx: to.x - g.pt.x, dy: to.y - g.pt.y };
    default: return { type: 'el/move', page, ids: [el.id], dx: to.x - g.pt.x, dy: to.y - g.pt.y };
  }
}
