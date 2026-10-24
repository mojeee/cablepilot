// Symbol instances: placement transform (rotate, mirror), world pin positions, and the drawing
// primitives of a symbol's graphics.

import type { Gfx, PinDef, SymbolDef } from '../library/types';
import type { Rot, SymbolEl } from '../model/types';
import type { Prim } from './primitives';

export interface Xf {
  x: number;
  y: number;
  rot: Rot;
  mirror: boolean;
}

/** Local → page: mirror about the y axis, rotate clockwise on screen, translate. */
export function xfPoint(xf: Xf, lx: number, ly: number): { x: number; y: number } {
  const mx = xf.mirror ? -lx : lx;
  switch (xf.rot) {
    case 0: return { x: xf.x + mx, y: xf.y + ly };
    case 90: return { x: xf.x - ly, y: xf.y + mx };
    case 180: return { x: xf.x - mx, y: xf.y - ly };
    case 270: return { x: xf.x + ly, y: xf.y - mx };
  }
}

const DIRS = ['right', 'down', 'left', 'up'] as const;
/** Direction a pin points after the placement transform. */
export function xfDir(xf: Xf, dir: PinDef['dir']): PinDef['dir'] {
  let d = dir;
  if (xf.mirror && (d === 'left' || d === 'right')) d = d === 'left' ? 'right' : 'left';
  return DIRS[(DIRS.indexOf(d) + xf.rot / 90) % 4];
}

export const symbolXf = (el: SymbolEl): Xf => ({ x: el.x, y: el.y, rot: el.rot, mirror: el.mirror });

export function pinWorld(def: SymbolDef, el: SymbolEl): { id: string; x: number; y: number; dir: PinDef['dir'] }[] {
  const xf = symbolXf(el);
  return def.pins.map((p) => ({ id: p.id, ...xfPoint(xf, p.x, p.y), dir: xfDir(xf, p.dir) }));
}

/** The graphics to draw for the project's symbol standard (NFPA alternative when it exists). */
export const graphicsFor = (def: SymbolDef, standard: 'iec' | 'nfpa'): Gfx[] => (standard === 'nfpa' && def.nfpa ? def.nfpa.graphics : def.graphics);

export const usesValue = (gfx: Gfx[]): boolean => gfx.some((g) => g.t === 'text' && g.text.includes('{value}'));

export function gfxPrims(gfx: Gfx[], xf: Xf, w: number, colour: string, id?: string, value = ''): Prim[] {
  const out: Prim[] = [];
  const P = (x: number, y: number) => xfPoint(xf, x, y);
  for (const g of gfx) {
    switch (g.t) {
      case 'line': {
        const a = P(g.x1, g.y1), b = P(g.x2, g.y2);
        out.push({ k: 'poly', pts: [a.x, a.y, b.x, b.y], w, c: colour, dash: g.dash, id });
        break;
      }
      case 'poly': {
        const pts: number[] = [];
        for (let i = 0; i < g.pts.length; i += 2) { const p = P(g.pts[i], g.pts[i + 1]); pts.push(p.x, p.y); }
        out.push({ k: 'poly', pts, closed: g.closed, fill: g.fill, dash: g.dash, w, c: colour, id });
        break;
      }
      case 'rect': {
        const pts: number[] = [];
        for (const [x, y] of [[g.x, g.y], [g.x + g.w, g.y], [g.x + g.w, g.y + g.h], [g.x, g.y + g.h]]) { const p = P(x, y); pts.push(p.x, p.y); }
        out.push({ k: 'poly', pts, closed: true, fill: g.fill, w, c: colour, id });
        break;
      }
      case 'circle': {
        const p = P(g.cx, g.cy);
        out.push({ k: 'circle', cx: p.x, cy: p.y, r: g.r, w, c: colour, fill: g.fill, id });
        break;
      }
      case 'arc': {
        const p = P(g.cx, g.cy);
        // Mirroring x maps angle a to 180 - a and reverses the sweep; rotation adds to the angle.
        let a0 = g.a0, a1 = g.a1;
        if (xf.mirror) [a0, a1] = [180 - g.a1, 180 - g.a0];
        out.push({ k: 'arc', cx: p.x, cy: p.y, r: g.r, a0: a0 + xf.rot, a1: a1 + xf.rot, w, c: colour, id });
        break;
      }
      case 'text': {
        const p = P(g.x, g.y);
        const text = g.text.replace('{value}', value);
        if (text) out.push({ k: 'text', x: p.x, y: p.y + g.size * 0.36, text, size: g.size, anchor: g.anchor ?? 'middle', rot: 0, c: colour, id });
        break;
      }
    }
  }
  return out;
}
