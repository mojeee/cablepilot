// Drafting aids: object snap (endpoint, midpoint, connection point, intersection, perpendicular,
// nearest), ortho, polar tracking and grid snap, resolved into one point for the cursor. Pure.

import { boxPinsWorld } from '../draw/box';
import { pinWorld } from '../draw/symbol';
import type { Library } from '../library/types';
import type { Page, Pt } from '../model/types';
import { angleOf, closestOnSeg, dist, polar, rectEdges, segIntersect, type Seg } from './geom';

export type OsnapMode = 'endpoint' | 'midpoint' | 'connection' | 'intersection' | 'perpendicular' | 'nearest';
export const OSNAP_MODES: readonly OsnapMode[] = ['endpoint', 'midpoint', 'connection', 'intersection', 'perpendicular', 'nearest'];
/** What a new session starts with (nearest and perpendicular are off until asked for, like in most CAD programs). */
export const DEFAULT_OSNAP: readonly OsnapMode[] = ['endpoint', 'midpoint', 'connection', 'intersection'];

export const GRID_STEP = 2.5;
export const snapTo = (v: number, step = GRID_STEP): number => Math.round(v / step) * step;

export interface SnapGeometry {
  /** Straight pieces of wires, lines and rectangle borders. */
  segs: Seg[];
  /** Corner and vertex points of lines, rectangles and wire bends. */
  endpoints: Pt[];
  /** Symbol and box pins, wire ends and junctions: where a wire connects. */
  connections: { p: Pt; via: 'pin' | 'wire-end' | 'junction' }[];
}

/** The snap geometry of a page: collected once per page change, then queried on every mouse move. */
export function snapGeometry(page: Page, lib: Library): SnapGeometry {
  const g: SnapGeometry = { segs: [], endpoints: [], connections: [] };
  const poly = (pts: Pt[], id: string) => {
    for (let i = 1; i < pts.length; i++) g.segs.push({ a: pts[i - 1], b: pts[i], id });
  };
  for (const e of page.elements) {
    switch (e.kind) {
      case 'symbol': {
        const def = lib.symbols.get(e.symbolId);
        if (def) for (const p of pinWorld(def, e)) g.connections.push({ p: { x: p.x, y: p.y }, via: 'pin' });
        break;
      }
      case 'box': for (const p of boxPinsWorld(e)) g.connections.push({ p: { x: p.x, y: p.y }, via: 'pin' }); break;
      case 'wire':
        poly(e.points, e.id);
        g.connections.push({ p: e.points[0], via: 'wire-end' }, { p: e.points[e.points.length - 1], via: 'wire-end' });
        g.endpoints.push(...e.points.slice(1, -1));
        break;
      case 'junction': g.connections.push({ p: { x: e.x, y: e.y }, via: 'junction' }); break;
      case 'line': poly(e.points, e.id); g.endpoints.push(...e.points); break;
      case 'rect':
        for (const [a, b] of rectEdges(e.x, e.y, e.w, e.h)) { g.segs.push({ a, b, id: e.id }); g.endpoints.push(a); }
        break;
    }
  }
  return g;
}

export interface SnapHit {
  pt: Pt;
  mode: OsnapMode;
  via?: 'pin' | 'wire-end' | 'junction';
}

const PRIORITY: Record<OsnapMode, number> = { connection: 0, endpoint: 0, intersection: 1, midpoint: 2, perpendicular: 3, nearest: 4 };

