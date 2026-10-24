// Drawing the cabinet layout (M6 part 3): the items of a layout page as display primitives (the same
// vocabulary as every other page, so canvas, PDF and DXF share it), the generated side view and the
// sheet: a layout page is drawn in real millimetres and the sheet gets it at a standard scale (the
// text sizes and line weights are scaled so they come out at the drawing style's sizes on paper).

import { dt } from '../drawingText';
import { findPart } from '../library/types';
import type { Library } from '../library/types';
import { templateOf } from '../model/queries';
import type { CabEl, Page, Project } from '../model/types';
import { sheetMm } from '../sheets';
import type { Prim } from '../draw/primitives';
import { cabinetOf, isCab, isLayoutPage, scaleFor, type Cabinet } from './model';

/** The drawing area of a sheet for a layout page: inside the frame, above a band for the title block. */
export function drawingArea(project: Project, page: Page): { x: number; y: number; w: number; h: number } {
  const t = templateOf(project, page);
  const { w, h } = sheetMm(page.size);
  const m = t.frame.margins;
  const fx = m.l, fy = m.t, fw = w - m.l - m.r, fh = h - m.t - m.b;
  const top = 16;
  return { x: fx + 8, y: fy + top, w: fw - 16, h: fh - top - t.titleBlock.h - 6 };
}

/** The reduction scale (1:n) a layout page is drawn at on its sheet. */
export function layoutScale(project: Project, page: Page): number {
  if (!isLayoutPage(page)) return 1;
  const a = drawingArea(project, page);
  return scaleFor(page.layout.w, page.layout.h, a.w, a.h);
}

interface Ctx {
  project: Project;
  lib: Library;
  /** Scale denominator: sizes in model millimetres are the paper sizes times this. */
  s: number;
  lang: 'en' | 'it';
}

const poly = (pts: number[], w: number, c: string, id?: string, o: { closed?: boolean; dash?: boolean } = {}): Prim => ({ k: 'poly', pts, w, c, id, ...(o.closed ? { closed: true } : {}), ...(o.dash ? { dash: true } : {}) });
const rect = (x: number, y: number, w: number, h: number, lw: number, c: string, id?: string, dash = false): Prim => poly([x, y, x + w, y, x + w, y + h, x, y + h], lw, c, id, { closed: true, dash });
const text = (x: number, y: number, t: string, size: number, c: string, id?: string, o: { anchor?: 'start' | 'middle' | 'end'; rot?: number; bold?: boolean } = {}): Prim => ({ k: 'text', x, y: y + size * 0.36, text: t, size, anchor: o.anchor ?? 'middle', rot: o.rot ?? 0, c, bold: o.bold, id });

/** Diagonal hatch lines inside a rectangle, 45 degrees, clipped to it. */
export function hatch(x: number, y: number, w: number, h: number, step: number, lw: number, c: string, id?: string): Prim[] {
  const out: Prim[] = [];
  for (let k = x - (y + h); k <= x + w - y; k += step) {
    // The line y' = x' - k through the rectangle.
    const xa = Math.max(x, y + k), xb = Math.min(x + w, y + h + k);
    if (xb - xa > 0.01) out.push(poly([xa, xa - k, xb, xb - k], lw, c, id));
  }
  return out;
}

/** The product part of a full designation ("=A+B-K1" gives "-K1"). */
export const shortDesignation = (key: string): string => /-[A-Z]+\d+[A-Za-z]*(?!.*-[A-Z])/.exec(key)?.[0] ?? key;

