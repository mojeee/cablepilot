// Orthogonal wire geometry: normalising polylines, connection tests, junction detection.
import type { Page, Pt, WireEl } from '../model/types';

const EPS = 1e-6;
export const samePt = (a: Pt, b: Pt): boolean => Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;

/** Drops repeated points and the middle point of three collinear ones. */
export function normalizePoints(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) if (out.length === 0 || !samePt(out[out.length - 1], p)) out.push({ x: p.x, y: p.y });
  for (let i = out.length - 2; i >= 1; i--) {
    const a = out[i - 1], b = out[i], c = out[i + 1];
    if (Math.abs((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)) < EPS && (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) > 0) out.splice(i, 1);
  }
  return out;
}

export function onSegment(p: Pt, a: Pt, b: Pt): boolean {
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  if (Math.abs(cross) > EPS * Math.max(1, Math.hypot(b.x - a.x, b.y - a.y))) return false;
  return p.x >= Math.min(a.x, b.x) - EPS && p.x <= Math.max(a.x, b.x) + EPS && p.y >= Math.min(a.y, b.y) - EPS && p.y <= Math.max(a.y, b.y) + EPS;
}

/** Whether the point lies on the polyline. */
export function pointOnPolyline(p: Pt, pts: Pt[]): boolean {
  for (let i = 0; i + 1 < pts.length; i++) if (onSegment(p, pts[i], pts[i + 1])) return true;
  return pts.length === 1 && samePt(p, pts[0]);
}

/** How many branches of a wire meet at a point: 1 at an end, 2 at a vertex or along a segment, 0 if away. */
export function branchesAt(p: Pt, pts: Pt[]): number {
  if (pts.length < 2) return 0;
  if (samePt(p, pts[0]) || samePt(p, pts[pts.length - 1])) return 1;
  return pointOnPolyline(p, pts) ? 2 : 0;
}

/** The orthogonal path from a to b: horizontal first, or vertical first. */
export function orthoRoute(a: Pt, b: Pt, horizontalFirst = true): Pt[] {
  if (a.x === b.x || a.y === b.y) return [a, b];
  return horizontalFirst ? [a, { x: b.x, y: a.y }, b] : [a, { x: a.x, y: b.y }, b];
}

export function distToPolyline(x: number, y: number, pts: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2));
    best = Math.min(best, Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy)));
  }
  return best;
}

const wiresOf = (page: Page): WireEl[] => page.elements.filter((e): e is WireEl => e.kind === 'wire');

/** Whether three or more wire branches meet at p (a junction dot is drawn there). */
export function needsJunction(page: Page, p: Pt): boolean {
  let n = 0;
  for (const w of wiresOf(page)) n += branchesAt(p, w.points);
  return n >= 3;
}

/** Points where the new wire starts, ends or is met by another wire's end: candidates for junctions. */
export function junctionCandidates(page: Page, wire: WireEl): Pt[] {
  const cands: Pt[] = [wire.points[0], wire.points[wire.points.length - 1]];
  for (const o of wiresOf(page)) {
    if (o.id === wire.id) continue;
    for (const e of [o.points[0], o.points[o.points.length - 1]]) if (pointOnPolyline(e, wire.points)) cands.push(e);
  }
  return cands;
}

// ---- inserting a symbol into a wire (M8 part 2) ----------------------------------------------------------------

const segLen = (a: Pt, b: Pt): number => Math.hypot(b.x - a.x, b.y - a.y);

/** Distance along the polyline to a point on it (the first segment that holds it); undefined when it is not on it. */
export function distanceAlong(p: Pt, pts: Pt[]): number | undefined {
  let s = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    if (onSegment(p, pts[i], pts[i + 1])) return s + segLen(pts[i], p);
    s += segLen(pts[i], pts[i + 1]);
  }
  return undefined;
}

/** The part of a polyline between two distances along it. */
export function subPolyline(pts: Pt[], from: number, to: number): Pt[] {
  const out: Pt[] = [];
  let s = 0;
  const at = (a: Pt, b: Pt, d: number): Pt => {
    const l = segLen(a, b);
    return l === 0 ? { x: a.x, y: a.y } : { x: a.x + ((b.x - a.x) * d) / l, y: a.y + ((b.y - a.y) * d) / l };
  };
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], l = segLen(a, b);
    const s0 = s, s1 = s + l;
    s = s1;
    if (s1 < from - EPS || s0 > to + EPS) continue;
    const start = Math.max(from, s0), end = Math.min(to, s1);
    if (out.length === 0) out.push(at(a, b, start - s0));
    out.push(at(a, b, end - s0));
  }
  return normalizePoints(out);
}

const polyLen = (pts: Pt[]): number => pts.reduce((a, p, i) => (i ? a + segLen(pts[i - 1], p) : a), 0);

/**
 * Cuts a wire between the pins of a symbol inserted on it: a symbol with two or more pins on the same wire would
 * otherwise join them (a pin on a wire connects, shared/connectivity.ts) and short the device. The piece before the
 * first pin keeps the wire; the piece after the last pin becomes a new wire. Pieces of zero length are dropped.
 * Returns the wires that replace `wire`, or null when fewer than two pins lie on it.
 */
export function breakWire(wire: WireEl, pins: readonly Pt[], newId: string): WireEl[] | null {
  const along = pins.map((p) => distanceAlong(p, wire.points)).filter((d): d is number => d !== undefined);
  if (along.length < 2) return null;
  const lo = Math.min(...along), hi = Math.max(...along);
  if (hi - lo < EPS) return null;
  const total = polyLen(wire.points);
  const out: WireEl[] = [];
  const before = lo > EPS ? subPolyline(wire.points, 0, lo) : [];
  const after = hi < total - EPS ? subPolyline(wire.points, hi, total) : [];
  // The new piece is a new conductor: same potential, type and cable, but its own number.
  const { number: _n, numberLocked: _l, ...rest } = wire;
  if (before.length >= 2) out.push({ ...wire, points: before });
  if (after.length >= 2) out.push(out.length ? { ...rest, id: newId, points: after } : { ...wire, points: after });
  return out;
}
