// Wire routes along the wire ducts (M6 part 3). The ducts of the layout are a graph of straight
// centre lines; a device attaches to the nearest point of a duct; a wire goes from its first device
// through the ducts to its second device. The route gives the length (with a slack per end) and which
// ducts the wire runs in (for the fill rate). Without ducts the length is the straight distance
// between the two devices (Manhattan) plus the slack. All lengths are estimates: the manual length
// of a wire or cable always wins (shared/model/types WireEl.length, CableRec.length).

import type { CabEl, CableRec, Project } from '../model/types';
import type { Library } from '../library/types';
import { numOf } from '../sizing';
import { cabinetOf, isCab, isHorizontal, type Cabinet, type Placed } from './model';

interface Pt {
  x: number;
  y: number;
}
interface Edge {
  to: string;
  len: number;
  duct: string;
}
export interface Route {
  /** Length in millimetres, with the slack of both ends. */
  mm: number;
  /** Ids of the duct elements the wire runs in, in order. */
  ducts: string[];
}
export interface Router {
  route(a: string, b: string): Route | null;
  /** Whether the device has a position on the layout. */
  has(key: string): boolean;
  /** Duct elements by id. */
  ducts: Map<string, Placed>;
}

const k = (p: Pt) => `${Math.round(p.x * 10) / 10},${Math.round(p.y * 10) / 10}`;
const manhattan = (a: Pt, b: Pt) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** Closest point of an axis-aligned segment to p. */
function nearestOn(a: Pt, b: Pt, p: Pt): Pt {
  return { x: Math.min(Math.max(p.x, Math.min(a.x, b.x)), Math.max(a.x, b.x)), y: Math.min(Math.max(p.y, Math.min(a.y, b.y)), Math.max(a.y, b.y)) };
}

/** Where a device sits on the front page (door devices keep their place relative to the door, plus the depth of the cabinet in the length). */
function positions(cab: Cabinet): Map<string, { c: Pt; extra: number }> {
  const m = new Map<string, { c: Pt; extra: number }>();
  for (const p of cab.devices) {
    const key = p.el.designation as string;
    const door = cab.doors.includes(p.page);
    const o = door ? p.page.elements.find((e): e is CabEl => isCab(e) && e.item === 'enclosure') : undefined;
    const base = door && o && cab.enclosure ? { x: p.el.x - o.x + cab.enclosure.x, y: p.el.y - o.y + cab.enclosure.y } : { x: p.el.x, y: p.el.y };
    m.set(key, { c: { x: base.x + p.el.w / 2, y: base.y + p.el.h / 2 }, extra: door ? (cab.enclosure?.d ?? 300) : 0 });
  }
  return m;
}