function dimPrims(e: CabEl, c: string, lw: number, s: number): Prim[] {
  const len = Math.hypot(e.w, e.h);
  if (len < 1e-6) return [];
  const ux = e.w / len, uy = e.h / len, nx = -uy, ny = ux;
  const off = e.d ?? 30;
  const ext = 3 * s * Math.sign(off || 1);
  const p0 = { x: e.x + nx * off, y: e.y + ny * off }, p1 = { x: e.x + e.w + nx * off, y: e.y + e.h + ny * off };
  const a = 2.5 * s;
  const arrow = (p: { x: number; y: number }, dir: number): Prim => poly([p.x, p.y, p.x - dir * ux * a + uy * a * 0.3, p.y - dir * uy * a - ux * a * 0.3, p.x - dir * ux * a - uy * a * 0.3, p.y - dir * uy * a + ux * a * 0.3], lw, c, e.id, { closed: true });
  const label = e.note || String(Math.round(len * 10) / 10);
  const horizontal = Math.abs(ux) >= Math.abs(uy);
  const mid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
  return [
    poly([e.x, e.y, p0.x + nx * ext, p0.y + ny * ext], lw * 0.7, c, e.id),
    poly([e.x + e.w, e.y + e.h, p1.x + nx * ext, p1.y + ny * ext], lw * 0.7, c, e.id),
    poly([p0.x, p0.y, p1.x, p1.y], lw, c, e.id),
    arrow(p0, -1), arrow(p1, 1),
    horizontal ? text(mid.x, mid.y - 2.2 * s, label, 3 * s, c, e.id) : text(mid.x - 2.2 * s, mid.y, label, 3 * s, c, e.id, { rot: -90 }),
  ];
}

/** Primitives of one layout item, in real millimetres on the page. */
export function cabPrims(e: CabEl, ctx: Ctx): Prim[] {
  const st = ctx.project.settings.style;
  const s = ctx.s;
  const lw = st.weights.symbol * s, aw = st.weights.annotation * s;
  const line = st.colours.symbol, ann = st.colours.annotation, txt = st.colours.text, des = st.colours.designation;
  const ts = 3 * s;
  switch (e.item) {
    case 'enclosure': {
      const label = `${e.designation ?? ''}  ${Math.round(e.w)} x ${Math.round(e.h)} x ${Math.round(e.d ?? 0)}`.trim();
      return [rect(e.x, e.y, e.w, e.h, lw * 2.2, line, e.id), text(e.x + 3 * s, e.y - 3 * s, label, ts, txt, e.id, { anchor: 'start' })];
    }
    case 'plate': return [rect(e.x, e.y, e.w, e.h, lw, line, e.id, true), text(e.x + 2 * s, e.y + 3.4 * s, `${dt(ctx.lang, 'layout.plate')} ${Math.round(e.w)} x ${Math.round(e.h)}`, 2.4 * s, txt, e.id, { anchor: 'start' })];
    case 'rail': {
      const horizontal = e.w >= e.h;
      const out: Prim[] = [rect(e.x, e.y, e.w, e.h, lw * 0.8, line, e.id)];
      out.push(horizontal ? poly([e.x, e.y + e.h / 2, e.x + e.w, e.y + e.h / 2], lw * 0.5, line, e.id, { dash: true }) : poly([e.x + e.w / 2, e.y, e.x + e.w / 2, e.y + e.h], lw * 0.5, line, e.id, { dash: true }));
      if (e.designation) out.push(horizontal ? text(e.x + e.w - 1 * s, e.y + e.h + 2.6 * s, e.designation, 2.2 * s, txt, e.id, { anchor: 'end' }) : text(e.x + e.w + 2 * s, e.y + 3 * s, e.designation, 2.2 * s, txt, e.id, { anchor: 'start' }));
      return out;
    }
    case 'duct': {
      const horizontal = e.w >= e.h;
      const out: Prim[] = [rect(e.x, e.y, e.w, e.h, lw, line, e.id)];
      const t = Math.min(e.w, e.h) * 0.22;
      out.push(horizontal ? poly([e.x, e.y + t, e.x + e.w, e.y + t], lw * 0.5, line, e.id) : poly([e.x + t, e.y, e.x + t, e.y + e.h], lw * 0.5, line, e.id));
      out.push(horizontal ? poly([e.x, e.y + e.h - t, e.x + e.w, e.y + e.h - t], lw * 0.5, line, e.id) : poly([e.x + e.w - t, e.y, e.x + e.w - t, e.y + e.h], lw * 0.5, line, e.id));
      if (e.designation) out.push(text(e.x + e.w / 2, e.y + e.h / 2, `${e.designation}`, Math.min(2.4 * s, Math.min(e.w, e.h) * 0.5), txt, e.id, horizontal ? {} : { rot: -90 }));
      return out;
    }
    case 'device': {
      const out: Prim[] = [rect(e.x, e.y, e.w, e.h, lw, line, e.id)];
      if (e.outline?.assetId) out.push({ k: 'image', x: e.x, y: e.y, w: e.w, h: e.h, assetId: e.outline.assetId, id: e.id });
      for (const pl of e.outline?.polys ?? []) out.push(poly(pl.map((v, i) => (i % 2 === 0 ? e.x + v : e.y + v)), lw * 0.7, line, e.id));
      const name = shortDesignation(e.designation ?? '');
      const rec = ctx.project.devices.find((d) => d.designation === e.designation);
      const part = rec?.parts[0] ? findPart(ctx.lib, ctx.project.parts, rec.parts[0].part) : undefined;
      const size = Math.min(2.8 * s, e.w * 0.9 / Math.max(1, name.length * 0.55), e.h * 0.4);
      const vertical = e.w < e.h * 0.45 && e.w < 14 * s;
      if (size >= 1.0 * s || vertical) out.push(vertical ? text(e.x + e.w / 2, e.y + e.h / 2, name, Math.min(2.4 * s, e.w * 0.8), des, e.id, { rot: -90 }) : text(e.x + e.w / 2, e.y + e.h / 2 - (part ? 1.2 * s : 0), name, size, des, e.id));
      if (part && !vertical && e.h > 7 * s && e.w > 12 * s) out.push(text(e.x + e.w / 2, e.y + e.h / 2 + 2.4 * s, part.code.replace(/^GEN-/, ''), Math.min(1.8 * s, e.w * 0.9 / Math.max(1, part.code.length * 0.55)), txt, e.id));
      if (e.locked) out.push(poly([e.x + e.w - 3 * s, e.y, e.x + e.w, e.y, e.x + e.w, e.y + 3 * s], lw, line, e.id, { closed: true }));
      return out;
    }
    case 'zone': {
      const out = [rect(e.x, e.y, e.w, e.h, aw, ann, e.id, true), ...hatch(e.x, e.y, e.w, e.h, 4 * s, aw * 0.5, ann, e.id)];
      out.push(text(e.x + e.w / 2, e.y + e.h / 2, e.note || dt(ctx.lang, 'layout.noMount'), Math.min(2.6 * s, e.w * 0.9 / Math.max(1, (e.note || dt(ctx.lang, 'layout.noMount')).length * 0.55)), txt, e.id));
      return out;
    }
    case 'cover': return [rect(e.x, e.y, e.w, e.h, aw, ann, e.id), poly([e.x, e.y, e.x + e.w, e.y + e.h], aw * 0.5, ann, e.id), poly([e.x + e.w, e.y, e.x, e.y + e.h], aw * 0.5, ann, e.id), text(e.x + e.w / 2, e.y - 2.2 * s, e.note || dt(ctx.lang, 'layout.cover'), 2.6 * s, txt, e.id)];
    case 'dim': return dimPrims(e, ann, aw, s);
  }
}

