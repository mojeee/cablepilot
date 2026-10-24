// Page → drawing primitives: sheet furniture (frame, zones, title block, margin text), generated
// page bodies (cover, contents, data forms) and every element kind. Pure: used by the canvas, the
// PDF export, the tests and the performance budget.

import { dt, pick } from '../drawingText';
import { deviceIndex, interruptionPartners, refsOf, type DeviceIndex, type DeviceRepr } from '../devices';
import { bindValue } from '../forms';
import { withProjectSymbols, type Library } from '../library/types';
import type { El, FormEl, Page, Project, SymbolEl, TableEl, Template, WireEl } from '../model/types';
import { templateOf } from '../model/queries';
import { sheetMm } from '../sheets';
import { pageNumber, titleLabel, titleValue } from '../titleblock';
import { primBox, textWidth, unionBox, type Box, type Built, type Prim } from './primitives';
import { boxPinsWorld, boxPrims } from './box';
import { gfxPrims, graphicsFor, pinWorld, symbolXf, usesValue, xfPoint } from './symbol';
import { warningPrims } from './warning';
import { reportPrims } from './report';
import { coverPrims } from './cover';
import { pageRevision } from '../revisions';
import { pageNets } from '../connectivity';
import { applyLayer, layerLookup } from '../layers';
import { bundleLabel, colourHex, STRIPE_HEX, wireSpec } from '../wires';

export interface FrameRect {
  fx: number;
  fy: number;
  fw: number;
  fh: number;
}
export function frameRect(t: Template, w: number, h: number): FrameRect {
  const m = t.frame.margins;
  return { fx: m.l, fy: m.t, fw: w - m.l - m.r, fh: h - m.t - m.b };
}

const fit = (text: string, size: number, width: number): number => (textWidth(text, size) > width ? Math.max(1.2, width / (text.length * 0.55)) : size);

/** Frame, zone labels, margin text and title block. */
export function furniture(project: Project, page: Page, index: number): Prim[] {
  const t = templateOf(project, page);
  const st = project.settings.style;
  const lang = project.settings.drawingLanguage;
  const { w, h } = sheetMm(page.size);
  const { fx, fy, fw, fh } = frameRect(t, w, h);
  const out: Prim[] = [];
  const rect = (x: number, y: number, rw: number, rh: number, lw: number, c: string): Prim => ({ k: 'poly', pts: [x, y, x + rw, y, x + rw, y + rh, x, y + rh], closed: true, w: lw, c });
  const line = (x1: number, y1: number, x2: number, y2: number, lw: number, c: string): Prim => ({ k: 'poly', pts: [x1, y1, x2, y2], w: lw, c });
  const fc = st.colours.frame;
  out.push(rect(0, 0, w, h, 0.25, fc), rect(fx, fy, fw, fh, st.weights.frame, fc));
  const txt = (x: number, y: number, text: string, size: number, anchor: 'start' | 'middle' | 'end' = 'middle', rot = 0, c = fc, bold = false): Prim => ({ k: 'text', x, y: y + size * 0.36, text, size, anchor, rot, c, bold });
  const cols = t.frame.columns, rows = t.frame.rows;
  cols.forEach((label, i) => {
    const cx = fx + (fw / cols.length) * (i + 0.5);
    out.push(txt(cx, fy - 5, label, 3.5), txt(cx, fy + fh + 5, label, 3.5));
    if (i > 0) {
      const tx = fx + (fw / cols.length) * i;
      out.push(line(tx, fy - 5, tx, fy, 0.25, fc), line(tx, fy + fh, tx, fy + fh + 5, 0.25, fc));
    }
  });
  rows.forEach((label, i) => {
    const cy = fy + (fh / rows.length) * (i + 0.5);
    out.push(txt(fx - 5, cy, label, 3.5), txt(fx + fw + 5, cy, label, 3.5));
    if (i > 0) {
      const ty = fy + (fh / rows.length) * i;
      out.push(line(fx - 5, ty, fx, ty, 0.25, fc), line(fx + fw, ty, fx + fw + 5, ty, 0.25, fc));
    }
  });
  const margin = t.marginText ?? project.properties.copyright ?? '';
  if (margin) out.push(txt(w - 2, h / 2, margin, 2.2, 'middle', -90, fc));
  // Title block, bottom-right inside the frame.
  const tb = t.titleBlock;
  const ox = fx + fw - tb.w, oy = fy + fh - tb.h;
  const tc = st.colours.titleBlock;
  out.push(rect(ox, oy, tb.w, tb.h, st.weights.frame, tc));
  for (const c of tb.cells) {
    out.push(rect(ox + c.x, oy + c.y, c.w, c.h, 0.25, tc));
    if (c.key === 'logo') {
      const a = tb.logoAssetId ? project.assets[tb.logoAssetId] : undefined;
      if (a && tb.logoAssetId) {
        const pad = 2, bw = c.w - pad * 2, bh = c.h - pad * 2;
        const k = Math.min(bw / a.w, bh / a.h);
        out.push({ k: 'image', x: ox + c.x + (c.w - a.w * k) / 2, y: oy + c.y + (c.h - a.h * k) / 2, w: a.w * k, h: a.h * k, assetId: tb.logoAssetId });
      }
      continue;
    }
    const label = titleLabel(c.key, lang);
    if (label) out.push(txt(ox + c.x + 1, oy + c.y + 2.6, label, 1.8, 'start', 0, tc));
    const value = titleValue(c.key, project, page, index);
    if (value) {
      const big = c.key === 'sheetTitle';
      const size = fit(value, big ? 4.2 : 3.2, c.w - 3);
      out.push(txt(ox + c.x + 1.5, oy + c.y + c.h - 2.2 - size * 0.36, value, size, 'start', 0, tc, big));
    }
  }
  return out;
}

