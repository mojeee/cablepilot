// Report elements on a page: a live table (or the symbol legend, or the nameplate labels) drawn
// from shared/reports.ts, a window of `rows` rows from `offset`, so a long report continues on the
// next page. Pure display primitives, like everything in shared/draw.

import { newId } from '../ids';
import type { Command } from '../commands';
import { gfxPrims, graphicsFor } from './symbol';
import { frameRect } from './page';
import { withProjectSymbols, type Library } from '../library/types';
import { templateOf } from '../model/queries';
import type { Page, Project, ReportEl, ReportId } from '../model/types';
import { nameplateLabels, reportTable, usedSymbols } from '../reports';
import { rt } from '../reportText';
import { sheetMm } from '../sheets';
import { textWidth, type Prim } from './primitives';

const ROW_H: Partial<Record<ReportId, number>> = { legend: 14 };
const rowHeight = (id: ReportId): number => ROW_H[id] ?? 6;
const PLATE_W = 62, PLATE_H = 22;
const TITLE_H = 12;

/** Row count of a report: table rows, or nameplate labels. */
export function reportRows(project: Project, lib: Library, id: ReportId): number {
  return id === 'nameplates' ? nameplateLabels(project, lib).length : reportTable(project, lib, id).rows.length;
}

/** How many rows of a report fit on a page below y (header row and title taken off). */
export function reportCapacity(project: Project, page: Page, id: ReportId, y: number): number {
  const t = templateOf(project, page);
  const { w, h } = sheetMm(page.size);
  const f = frameRect(t, w, h);
  const free = f.fy + f.fh - t.titleBlock.h - 6 - y - TITLE_H;
  if (id === 'nameplates') return Math.max(1, Math.floor(free / (PLATE_H + 3)) * Math.max(1, Math.floor((f.fw - 20) / (PLATE_W + 3))));
  return Math.max(1, Math.floor(free / rowHeight(id)) - 1);
}

/** Shrinks text that would run out of its cell (capitals are wide: 0.64 of the size per character). */
const fit = (text: string, size: number, width: number): number => (text.length * size * 0.64 > width ? Math.max(1.2, width / (text.length * 0.64)) : size);

export function reportPrims(el: ReportEl, project: Project, page: Page, libIn: Library): Prim[] {
  const lib = withProjectSymbols(libIn, project.symbols);
  const st = project.settings.style;
  const lang = project.settings.drawingLanguage;
  const c = st.colours.text;
  const t = templateOf(project, page);
  const { w, h } = sheetMm(page.size);
  const f = frameRect(t, w, h);
  const out: Prim[] = [];
  const id = el.id;
  const T = (x: number, y: number, text: string, size: number, bold = false, colour = c): Prim => ({ k: 'text', x, y: y + size * 0.36, text, size, anchor: 'start', rot: 0, c: colour, bold, id });
  const total = reportRows(project, lib, el.report);
  const end = el.rows > 0 ? Math.min(total, el.offset + el.rows) : total;
  const table = reportTable(project, libIn, el.report);
  out.push(T(el.x, el.y + 4, table.title, 5, true));
  if (el.offset > 0) out.push(T(el.x + textWidth(table.title, 5) + 4, el.y + 4, `(${el.offset + 1}-${end} / ${total})`, 3));
  const top = el.y + TITLE_H;
  if (el.report === 'nameplates') {
    const labels = nameplateLabels(project, libIn).slice(el.offset, end);
    const per = Math.max(1, Math.floor((f.fw - (el.x - f.fx) - 10) / (PLATE_W + 3)));
    labels.forEach((n, i) => {
      const x = el.x + (i % per) * (PLATE_W + 3), y = top + Math.floor(i / per) * (PLATE_H + 3);
      out.push({ k: 'poly', pts: [x, y, x + PLATE_W, y, x + PLATE_W, y + PLATE_H, x, y + PLATE_H], closed: true, w: 0.35, c: st.colours.annotation, id });
      n.lines.slice(0, 4).forEach((l, li) => {
        const size = li === 0 ? 4 : 3;
        out.push({ k: 'text', x: x + PLATE_W / 2, y: y + 5 + li * 4.6 + size * 0.36, text: l, size: fit(l, size, PLATE_W - 3), anchor: 'middle', rot: 0, c, bold: li === 0, id });
      });
    });
    return out;
  }
  const W = Math.max(60, f.fx + f.fw - el.x - 10);
  const sum = table.widths.reduce((a, b) => a + b, 0);
  const cw = table.widths.map((x) => (x / sum) * W);
  const rh = rowHeight(el.report);
  const rowsShown = table.rows.slice(el.offset, end);
  const totalH = rh * (rowsShown.length + 1);
  const line = (x1: number, y1: number, x2: number, y2: number, lw: number): Prim => ({ k: 'poly', pts: [x1, y1, x2, y2], w: lw, c: st.colours.annotation, id });
  const drawRow = (cells: string[], y: number, bold: boolean, shade: boolean) => {
    if (shade) out.push({ k: 'poly', pts: [el.x, y, el.x + W, y, el.x + W, y + rh, el.x, y + rh], closed: true, fill: true, w: 0.05, c: '#e6e6e6', id });
    let x = el.x;
    cells.forEach((cell, i) => {
      if (cell) out.push({ k: 'text', x: x + 1.2, y: y + rh / 2 + 1, text: cell, size: fit(cell, 3, cw[i] - 2), anchor: 'start', rot: 0, c, bold, id });
      x += cw[i] ?? 0;
    });
  };
  drawRow(table.headers, top, true, true);
  rowsShown.forEach((r, i) => drawRow(r.cells, top + rh * (i + 1), !!r.heading, !!r.heading));
  out.push({ k: 'poly', pts: [el.x, top, el.x + W, top, el.x + W, top + totalH, el.x, top + totalH], closed: true, w: st.weights.annotation, c: st.colours.annotation, id });
  for (let i = 1; i <= rowsShown.length; i++) out.push(line(el.x, top + rh * i, el.x + W, top + rh * i, st.weights.annotation * 0.6));
  let x = el.x;
  cw.slice(0, -1).forEach((wd) => { x += wd; out.push(line(x, top, x, top + totalH, st.weights.annotation * 0.6)); });
  if (el.report === 'legend') {
    // The symbol graphics sit in the first column of each row.
    const used = table.rows.slice(el.offset, end);
    const idsInOrder = usedSymbolIds(project, libIn);
    used.forEach((_, i) => {
      const def = lib.symbols.get(idsInOrder[el.offset + i]);
      if (!def) return;
      out.push(...gfxPrims(graphicsFor(def, project.settings.symbolStandard), { x: el.x + cw[0] / 2, y: top + rh * (i + 1) + rh / 2, rot: 0, mirror: false }, st.weights.symbol, st.colours.symbol, id));
    });
  }
  if (table.note) out.push(T(el.x, top + totalH + 4, table.note, 2.8));
  return out;
}

