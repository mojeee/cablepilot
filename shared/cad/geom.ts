// Small 2D geometry helpers for the CAD workspace: distances, intersections, angles. Page millimetres,
// y down. Typed angles run counter-clockwise on screen from the +x axis (90 degrees points up the page).

import type { Pt } from '../model/types';

export interface Seg {
  a: Pt;
  b: Pt;
  id: string;
}

export const dist = (a: Pt, b: Pt): number => Math.hypot(b.x - a.x, b.y - a.y);
export const same = (a: Pt, b: Pt, eps = 1e-6): boolean => Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;

/** Angle of the direction a to b in degrees, counter-clockwise on screen, in [0, 360). */
export function angleOf(a: Pt, b: Pt): number {
  const deg = (Math.atan2(-(b.y - a.y), b.x - a.x) * 180) / Math.PI;
  return (deg + 360) % 360;
}
/** The point at distance d from a in direction `deg` (counter-clockwise on screen). */
export function polar(a: Pt, d: number, deg: number): Pt {
  const r = (deg * Math.PI) / 180;
  return { x: a.x + d * Math.cos(r), y: a.y - d * Math.sin(r) };
}

/** Parameter t in [0, 1] of the closest point of segment a-b to p, and that point. */
export function closestOnSeg(a: Pt, b: Pt, p: Pt): { t: number; pt: Pt } {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return { t, pt: { x: a.x + t * dx, y: a.y + t * dy } };
}
export const distToSeg = (a: Pt, b: Pt, p: Pt): number => dist(closestOnSeg(a, b, p).pt, p);

/** Intersection of segments a-b and c-d (touching ends count), with the parameter on a-b; null when parallel or apart. */
export function segIntersect(a: Pt, b: Pt, c: Pt, d: Pt): { pt: Pt; t: number } | null {
  const r = { x: b.x - a.x, y: b.y - a.y }, s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
  const e = 1e-9;
  if (t < -e || t > 1 + e || u < -e || u > 1 + e) return null;
  return { pt: { x: a.x + t * r.x, y: a.y + t * r.y }, t };
}
/** Intersection of the infinite line through a-b with segment c-d: parameter t on a-b (any real) and the point. */
export function lineHitsSeg(a: Pt, b: Pt, c: Pt, d: Pt): { pt: Pt; t: number } | null {
  const r = { x: b.x - a.x, y: b.y - a.y }, s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
  if (u < -1e-9 || u > 1 + 1e-9) return null;
  return { pt: { x: a.x + t * r.x, y: a.y + t * r.y }, t };
}

export type Rect = [number, number, number, number];
/** Whether segment a-b has a point inside the rectangle (an end inside, or it crosses an edge). */
export function segTouchesRect(a: Pt, b: Pt, r: Rect): boolean {
  const inside = (p: Pt) => p.x >= r[0] && p.x <= r[2] && p.y >= r[1] && p.y <= r[3];
  if (inside(a) || inside(b)) return true;
  const c = [{ x: r[0], y: r[1] }, { x: r[2], y: r[1] }, { x: r[2], y: r[3] }, { x: r[0], y: r[3] }];
  return c.some((p, i) => !!segIntersect(a, b, p, c[(i + 1) % 4]));
}
export const rectEdges = (x: number, y: number, w: number, h: number): [Pt, Pt][] => {
  const c = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
  return c.map((p, i) => [p, c[(i + 1) % 4]] as [Pt, Pt]);
};