function formPrims(el: FormEl, project: Project, id: string): Prim[] {
  const lang = project.settings.drawingLanguage;
  const st = project.settings.style;
  const c = st.colours.text;
  const out: Prim[] = [];
  const rowH = 6.5, size = 3.2, valueX = el.w * 0.58;
  let y = el.y;
  const T = (x: number, yy: number, text: string, s = size, bold = false, anchor: 'start' | 'middle' | 'end' = 'start'): Prim => ({ k: 'text', x, y: yy + s * 0.36, text, size: s, anchor, rot: 0, c, bold, id });
  const box = (x: number, yy: number, bw: number, bh: number): Prim => ({ k: 'poly', pts: [x, yy, x + bw, yy, x + bw, yy + bh, x, yy + bh], closed: true, w: 0.25, c, id });
  const items = el.items;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.type === 'heading') {
      y += 2;
      out.push(T(el.x, y + rowH / 2, pick(it.label, lang), 3.8, true));
      out.push({ k: 'poly', pts: [el.x, y + rowH, el.x + el.w, y + rowH], w: 0.35, c, id });
      y += rowH + 1;
    } else if (it.type === 'text') {
      out.push(T(el.x + 1, y + rowH / 2, pick(it.label, lang)), box(el.x + valueX, y, el.w - valueX, rowH), T(el.x + valueX + 1.5, y + rowH / 2, bindValue(it.bind, project.properties, project.assembly)));
      y += rowH;
    } else if (it.type === 'table') {
      out.push(T(el.x, y + rowH / 2, pick(it.label, lang), size, true));
      y += rowH;
      for (const r of it.rows) {
        out.push(box(el.x, y, valueX, rowH), box(el.x + valueX, y, el.w - valueX, rowH), T(el.x + 1.5, y + rowH / 2, pick(r.label, lang)), T(el.x + valueX + 1.5, y + rowH / 2, bindValue(r.bind, project.properties, project.assembly)));
        y += rowH;
      }
      y += 1;
    } else {
      // A run of tick boxes sharing one bind sits on one line; the run wraps at the form width.
      let x = el.x + 1;
      let j = i;
      while (j < items.length) {
        const tk = items[j];
        if (tk.type !== 'tick' || tk.bind !== it.bind) break;
        const label = pick(tk.label, lang);
        const need = 7 + textWidth(label, size) + 4;
        if (x + need > el.x + el.w && x > el.x + 1) { x = el.x + 1; y += rowH; }
        const checked = bindValue(tk.bind, project.properties, project.assembly) === tk.value;
        out.push(box(x, y + 1.25, 4, 4));
        if (checked) out.push({ k: 'poly', pts: [x + 0.8, y + 3.2, x + 1.8, y + 4.6, x + 3.4, y + 1.8], w: 0.5, c, id });
        out.push(T(x + 5.5, y + rowH / 2, label));
        x += need;
        j++;
      }
      i = j - 1;
      y += rowH;
    }
  }
  return out;
}