const usedSymbolIds = (project: Project, lib: Library): string[] => usedSymbols(project, lib).map((u) => u.id);

const PAGE_TYPE: Partial<Record<ReportId, Page['type']>> = { terminals: 'terminals', cables: 'cables', bom: 'bom', contents: 'contents' };

/** Commands that add the pages a report needs: as many pages as the rows take. */
export function reportPageCommands(project: Project, lib: Library, ids: ReportId[], at?: number, mkId: (prefix: string) => string = newId): Command[] {
  const lang = project.settings.drawingLanguage;
  const cmds: Command[] = [];
  let index = at ?? project.pages.length;
  const size = project.settings.defaultSize;
  for (const id of ids) {
    const total = reportRows(project, lib, id);
    const probe: Page = { id: 'probe', type: 'report', title: {}, size, templateId: '', elements: [] };
    const y0 = frameRect(templateOf(project, probe), sheetMm(size).w, sheetMm(size).h).fy + 8;
    const cap = reportCapacity(project, probe, id, y0);
    const pages = Math.max(1, Math.ceil(total / cap));
    const x0 = frameRect(templateOf(project, probe), sheetMm(size).w, sheetMm(size).h).fx + 8;
    for (let p = 0; p < pages; p++) {
      const title = rt(lang, `report.${id}` as 'report.bom');
      const page: Page = { id: mkId('pg'), type: PAGE_TYPE[id] === 'contents' ? 'report' : (PAGE_TYPE[id] ?? 'report'), title: { [lang]: pages > 1 ? `${title} ${p + 1}/${pages}` : title }, size, templateId: '', elements: [{ id: mkId('r'), kind: 'report', x: x0, y: y0, report: id, offset: p * cap, rows: cap }] };
      cmds.push({ type: 'page/add', page, index: index++ });
    }
  }
  return cmds;
}

/** Commands that add continuation pages for reports whose rows no longer fit on the pages that show them. */
export function reportSyncCommands(project: Project, lib: Library): Command[] {
  const last = new Map<ReportId, { pageIndex: number; el: ReportEl; page: Page }>();
  project.pages.forEach((pg, i) => {
    for (const e of pg.elements) if (e.kind === 'report' && e.rows > 0 && (!last.has(e.report) || e.offset >= (last.get(e.report) as { el: ReportEl }).el.offset)) last.set(e.report, { pageIndex: i, el: e, page: pg });
  });
  const cmds: Command[] = [];
  for (const [id, l] of last) {
    const total = reportRows(project, lib, id);
    let offset = l.el.offset + l.el.rows;
    let at = l.pageIndex + 1;
    while (offset < total) {
      const title = rt(project.settings.drawingLanguage, `report.${id}` as 'report.bom');
      const page: Page = { id: newId('pg'), type: l.page.type, title: { [project.settings.drawingLanguage]: title }, size: l.page.size, templateId: l.page.templateId, elements: [{ ...l.el, id: newId('r'), offset }] };
      cmds.push({ type: 'page/add', page, index: at++ });
      offset += l.el.rows;
    }
  }
  return cmds;
}
