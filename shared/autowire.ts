// Auto-wire (M8 part 2): connects the selected symbols in sequence, as a ladder rung or a column of devices is wired.
// The symbols are taken in order along the direction they are spread in (top to bottom, or left to right); each
// symbol's outgoing pins (pointing down, or right) are wired to the incoming pins of the next one (pointing up, or
// left), pole by pole: the pairs nearest across are wired first. Pins that already touch a wire or another pin are
// left alone. Pure: it returns the wire paths, the caller adds them as one undoable batch of wire/add.

import { pinWorld } from './draw/symbol';
import { pointOnPolyline, samePt } from './geometry/wires';
import type { Library } from './library/types';
import type { Page, Pt, SymbolEl } from './model/types';

type Pin = Pt & { dir: 'up' | 'down' | 'left' | 'right' };

const grid = (v: number): number => Math.round(v / 2.5) * 2.5;

/** An orthogonal path between two pins, with a jog halfway when they are not in line. */
function route(a: Pt, b: Pt, vertical: boolean): Pt[] {
  if (vertical ? a.x === b.x : a.y === b.y) return [a, b];
  if (vertical) {
    const m = grid((a.y + b.y) / 2);
    return [a, { x: a.x, y: m }, { x: b.x, y: m }, b];
  }
  const m = grid((a.x + b.x) / 2);
  return [a, { x: m, y: a.y }, { x: m, y: b.y }, b];
}

export function autoWire(page: Page, lib: Library, ids: readonly string[]): Pt[][] {
  const sel = new Set(ids);
  const syms = page.elements
    .filter((e): e is SymbolEl => e.kind === 'symbol' && sel.has(e.id))
    .map((el) => ({ el, pins: (lib.symbols.get(el.symbolId) ? pinWorld(lib.symbols.get(el.symbolId)!, el) : []) as Pin[] }))
    .filter((s) => s.pins.length > 0);
  if (syms.length < 2) return [];
  const xs = syms.map((s) => s.el.x), ys = syms.map((s) => s.el.y);
  const vertical = Math.max(...ys) - Math.min(...ys) >= Math.max(...xs) - Math.min(...xs);
  syms.sort((a, b) => (vertical ? a.el.y - b.el.y || a.el.x - b.el.x : a.el.x - b.el.x || a.el.y - b.el.y));

  const wires = page.elements.flatMap((e) => (e.kind === 'wire' ? [e.points] : []));
  const allPins = page.elements.flatMap((e) => (e.kind === 'symbol' && lib.symbols.get(e.symbolId) ? pinWorld(lib.symbols.get(e.symbolId)!, e) : []));
  const busy: Pt[] = [];
  const isBusy = (p: Pt) => busy.some((b) => samePt(b, p)) || wires.some((w) => pointOnPolyline(p, w)) || allPins.filter((q) => samePt(q, p)).length > 1;

  const out: Pt[][] = [];
  const [outDir, inDir] = vertical ? ['down', 'up'] : ['right', 'left'];
  const across = (p: Pt) => (vertical ? p.x : p.y);
  const along = (p: Pt) => (vertical ? p.y : p.x);
  for (let i = 0; i + 1 < syms.length; i++) {
    const outs = syms[i].pins.filter((p) => p.dir === outDir && !isBusy(p));
    const ins = syms[i + 1].pins.filter((p) => p.dir === inDir && !isBusy(p));
    // Nearest pairs first, so each pole goes to the pin straight across from it (ties: in reading order).
    const pairs = outs.flatMap((a) => ins.filter((b) => along(b) > along(a)).map((b) => ({ a, b, d: Math.abs(across(a) - across(b)) })));
    pairs.sort((p, q) => p.d - q.d || across(p.a) - across(q.a));
    const made: { a: Pin; b: Pin }[] = [];
    for (const { a, b } of pairs) {
      if (busy.some((x) => samePt(x, a) || samePt(x, b))) continue;
      busy.push(a, b);
      made.push({ a, b });
    }
    made.sort((p, q) => across(p.a) - across(q.a));
    for (const { a, b } of made) out.push(route({ x: a.x, y: a.y }, { x: b.x, y: b.y }, vertical));
  }
  return out;
}