function tablePrims(el: TableEl, c: string, w: number, id: string): Prim[] {
  const out: Prim[] = [];
  const totalW = el.colWidths.reduce((a, b) => a + b, 0);
  const totalH = el.rowHeight * el.cells.length;
  out.push({ k: 'poly', pts: [el.x, el.y, el.x + totalW, el.y, el.x + totalW, el.y + totalH, el.x, el.y + totalH], closed: true, w, c, id });
  let x = el.x;
  el.colWidths.forEach((cw, ci) => {
    if (ci > 0) out.push({ k: 'poly', pts: [x, el.y, x, el.y + totalH], w: w * 0.7, c, id });
    x += cw;
  });
  el.cells.forEach((row, ri) => {
    const y = el.y + ri * el.rowHeight;
    if (ri > 0) out.push({ k: 'poly', pts: [el.x, y, el.x + totalW, y], w: w * 0.7, c, id });
    let cx = el.x;
    row.forEach((cell, ci) => {
      const cw = el.colWidths[ci] ?? 0;
      if (cell) out.push({ k: 'text', x: cx + 1.2, y: y + el.rowHeight / 2 + el.size * 0.36, text: cell, size: Math.min(el.size, fit(cell, el.size, cw - 2)), anchor: 'start', rot: 0, c, bold: el.headerRow && ri === 0, id });
      cx += cw;
    });
  });
  return out;
}

/** Midpoint of the longest segment of a wire, with the segment's direction. */
export function longestSegment(pts: { x: number; y: number }[]): { mx: number; my: number; dx: number; dy: number } | null {
  let best = -1, res: { mx: number; my: number; dx: number; dy: number } | null = null;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > best) { best = len; res = { mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, dx: (b.x - a.x) / (len || 1), dy: (b.y - a.y) / (len || 1) }; }
  }
  return res;
}

/** Pin positions of a page as "x,y" keys: a wire's potential label stays away from them. */
function pinKeys(page: Page, lib: Library): Set<string> {
  const keys = new Set<string>();
  for (const e of page.elements) {
    if (e.kind !== 'symbol') continue;
    const def = lib.symbols.get(e.symbolId);
    if (def) for (const p of pinWorld(def, e)) keys.add(`${p.x},${p.y}`);
  }
  for (const e of page.elements) if (e.kind === 'box') for (const p of boxPinsWorld(e)) keys.add(`${p.x},${p.y}`);
  return keys;
}