/** The generated side view: the enclosure seen from the side (depth across, height up), the plate at the back, plate devices out from it, door devices in from the door. */
export function sidePrims(cab: Cabinet, ctx: Ctx, ox: number, oy: number): Prim[] {
  const enc = cab.enclosure;
  if (!enc) return [];
  const st = ctx.project.settings.style;
  const s = ctx.s;
  const lw = st.weights.symbol * s, aw = st.weights.annotation * s;
  const line = st.colours.symbol, ann = st.colours.annotation, txt = st.colours.text, des = st.colours.designation;
  const D = enc.d ?? 300;
  const out: Prim[] = [rect(ox, oy, D, enc.h, lw * 2.2, line)];
  const plate = cab.plate;
  const py = plate ? plate.y - enc.y : 0, ph = plate ? plate.h : enc.h;
  out.push(rect(ox, oy + py, plate?.d ?? 3, ph, lw, line));
  // The door: a thick line on the front side.
  out.push(poly([ox + D, oy, ox + D, oy + enc.h], lw * 2.2, line));
  for (const p of cab.devices) {
    const e = p.el;
    const door = cab.doors.includes(p.page);
    const frame = door ? p.page.elements.find((x): x is CabEl => isCab(x) && x.item === 'enclosure') : enc;
    const y = oy + e.y - (frame?.y ?? 0);
    const d = e.d ?? 60;
    const x = door ? ox + D - d : ox + (plate?.d ?? 3);
    out.push(rect(x, y, d, e.h, lw * 0.8, line, undefined, door));
    if (e.h > 6 * s && d > 8 * s) out.push(text(x + d / 2, y + e.h / 2, shortDesignation(e.designation ?? ''), Math.min(2.4 * s, d * 0.9 / 3, e.h * 0.4), des));
  }
  // Dimensions: enclosure depth below, height on the left, the deepest plate device's depth.
  out.push(...dimPrims({ id: 'sv-d', kind: 'cab', item: 'dim', x: ox, y: oy + enc.h, w: D, h: 0, d: 14 * s }, ann, aw, s));
  out.push(...dimPrims({ id: 'sv-h', kind: 'cab', item: 'dim', x: ox, y: oy, w: 0, h: enc.h, d: 14 * s }, ann, aw, s));
  const plateDevs = cab.devices.filter((p) => !cab.doors.includes(p.page));
  const deepest = plateDevs.reduce<CabEl | null>((a, p) => (!a || (p.el.d ?? 0) > (a.d ?? 0) ? p.el : a), null);
  if (deepest) out.push(...dimPrims({ id: 'sv-m', kind: 'cab', item: 'dim', x: ox + (plate?.d ?? 3), y: oy - 0, w: deepest.d ?? 0, h: 0, d: -14 * s }, ann, aw, s));
  out.push(text(ox + D / 2, oy - 28 * s, `${dt(ctx.lang, 'layout.depth')} ${Math.round(D)}`, 3 * s, txt));
  return out;
}

