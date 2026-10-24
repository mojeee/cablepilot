// The generated cover sheet (M4, rule 11): title and project data, the sheet index with the revision
// of every sheet (which revisions changed it), the revision list, the issue status boxes, the number
// of units to build and the customer approval and signature block. Everything is computed from the
// project (rule 1); texts follow the drawing language.

import { dt, pick } from '../drawingText';
import { templateOf } from '../model/queries';
import type { Page, Project } from '../model/types';
import { ISSUE_STATUSES } from '../model/types';
import { pageRevision, revisionMatrix } from '../revisions';
import { sheetMm } from '../sheets';
import { pageNumber } from '../titleblock';
import { textWidth, type Prim } from './primitives';

const MAX_REV_COLS = 6;
const MAX_REV_ROWS = 8;

export function coverPrims(project: Project, page: Page): Prim[] {
  const lang = project.settings.drawingLanguage;
  const st = project.settings.style;
  const t = templateOf(project, page);
  const { w, h } = sheetMm(page.size);
  const m = t.frame.margins;
  const fx = m.l, fy = m.t, fw = w - m.l - m.r, fh = h - m.t - m.b;
  const c = st.colours.text, ac = st.colours.annotation, lw = st.weights.annotation;
  const out: Prim[] = [];
  const fit = (text: string, size: number, width: number) => (textWidth(text, size) > width ? Math.max(1.4, (size * width) / textWidth(text, size)) : size);
  const T = (x: number, y: number, text: string, size: number, o: { bold?: boolean; anchor?: 'start' | 'middle' | 'end'; width?: number } = {}) => {
    if (text) out.push({ k: 'text', x, y: y + size * 0.36, text, size: o.width ? fit(text, size, o.width) : size, anchor: o.anchor ?? 'start', rot: 0, c, bold: o.bold });
  };
  const rect = (x: number, y: number, rw: number, rh: number, weight = lw) => out.push({ k: 'poly', pts: [x, y, x + rw, y, x + rw, y + rh, x, y + rh], closed: true, w: weight, c: ac });
  const line = (x1: number, y1: number, x2: number, y2: number, weight = lw * 0.6) => out.push({ k: 'poly', pts: [x1, y1, x2, y2], w: weight, c: ac });
  const shade = (x: number, y: number, rw: number, rh: number) => out.push({ k: 'poly', pts: [x, y, x + rw, y, x + rw, y + rh, x, y + rh], closed: true, fill: true, w: 0.05, c: '#e6e6e6' });

  // Title block of the cover: heading, project name and the project data.
  const logo = t.titleBlock.logoAssetId ? project.assets[t.titleBlock.logoAssetId] : undefined;
  if (logo && t.titleBlock.logoAssetId) {
    const k = Math.min(60 / logo.w, 26 / logo.h);
    out.push({ k: 'image', x: fx + fw - 8 - logo.w * k, y: fy + 8, w: logo.w * k, h: logo.h * k, assetId: t.titleBlock.logoAssetId });
  }
  T(fx + 8, fy + 12, dt(lang, 'electricalDrawings'), 6);
  T(fx + 8, fy + 24, project.name, 11, { bold: true, width: fw - 90 });
  let y = fy + 34;
  for (const k of ['client', 'product', 'orderNo', 'drawingNo'] as const) {
    const v = project.properties[k];
    if (v) { T(fx + 8, y, `${dt(lang, k)}:`, 3.6); T(fx + 36, y, v, 3.6, { bold: true, width: 150 }); y += 5.5; }
  }

  // Sheet index with the revision of every sheet.
  const top = fy + 62;
  const leftW = Math.min(fw * 0.52, fw - t.titleBlock.w - 14);
  const mat = revisionMatrix(project);
  const cols = mat.slice(-MAX_REV_COLS);
  const revW = 9;
  const noW = 10;
  const titleW = leftW - noW - revW * (cols.length + 1);
  T(fx + 8, top - 4.5, dt(lang, 'sheetIndex'), 5.5, { bold: true });
  const rh = 5.2;
  const rows = Math.max(1, Math.floor((fy + fh - 8 - top - rh) / rh));
  const shown = project.pages.slice(0, rows);
  const tableH = rh * (shown.length + 1);
  shade(fx + 8, top, leftW, rh);
  T(fx + 8 + 1.5, top + rh / 2, dt(lang, 'sheet'), 2.8, { bold: true, width: noW - 2 });
  T(fx + 8 + noW + 1.5, top + rh / 2, dt(lang, 'title'), 2.8, { bold: true });
  const revX = (i: number) => fx + 8 + noW + titleW + revW * i;
  cols.forEach((col, i) => T(revX(i) + revW / 2, top + rh / 2, col.rev, 2.8, { bold: true, anchor: 'middle', width: revW - 1 }));
  T(revX(cols.length) + revW / 2, top + rh / 2, dt(lang, 'revision'), 2.8, { bold: true, anchor: 'middle', width: revW - 1 });
  shown.forEach((p, i) => {
    const yy = top + rh * (i + 1) + rh / 2;
    T(fx + 8 + 1.5, yy, pageNumber(i + 1), 3);
    T(fx + 8 + noW + 1.5, yy, pick(p.title, lang) || dt(lang, `type.${p.type}` as 'type.cover'), 3, { width: titleW - 3 });
    cols.forEach((col, j) => col.changed.has(p.id) && T(revX(j) + revW / 2, yy, 'x', 3, { anchor: 'middle' }));
    const rev = pageRevision(project, p.id);
    if (rev !== undefined) T(revX(cols.length) + revW / 2, yy, rev, 3, { bold: true, anchor: 'middle', width: revW - 1 });
  });
  rect(fx + 8, top, leftW, tableH);
  for (let i = 1; i <= shown.length; i++) line(fx + 8, top + rh * i, fx + 8 + leftW, top + rh * i);
  line(fx + 8 + noW, top, fx + 8 + noW, top + tableH);
  for (let i = 0; i <= cols.length; i++) line(revX(i), top, revX(i), top + tableH);
  if (project.pages.length > shown.length) T(fx + 8, top + tableH + 4, `... (${project.pages.length - shown.length})`, 3);

  // Right side: revision list, issue status, units, customer approval and signature.
  const rx = fx + 8 + leftW + 10;
  const rw = fx + fw - 8 - rx;
  T(rx, top - 4.5, dt(lang, 'revisionList'), 5.5, { bold: true });
  const revCols = [10, 21, 0, 22, 22, 22];
  revCols[2] = rw - revCols.reduce((a, b) => a + b, 0);
  const rrh = 6;
  const list = project.revisions.slice(-MAX_REV_ROWS);
  const heads = [dt(lang, 'revision'), dt(lang, 'revDate'), dt(lang, 'revDescription'), dt(lang, 'drawn'), dt(lang, 'checked'), dt(lang, 'approved')];
  const listH = rrh * (MAX_REV_ROWS + 1);
  shade(rx, top, rw, rrh);
  let x = rx;
  const xs: number[] = [];
  revCols.forEach((cw, i) => { T(x + 1.5, top + rrh / 2, heads[i], 2.8, { bold: true, width: cw - 2 }); xs.push(x); x += cw; });
  list.forEach((r, i) => {
    const yy = top + rrh * (i + 1) + rrh / 2;
    [r.number, r.date, r.description, r.drawn, r.checked, r.approved].forEach((v, j) => T(xs[j] + 1.5, yy, v, 3, { width: revCols[j] - 2, bold: j === 0 }));
  });
  rect(rx, top, rw, listH);
  for (let i = 1; i <= MAX_REV_ROWS; i++) line(rx, top + rrh * i, rx + rw, top + rrh * i);
  xs.slice(1).forEach((xx) => line(xx, top, xx, top + listH));

  let yy = top + listH + 12;
  T(rx, yy, dt(lang, 'issueStatus'), 5.5, { bold: true });
  yy += 8;
  const bw = rw / ISSUE_STATUSES.length;
  ISSUE_STATUSES.forEach((s, i) => {
    const bx = rx + bw * i;
    rect(bx, yy - 2.5, 5, 5);
    if (project.issueStatus === s) { line(bx + 0.8, yy - 1.7, bx + 4.2, yy + 1.7, 0.5); line(bx + 4.2, yy - 1.7, bx + 0.8, yy + 1.7, 0.5); }
    T(bx + 7, yy, dt(lang, `status.${s}` as 'status.proposal'), 3.2, { width: bw - 9 });
  });
  yy += 10;
  T(rx, yy, `${dt(lang, 'units')}:`, 3.6);
  T(rx + 42, yy, String(project.settings.bom.units || 1), 3.6, { bold: true });
  yy += 10;
  const ah = Math.min(44, fy + fh - t.titleBlock.h - 8 - yy);
  if (ah > 24) {
    T(rx, yy, dt(lang, 'customerApproval'), 5.5, { bold: true });
    rect(rx, yy + 4, rw, ah - 4);
    const fieldY = [yy + 4 + (ah - 4) * 0.28, yy + 4 + (ah - 4) * 0.55, yy + 4 + (ah - 4) * 0.85];
    ([['approvalName', 0], ['approvalDate', 1], ['approvalSignature', 2]] as const).forEach(([k, i]) => {
      T(rx + 3, fieldY[i] - 1.5, dt(lang, k), 2.8);
      line(rx + 28, fieldY[i], rx + rw - 4, fieldY[i], 0.25);
    });
  }
  return out;
}