function wirePrims(el: WireEl, project: Project, pins: Set<string>, netPot?: string, colourOn = false): Prim[] {
  const st = project.settings.style;
  const pts = el.points.flatMap((p) => [p.x, p.y]);
  const spec = wireSpec(project, el, netPot);
  // Conductors in their IEC 60757 colour (option); green-and-yellow is green with a yellow dashed stripe.
  const colour = colourOn ? colourHex(spec.colour) : st.colours.wire;
  const out: Prim[] = [{ k: 'poly', pts, w: el.bundle ? st.weights.wire * 2.5 : st.weights.wire, c: colour, id: el.id }];
  if (colourOn && spec.colour === 'GNYE') out.push({ k: 'poly', pts, w: st.weights.wire, c: STRIPE_HEX, dash: true, id: el.id });
  const seg = longestSegment(el.points);
  if (!seg) return out;
  // The label sits on the longest segment: above a horizontal wire, left of a vertical one (rotated to read upwards).
  const label = (text: string, c: string, s: number): Prim => (Math.abs(seg.dx) > Math.abs(seg.dy)
    ? { k: 'text', x: seg.mx, y: seg.my - 1.2, text, size: s, anchor: 'middle', rot: 0, c, id: el.id }
    : { k: 'text', x: seg.mx - 1.2, y: seg.my, text, size: s, anchor: 'middle', rot: -90, c, id: el.id });
  if (el.bundle) out.push(label(bundleLabel(spec), st.colours.wireNumber, st.textSizes.wireNumber));
  else if (el.number) out.push(label(el.number, st.colours.wireNumber, st.textSizes.wireNumber));
  if (el.cable) {
    // The cable and core this wire belongs to, on the other side of the wire from its number.
    const t = `${el.cable}${el.core ? `:${el.core}` : ''}`;
    out.push(Math.abs(seg.dx) > Math.abs(seg.dy)
      ? { k: 'text', x: seg.mx, y: seg.my + 3.4, text: t, size: 2.2, anchor: 'middle', rot: 0, c: st.colours.text, id: el.id }
      : { k: 'text', x: seg.mx + 3.4, y: seg.my, text: t, size: 2.2, anchor: 'middle', rot: -90, c: st.colours.text, id: el.id });
  }
  if (el.conductors && el.conductors > 1) {
    // n-conductor tick marks (IEC 60617 conductor symbols, single-line representation): up to three
    // slanted strokes, more than three as one stroke with the number (docs/to-verify.md).
    const n = el.conductors;
    const nx = -seg.dy, ny = seg.dx;
    const stroke = (off: number): Prim => ({ k: 'poly', pts: [seg.mx + seg.dx * off - nx * 1.6 - seg.dx * 0.8, seg.my + seg.dy * off - ny * 1.6 - seg.dy * 0.8, seg.mx + seg.dx * off + nx * 1.6 + seg.dx * 0.8, seg.my + seg.dy * off + ny * 1.6 + seg.dy * 0.8], w: st.weights.wire, c: st.colours.wire, id: el.id });
    if (n <= 3) for (let i = 0; i < n; i++) out.push(stroke((i - (n - 1) / 2) * 1.5));
    else {
      out.push(stroke(0));
      out.push({ k: 'text', x: seg.mx + nx * 3.2 - seg.dx * 0.5, y: seg.my + ny * 3.2 + 1, text: String(n), size: 2.5, anchor: 'middle', rot: 0, c: st.colours.wire, id: el.id });
    }
  }
  if (el.potential) {
    // The potential name sits at the end of the wire that is not on a symbol pin.
    const first = el.points[0], last = el.points[el.points.length - 1];
    const atStart = !pins.has(`${first.x},${first.y}`) || pins.has(`${last.x},${last.y}`);
    const p = atStart ? first : last;
    const label = project.potentials.find((x) => x.id === el.potential)?.label ?? el.potential;
    out.push({ k: 'text', x: p.x + 1, y: p.y + (atStart ? -1 : 3), text: label, size: 2.2, anchor: 'start', rot: 0, c: st.colours.text, id: el.id });
  }
  return out;
}

/** Where the cross-reference data comes from while drawing a page. */
export interface XrefCtx {
  idx: DeviceIndex;
  page: string;
  /** The library as given (without the project's embedded symbols): report caches key on it. */
  lib: Library;
}

const refText = (reps: DeviceRepr[]): string => {
  const pos = [...new Set(reps.map((r) => r.position))];
  return `[${pos.slice(0, 6).join(', ')}${pos.length > 6 ? ', ...' : ''}]`;
};

