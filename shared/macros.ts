// Macros: a group of symbols, boxes and wires saved to the company library and placed again in
// any project (a company's standard boards). Placing copies the elements with new ids, moves them
// to the click, and gives their devices fresh designations (the contacts of a coil in the macro
// keep following that coil).

import type { MacroDef } from './library/types';
import type { El, Page, Project, Pt } from './model/types';
import { parseDesignation, usedNumbers } from './numbering';

/** Element kinds a macro can hold: drawing content only. */
const KINDS = new Set<El['kind']>(['symbol', 'box', 'wire', 'junction', 'text', 'line', 'rect', 'warning']);

function anchors(e: El): Pt[] {
  if (e.kind === 'wire' || e.kind === 'line') return e.points;
  if (e.kind === 'box' || e.kind === 'rect') return [{ x: e.x, y: e.y }, { x: e.x + e.w, y: e.y + e.h }];
  if ('x' in e) return [{ x: e.x, y: e.y }];
  return [];
}
const shift = (e: El, dx: number, dy: number): El => {
  if (e.kind === 'wire' || e.kind === 'line') return { ...e, points: e.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
  if ('x' in e) return { ...e, x: e.x + dx, y: e.y + dy } as El;
  return e;
};

/** Builds a macro from selected elements of a page. Coordinates become relative to the group's top-left corner. */
export function macroFromSelection(page: Page, ids: string[], meta: { id: string; title: { en: string; it: string }; category?: string }): MacroDef | null {
  const sel = new Set(ids);
  const els = page.elements.filter((e) => sel.has(e.id) && KINDS.has(e.kind));
  const pts = els.flatMap(anchors);
  if (els.length === 0 || pts.length === 0) return null;
  const x0 = Math.min(...pts.map((p) => p.x)), y0 = Math.min(...pts.map((p) => p.y));
  const x1 = Math.max(...pts.map((p) => p.x)), y1 = Math.max(...pts.map((p) => p.y));
  return {
    id: meta.id,
    kind: 'macro',
    title: meta.title,
    category: meta.category ?? 'company',
    source: 'Saved from a CablePilot project by the company',
    verification: 'secondary',
    verifiedFrom: 'Drawn by the user; the symbols it uses carry their own sources.',
    size: { w: x1 - x0, h: y1 - y0 },
    elements: els.map((e, i) => ({ ...shift(e, -x0, -y0), id: `m${i + 1}` }) as El),
  };
}

/**
 * The elements a macro adds to a page at a position. Ids are `${prefix}-${n}`. Every distinct
 * designation in the macro gets the next free number of its letter code on the page, so the macro
 * can be placed again and again; elements that shared a designation (coil and contacts) still do.
 */
export function placeMacro(project: Project, page: Page, macro: MacroDef, at: Pt, prefix: string): El[] {
  const fn = page.function ?? '';
  const map = new Map<string, string>();
  const assigned = new Map<string, Set<number>>();
  const designationOf = (e: El): string => (e.kind === 'symbol' || e.kind === 'box' ? e.designation : e.kind === 'rect' ? (e.assembly ?? '') : '');
  const locOf = (e: El): string => (e.kind === 'symbol' || e.kind === 'box' ? (e.location ?? page.location ?? '') : (page.location ?? ''));
  for (const e of macro.elements) {
    const old = designationOf(e);
    const letters = old ? parseDesignation(old).letters : undefined;
    if (!old || !letters || map.has(old)) continue;
    const loc = locOf(e);
    const k = `${loc}|${letters}`;
    const used = new Set([...usedNumbers(project, fn, loc, letters), ...(assigned.get(k) ?? [])]);
    let n = 1;
    while (used.has(n)) n++;
    assigned.set(k, (assigned.get(k) ?? new Set()).add(n));
    map.set(old, `-${letters}${n}`);
  }
  return macro.elements.map((e, i): El => {
    const moved = shift(e, at.x, at.y);
    const id = `${prefix}-${i + 1}`;
    if (moved.kind === 'symbol' || moved.kind === 'box') return { ...moved, id, designation: map.get(moved.designation) ?? moved.designation, ...(moved.kind === 'box' && moved.mate ? { mate: map.get(moved.mate) ?? moved.mate } : {}) };
    if (moved.kind === 'rect' && moved.assembly) return { ...moved, id, assembly: map.get(moved.assembly) ?? moved.assembly };
    return { ...moved, id };
  });
}