export function buildRouter(project: Project, cab: Cabinet = cabinetOf(project)): Router {
  const pos = positions(cab);
  const slack = project.settings.layout.slack;
  const ducts = new Map(cab.ducts.map((d) => [d.el.id, d]));
  const segs = cab.ducts.map((d) => {
    const e = d.el;
    const r = { x0: e.x, y0: e.y, x1: e.x + e.w, y1: e.y + e.h };
    return isHorizontal(e)
      ? { id: e.id, r, a: { x: e.x, y: e.y + e.h / 2 }, b: { x: e.x + e.w, y: e.y + e.h / 2 } }
      : { id: e.id, r, a: { x: e.x + e.w / 2, y: e.y }, b: { x: e.x + e.w / 2, y: e.y + e.h } };
  });
  // Attach points of the devices.
  const attach = new Map<string, Pt>();
  for (const [key, { c }] of pos) {
    let best: Pt | null = null;
    for (const s of segs) {
      const q = nearestOn(s.a, s.b, c);
      if (!best || manhattan(q, c) < manhattan(best, c)) best = q;
    }
    if (best) attach.set(key, best);
  }
  // Points on every duct: its ends, crossings with other ducts and attach points; edges join neighbours.
  const adj = new Map<string, Edge[]>();
  const add = (u: string, e: Edge) => { (adj.get(u) ?? adj.set(u, []).get(u)!).push(e); };
  for (const s of segs) {
    const on: Pt[] = [s.a, s.b];
    for (const o of segs) {
      if (o === s || (o.a.y === o.b.y) === (s.a.y === s.b.y)) continue;
      // A horizontal and a vertical duct are joined where their rectangles touch: at the vertical one's centre line, on the horizontal one's.
      const h = s.a.y === s.b.y ? s : o, v = s.a.y === s.b.y ? o : s;
      const q = { x: v.a.x, y: h.a.y };
      const touch = h.r.x0 <= v.r.x1 + 1 && h.r.x1 >= v.r.x0 - 1 && h.r.y0 <= v.r.y1 + 1 && h.r.y1 >= v.r.y0 - 1;
      if (touch && q.y >= v.r.y0 - 1 && q.y <= v.r.y1 + 1) on.push(q);
    }
    for (const p of attach.values()) if (manhattan(nearestOn(s.a, s.b, p), p) < 0.5) on.push(p);
    const horizontal = s.a.y === s.b.y;
    const sorted = on.sort((p, q) => (horizontal ? p.x - q.x : p.y - q.y));
    for (let i = 0; i + 1 < sorted.length; i++) {
      const p = sorted[i], q = sorted[i + 1];
      const len = manhattan(p, q);
      if (len === 0) continue;
      add(k(p), { to: k(q), len, duct: s.id });
      add(k(q), { to: k(p), len, duct: s.id });
    }
  }
  const trees = new Map<string, { dist: Map<string, number>; prev: Map<string, { from: string; duct: string }> }>();
  const tree = (src: string) => {
    let t = trees.get(src);
    if (t) return t;
    const dist = new Map<string, number>([[src, 0]]);
    const prev = new Map<string, { from: string; duct: string }>();
    const todo = new Set([src]);
    while (todo.size) {
      let u = '';
      let best = Infinity;
      for (const n of todo) if ((dist.get(n) ?? Infinity) < best) { best = dist.get(n) ?? Infinity; u = n; }
      todo.delete(u);
      for (const e of adj.get(u) ?? []) {
        const nd = best + e.len;
        if (nd < (dist.get(e.to) ?? Infinity) - 1e-9) { dist.set(e.to, nd); prev.set(e.to, { from: u, duct: e.duct }); todo.add(e.to); }
      }
    }
    t = { dist, prev };
    trees.set(src, t);
    return t;
  };
  return {
    ducts,
    has: (key) => pos.has(key),
    route(a, b) {
      const pa = pos.get(a), pb = pos.get(b);
      if (!pa || !pb || a === b) return null;
      const extra = pa.extra + pb.extra;
      const aa = attach.get(a), ab = attach.get(b);
      if (!aa || !ab) return { mm: manhattan(pa.c, pb.c) + extra + 2 * slack, ducts: [] };
      const t = tree(k(aa));
      const d = t.dist.get(k(ab));
      if (d === undefined) return { mm: manhattan(pa.c, pb.c) + extra + 2 * slack, ducts: [] };
      const used: string[] = [];
      for (let n = k(ab); n !== k(aa);) {
        const p = t.prev.get(n);
        if (!p) break;
        if (!used.includes(p.duct)) used.unshift(p.duct);
        n = p.from;
      }
      return { mm: manhattan(pa.c, aa) + d + manhattan(ab, pb.c) + extra + 2 * slack, ducts: used };
    },
  };
}

const memo = new WeakMap<Project, Router | null>();
/** The router of a project, cached while the project object is unchanged; null when no device has a place. */
export function routerOf(project: Project): Router | null {
  if (memo.has(project)) return memo.get(project) ?? null;
  const cab = cabinetOf(project);
  const r = cab.devices.length >= 2 ? buildRouter(project, cab) : null;
  memo.set(project, r);
  return r;
}

/** Wire length in metres (one decimal) for a route in millimetres. */
export const metres = (mm: number): number => Math.round(mm / 100) / 10;

/** A cable's length: the typed one, else the route between its two ends when both are devices of the layout. */
export function cableLength(project: Project, _lib: Library, c: CableRec): { m: number; source: 'manual' | 'layout' } | undefined {
  const manual = numOf(c.length);
  if (Number.isFinite(manual) && manual > 0) return { m: manual, source: 'manual' };
  const r = routerOf(project);
  if (!r || !c.from || !c.to) return undefined;
  const keys = cabinetOf(project).devices.map((p) => p.el.designation as string);
  const find = (product: string) => keys.find((d) => d === product || d.endsWith(product));
  const a = find(c.from), b = find(c.to);
  const rt = a && b ? r.route(a, b) : null;
  return rt ? { m: metres(rt.mm), source: 'layout' } : undefined;
}