/**
 * The contact image under a coil: one row per contact or power part of the device, a small contact
 * symbol (make, break or main) and where it is drawn, then the optional note on the state shown.
 * Returns the primitives and the y after the image.
 */
function contactImage(contacts: DeviceRepr[], note: string, lx: number, y0: number, anchor: 'start' | 'end', colour: string, w: number, id: string): { prims: Prim[]; y: number } {
  const sign = anchor === 'end' ? -1 : 1;
  const out: Prim[] = [];
  let y = y0;
  const line = (x1: number, y1: number, x2: number, y2: number): Prim => ({ k: 'poly', pts: [x1, y1, x2, y2], w: w * 0.8, c: colour, id });
  const glyph = (gx: number, gy: number, nc: boolean) => {
    out.push(line(gx, gy, gx, gy + 1), line(gx, gy + 3.6, gx, gy + 4.6), line(gx, gy + 3.6, gx - 1.1, gy + 1.2));
    if (nc) out.push(line(gx - 1.4, gy + 1.5, gx + 0.5, gy + 1.5));
  };
  const sorted = contacts.slice().sort((a, b) => a.pageIndex - b.pageIndex || a.y - b.y || a.x - b.x).slice(0, 12);
  for (const c of sorted) {
    const gx = lx + sign * 3;
    if (c.contact === 'main') { glyph(gx - 1.6, y, false); glyph(gx, y, false); glyph(gx + 1.6, y, false); }
    else glyph(gx, y, c.contact === 'nc');
    out.push({ k: 'text', x: lx + sign * 7, y: y + 2.9, text: c.position, size: 2.2, anchor, rot: 0, c: colour, id });
    y += 5;
  }
  if (contacts.length > 12) { out.push({ k: 'text', x: lx, y: y + 1, text: '...', size: 2.2, anchor, rot: 0, c: colour, id }); y += 3; }
  for (const l of note.split('\n').filter(Boolean)) { out.push({ k: 'text', x: lx, y: y + 1.6, text: l, size: 2.2, anchor, rot: 0, c: colour, id }); y += 3; }
  return { prims: out, y };
}

export function symbolPrims(el: SymbolEl, project: Project, lib: Library, xref?: XrefCtx): Prim[] {
  const def = lib.symbols.get(el.symbolId);
  const st = project.settings.style;
  const lang = project.settings.drawingLanguage;
  const xf = symbolXf(el);
  if (!def) {
    // Unknown symbol (library missing): a visible marker, never a silent gap.
    return [{ k: 'poly', pts: [el.x - 4, el.y - 4, el.x + 4, el.y - 4, el.x + 4, el.y + 4, el.x - 4, el.y + 4], closed: true, w: 0.35, c: '#d40000', dash: true, id: el.id }, { k: 'text', x: el.x, y: el.y + 1, text: '?', size: 4, anchor: 'middle', rot: 0, c: '#d40000', id: el.id }];
  }
  const gfx = graphicsFor(def, project.settings.symbolStandard);
  const out = gfxPrims(gfx, xf, st.weights.symbol, st.colours.symbol, el.id, el.value ?? '');
  const lp = xfPoint({ ...xf, x: 0, y: 0 }, def.label?.x ?? 6, def.label?.y ?? 0);
  const anchor = lp.x < -0.01 ? 'end' : 'start';
  let y = el.y + lp.y;
  const lx = el.x + lp.x;
  const pageLoc = el.location;
  const des = (pageLoc ? `+${pageLoc}` : '') + el.designation + (def.function === 'terminal' && el.value ? `:${el.value}` : '');
  const sz = st.textSizes.designation;
  if (def.function === 'interruption') {
    // The signal name is in the graphics; below it, where the same signal continues.
    if (xref && el.value) {
      const partners = interruptionPartners(xref.idx, el.value, xref.page, el.id);
      const tp = xfPoint({ ...xf, x: 0, y: 0 }, 4, 6);
      if (partners.length) out.push({ k: 'text', x: el.x + tp.x, y: el.y + tp.y + 0.8, text: refText(partners), size: 2.2, anchor: 'middle', rot: 0, c: st.colours.text, id: el.id });
    }
    return out;
  }
  if (def.function === 'potential-tag') {
    if (el.value) out.push({ k: 'text', x: lx, y: y + 1, text: project.potentials.find((p) => p.id === el.value)?.label ?? el.value, size: 2.8, anchor: 'middle', rot: 0, c: st.colours.text, id: el.id });
    return out;
  }
  if (des) { out.push({ k: 'text', x: lx, y: y + sz * 0.36, text: des, size: sz, anchor, rot: 0, c: st.colours.designation, id: el.id }); y += sz * 1.25; }
  const ft = pick(el.functionText, lang);
  if (ft) {
    ft.split('\n').forEach((l) => { out.push({ k: 'text', x: lx, y: y + 1, text: l, size: 2.5, anchor, rot: 0, c: st.colours.text, id: el.id }); y += 3.1; });
  }
  if (el.value && !usesValue(gfx) && def.function !== 'terminal') { out.push({ k: 'text', x: lx, y: y + 1, text: el.value, size: 2.5, anchor, rot: 0, c: st.colours.text, id: el.id }); y += 3.1; }
  const info = xref ? refsOf(xref.idx, xref.page, el.id) : undefined;
  if (info) {
    if (info.rep.role === 'coil') {
      const note = pick(el.stateNote, lang);
      if (info.contacts.length || note) out.push(...contactImage(info.contacts, note, lx, y + 0.8, anchor, st.colours.text, st.weights.symbol, el.id).prims);
    } else if (def.function !== 'terminal') {
      const to = info.coils.length ? info.coils : info.others;
      if (to.length) out.push({ k: 'text', x: lx, y: y + 1, text: refText(to), size: 2.2, anchor, rot: 0, c: st.colours.text, id: el.id });
    }
  }
  return out;
}

