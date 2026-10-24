// Typed input of the command line and the dynamic input: points as absolute coordinates (x,y), relative
// coordinates (@dx,dy), relative polar (@distance<angle), absolute polar (distance<angle) and a plain
// distance along the cursor direction ("direct distance entry"). Coordinates are page millimetres as
// shown in the status bar (x right, y down); angles run counter-clockwise on screen from +x, so
// 90 points up the page.

import type { Pt } from '../model/types';
import { dist, polar } from './geom';

export type PointParse = { ok: true; pt: Pt; kind: 'absolute' | 'relative' | 'polar' | 'distance' } | { ok: false };

const NUM = '[-+]?(?:\\d+\\.?\\d*|\\.\\d+)';
const rel = new RegExp(`^@\\s*(${NUM})\\s*,\\s*(${NUM})$`);
const relPolar = new RegExp(`^@\\s*(${NUM})\\s*<\\s*(${NUM})$`);
const abs = new RegExp(`^(${NUM})\\s*,\\s*(${NUM})$`);
const absPolar = new RegExp(`^(${NUM})\\s*<\\s*(${NUM})$`);
const plain = new RegExp(`^(${NUM})$`);

/**
 * Reads a typed point. `base` is the last point (needed for relative input); `toward` is where the
 * cursor is (a plain number then means that distance from `base` in the cursor's direction).
 */
export function parsePointInput(text: string, base: Pt | null, toward?: Pt | null): PointParse {
  const s = text.trim();
  let m: RegExpMatchArray | null;
  if ((m = s.match(rel))) return base ? { ok: true, kind: 'relative', pt: { x: base.x + Number(m[1]), y: base.y + Number(m[2]) } } : { ok: false };
  if ((m = s.match(relPolar))) return base ? { ok: true, kind: 'polar', pt: polar(base, Number(m[1]), Number(m[2])) } : { ok: false };
  if ((m = s.match(abs))) return { ok: true, kind: 'absolute', pt: { x: Number(m[1]), y: Number(m[2]) } };
  if ((m = s.match(absPolar))) return { ok: true, kind: 'polar', pt: polar({ x: 0, y: 0 }, Number(m[1]), Number(m[2])) };
  if ((m = s.match(plain)) && base && toward) {
    const d = dist(base, toward);
    if (d < 1e-9) return { ok: false };
    const k = Number(m[1]) / d;
    return { ok: true, kind: 'distance', pt: { x: base.x + (toward.x - base.x) * k, y: base.y + (toward.y - base.y) * k } };
  }
  return { ok: false };
}

/** A typed number (a distance, a factor), or null. */
export function parseNumber(text: string): number | null {
  const m = text.trim().match(plain);
  return m ? Number(m[1]) : null;
}

/** Whether typed text looks like coordinate or number input (so the command line should not read it as a command). */
export const looksLikeInput = (text: string): boolean => /^[@\d.+-]/.test(text.trim());