/** The door's note on the flexible cable to the plate: half the door height plus the depth, rounded up to 10 mm (a planning figure, not a standard value). */
export const doorCableMm = (enc: CabEl): number => Math.ceil((enc.h / 2 + (enc.d ?? 300)) / 10) * 10;

/** The generated and fixed content of a layout page in real millimetres: item primitives with ids, plus the door note or the side view. */
export function layoutBody(project: Project, page: Page, lib: Library): Prim[] {
  if (!isLayoutPage(page)) return [];
  const lang = project.settings.drawingLanguage;
  const s = layoutScale(project, page);
  const ctx: Ctx = { project, lib, s, lang };
  const view = page.layout.view;
  if (view === 'side') {
    const cab = cabinetOf(project);
    return sidePrims(cab, ctx, 140, 140);
  }
  const out: Prim[] = [];
  if (view === 'door') {
    const enc = page.elements.find((e): e is CabEl => isCab(e) && e.item === 'enclosure');
    if (enc && page.elements.some((e) => isCab(e) && e.item === 'device')) out.push(text(enc.x, enc.y + enc.h + 8 * s, dt(lang, 'layout.cableNote').replace('{n}', String(doorCableMm(enc))), 2.8 * s, project.settings.style.colours.text, undefined, { anchor: 'start' }));
  }
  return out;
}

/** Moves and scales primitives (page to sheet): coordinates by k and an offset, line weights and text sizes by k. */
export function transformPrims(prims: Prim[], k: number, ox: number, oy: number): Prim[] {
  return prims.map((p): Prim => {
    switch (p.k) {
      case 'poly': return { ...p, pts: p.pts.map((v, i) => (i % 2 === 0 ? ox + v * k : oy + v * k)), w: p.w * k };
      case 'circle': return { ...p, cx: ox + p.cx * k, cy: oy + p.cy * k, r: p.r * k, w: p.w * k };
      case 'arc': return { ...p, cx: ox + p.cx * k, cy: oy + p.cy * k, r: p.r * k, w: p.w * k };
      case 'text': return { ...p, x: ox + p.x * k, y: oy + p.y * k, size: p.size * k };
      case 'image': return { ...p, x: ox + p.x * k, y: oy + p.y * k, w: p.w * k, h: p.h * k };
    }
  });
}

/** The caption above a layout drawing on the sheet: its title and the scale. */
export function layoutCaption(project: Project, page: Page): string {
  if (!isLayoutPage(page)) return '';
  const lang = project.settings.drawingLanguage;
  const title = dt(lang, page.layout.view === 'front' ? 'layout.front' : page.layout.view === 'door' ? 'layout.door' : 'layout.side');
  return `${title}    ${dt(lang, 'layout.scale')} 1:${layoutScale(project, page)}`;
}