function elementPrims(el: El, project: Project, page: Page, lib: Library, pins: Set<string>, xref: XrefCtx, netPot: Map<string, string | undefined>): Prim[] {
  const st = project.settings.style;
  switch (el.kind) {
    case 'symbol': return symbolPrims(el, project, lib, xref);
    case 'box': {
      const info = refsOf(xref.idx, xref.page, el.id);
      return boxPrims(el, project, info?.others.length ? refText(info.others) : undefined);
    }
    case 'wire': return wirePrims(el, project, pins, netPot.get(el.id), project.settings.wireColours);
    case 'report': return reportPrims(el, project, page, xref.lib);
    case 'junction': return [{ k: 'circle', cx: el.x, cy: el.y, r: 0.9, w: 0.2, c: st.colours.wire, fill: true, id: el.id }];
    case 'text': {
      const lines = el.text.split('\n');
      return lines.map((l, i): Prim => {
        const off = i * el.size * 1.25;
        const a = (el.rot * Math.PI) / 180;
        return { k: 'text', x: el.x - Math.sin(a) * off, y: el.y + el.size * 0.72 + Math.cos(a) * off, text: l, size: el.size, anchor: el.align === 'left' ? 'start' : el.align === 'center' ? 'middle' : 'end', rot: el.rot, c: st.colours.text, bold: el.bold, id: el.id };
      });
    }
    case 'line': return [{ k: 'poly', pts: el.points.flatMap((p) => [p.x, p.y]), w: st.weights.annotation, c: st.colours.annotation, dash: el.dashed, id: el.id }];
    case 'rect': {
      const out: Prim[] = [{ k: 'poly', pts: [el.x, el.y, el.x + el.w, el.y, el.x + el.w, el.y + el.h, el.x, el.y + el.h], closed: true, w: st.weights.annotation, c: st.colours.annotation, dash: el.dashed, id: el.id }];
      let ty = el.y + 3.4;
      if (el.assembly) { out.push({ k: 'text', x: el.x + 1.5, y: ty, text: el.assembly, size: st.textSizes.designation, anchor: 'start', rot: 0, c: st.colours.designation, id: el.id }); ty += st.textSizes.designation * 1.1; }
      if (el.label) out.push({ k: 'text', x: el.x + 1.5, y: ty, text: el.label, size: 2.8, anchor: 'start', rot: 0, c: st.colours.text, id: el.id });
      return out;
    }
    case 'circle': return [{ k: 'circle', cx: el.x, cy: el.y, r: el.r, w: st.weights.annotation, c: st.colours.annotation, dash: el.dashed, id: el.id }];
    case 'table': return tablePrims(el, st.colours.annotation, st.weights.annotation, el.id);
    case 'image': return [{ k: 'image', x: el.x, y: el.y, w: el.w, h: el.h, assetId: el.assetId, id: el.id }];
    case 'warning': return warningPrims(el.sign, el.x, el.y, el.size, st.colours.annotation, el.id);
    case 'form': return formPrims(el, project, el.id);
  }
}