/** The object-snap point near the cursor within `radius` mm, or null. `base` is the last point (perpendicular needs it). */
export function objectSnap(g: SnapGeometry, cur: Pt, radius: number, modes: ReadonlySet<OsnapMode>, base?: Pt | null): SnapHit | null {
  let best: (SnapHit & { d: number }) | null = null;
  const consider = (pt: Pt, mode: OsnapMode, via?: SnapHit['via']) => {
    const d = dist(pt, cur);
    if (d > radius) return;
    if (!best || d < best.d - 1e-9 || (Math.abs(d - best.d) < 1e-9 && PRIORITY[mode] < PRIORITY[best.mode])) best = { pt, mode, via, d };
  };
  if (modes.has('connection')) for (const c of g.connections) consider(c.p, 'connection', c.via);
  if (modes.has('endpoint')) for (const p of g.endpoints) consider(p, 'endpoint');
  // Only the pieces near the cursor matter for the rest.
  const near = g.segs.filter((s) => dist(closestOnSeg(s.a, s.b, cur).pt, cur) <= radius * 2);
  if (modes.has('endpoint')) for (const s of near) { consider(s.a, 'endpoint'); consider(s.b, 'endpoint'); }
  if (modes.has('midpoint')) for (const s of near) consider({ x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 }, 'midpoint');
  if (modes.has('intersection')) {
    for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) {
      if (near[i].id === near[j].id) continue;
      const hit = segIntersect(near[i].a, near[i].b, near[j].a, near[j].b);
      if (hit) consider(hit.pt, 'intersection');
    }
  }
  if (modes.has('perpendicular') && base) for (const s of near) {
    const f = closestOnSeg(s.a, s.b, base);
    const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
    const len2 = dx * dx + dy * dy;
    const raw = len2 ? ((base.x - s.a.x) * dx + (base.y - s.a.y) * dy) / len2 : 0;
    if (raw >= 0 && raw <= 1) consider(f.pt, 'perpendicular');
  }
  if (best) return { pt: (best as SnapHit).pt, mode: (best as SnapHit).mode, ...((best as SnapHit).via ? { via: (best as SnapHit).via } : {}) };
  if (modes.has('nearest')) {
    let bd = radius, bp: Pt | null = null;
    for (const s of near) {
      const c = closestOnSeg(s.a, s.b, cur);
      const d = dist(c.pt, cur);
      if (d <= bd) { bd = d; bp = c.pt; }
    }
    if (bp) return { pt: bp, mode: 'nearest' };
  }
  return null;
}

/** Ortho: the point on the horizontal or vertical line through `base` that is closer to the cursor's direction. */
export function orthoPoint(base: Pt, p: Pt): Pt {
  return Math.abs(p.x - base.x) >= Math.abs(p.y - base.y) ? { x: p.x, y: base.y } : { x: base.x, y: p.y };
}

/** Polar tracking: when the direction base-to-cursor is within `tol` degrees of a multiple of `step`, the cursor moves onto that ray. */
export function polarPoint(base: Pt, p: Pt, step: number, tol = 4): { pt: Pt; angle: number | null } {
  const d = dist(base, p);
  if (d < 1e-9 || step <= 0) return { pt: p, angle: null };
  const a = angleOf(base, p);
  const k = Math.round(a / step) * step;
  const off = Math.min(Math.abs(a - k), 360 - Math.abs(a - k));
  if (off > tol) return { pt: p, angle: null };
  const ang = ((k % 360) + 360) % 360;
  return { pt: polar(base, d, ang), angle: ang };
}

export interface Aids {
  /** Grid snap (F9): the cursor jumps from grid point to grid point. */
  snap: boolean;
  ortho: boolean;
  polar: boolean;
  polarStep: number;
  osnap: boolean;
  modes: ReadonlySet<OsnapMode>;
}

export interface Resolved {
  pt: Pt;
  /** What decided the point: an object snap mode, polar or ortho, the grid, or nothing (a free point). */
  on: OsnapMode | 'polar' | 'ortho' | 'grid' | 'free';
  via?: SnapHit['via'];
  /** Polar tracking: the ray that is shown. */
  track?: { from: Pt; angle: number };
}

/** Resolves the raw cursor position into the point the drawing uses: object snap first, then ortho or polar, then the grid. */
export function resolvePoint(raw: Pt, base: Pt | null, aids: Aids, geom: SnapGeometry | null, radius: number, step = GRID_STEP): Resolved {
  if (aids.osnap && geom) {
    const hit = objectSnap(geom, raw, radius, aids.modes, base);
    if (hit) return { pt: hit.pt, on: hit.mode, ...(hit.via ? { via: hit.via } : {}) };
  }
  const grid = (p: Pt, keepX = false, keepY = false): Pt => (aids.snap ? { x: keepX ? p.x : snapTo(p.x, step), y: keepY ? p.y : snapTo(p.y, step) } : { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 });
  if (base && aids.ortho) {
    const o = orthoPoint(base, raw);
    const horizontal = o.y === base.y;
    return { pt: grid(o, !horizontal, horizontal), on: 'ortho' };
  }
  if (base && aids.polar) {
    const r = polarPoint(base, raw, aids.polarStep);
    if (r.angle !== null) return { pt: aids.snap ? { x: Math.round(r.pt.x * 100) / 100, y: Math.round(r.pt.y * 100) / 100 } : r.pt, on: 'polar', track: { from: base, angle: r.angle } };
  }
  return { pt: grid(raw), on: aids.snap ? 'grid' : 'free' };
}