/** Generated bodies of cover and contents pages (not selectable; they fill from the project). */
function generatedBody(project: Project, page: Page): Prim[] {
  const lang = project.settings.drawingLanguage;
  const st = project.settings.style;
  const t = templateOf(project, page);
  const { w, h } = sheetMm(page.size);
  const { fx, fy, fw, fh } = frameRect(t, w, h);
  const c = st.colours.text;
  const T = (x: number, y: number, text: string, size: number, bold = false, anchor: 'start' | 'middle' | 'end' = 'start'): Prim => ({ k: 'text', x, y, text, size, anchor, rot: 0, c, bold });
  const out: Prim[] = [];
  if (page.type === 'cover') return coverPrims(project, page);
  if (page.type === 'contents') {
    out.push(T(fx + 8, fy + 14, dt(lang, 'sheetIndex'), 7, true));
    const rowH = 6.2, top = fy + 26;
    const perCol = Math.max(1, Math.floor((fh - 26 - t.titleBlock.h - 8) / rowH));
    const colW = Math.min(150, (fw - 16) / 2);
    project.pages.forEach((p, i) => {
      const col = Math.floor(i / perCol);
      if (col > 1) return;
      const x = fx + 8 + col * (colW + 4), y = top + (i % perCol) * rowH;
      const rev = pageRevision(project, p.id);
      out.push(T(x, y, pageNumber(i + 1), 3.6, true), T(x + 12, y, pick(p.title, lang) || dt(lang, `type.${p.type}` as 'type.cover'), 3.6), T(x + colW, y, dt(lang, `type.${p.type}` as 'type.cover'), 2.8, false, 'end'));
      if (rev !== undefined) out.push(T(x + colW - 34, y, `${dt(lang, 'revision')} ${rev}`, 3, true, 'end'));
    });
    if (project.pages.length > perCol * 2) out.push(T(fx + 8, fy + fh - t.titleBlock.h - 4, '...', 4));
  }
  return out;
}

export function buildPage(project: Project, page: Page, libIn: Library, index: number): Built {
  const lib = withProjectSymbols(libIn, project.symbols);
  const { w, h } = sheetMm(page.size);
  const prims: Prim[] = furniture(project, page, index);
  prims.push(...generatedBody(project, page));
  const items: Built['items'] = [];
  const pins = pinKeys(page, lib);
  const xref: XrefCtx = { idx: deviceIndex(project, libIn), page: page.id, lib: libIn };
  const netPot = new Map<string, string | undefined>();
  if (project.settings.wireColours) for (const n of pageNets(project, page, libIn)) for (const w of n.wires) netPot.set(w, n.potential);
  const layerOfEl = layerLookup(project);
  for (const el of page.elements) {
    const layer = layerOfEl(el);
    if (!layer.on) continue;
    const ps = applyLayer(elementPrims(el, project, page, lib, pins, xref, netPot), layer);
    prims.push(...ps);
    const box = unionBox(ps.map(primBox));
    if (box) items.push({ id: el.id, box: box as Box });
  }
  return { prims, items, width: w, height: h };
}
