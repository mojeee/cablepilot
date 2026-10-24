// Revisions (brief, M4): the issue status of the set, issued revisions with a snapshot (one hash per
// page and an inventory of devices, wires and parts), the pages changed since the last issue, the
// revision index of every sheet, and the comparison of two revisions. Everything is computed from
// the schematic (rule 1); page hashes are cached per page object, so checking for changes after an
// edit hashes only the page that was edited (incremental, rule 7).

import { computeBom } from './bom';
import { deviceIndex, keyOf } from './devices';
import { canonical, hashOf, hashText } from './hash';
import type { Library } from './library/types';
import type { Page, Project, Revision } from './model/types';
import { nameplateLabels, reportTable, wireRows } from './reports';

export type Snapshot = Pick<Revision, 'pages' | 'inventory'>;

const pageStatic = new WeakMap<Page, string>();
/** Hash of what the page holds: its properties and every element. Generated pages (cover, contents) hash without their generated body. */
function staticHash(page: Page): string {
  let h = pageStatic.get(page);
  if (!h) pageStatic.set(page, (h = hashText(canonical(page))));
  return h;
}

/** The hash of a page as it would print: its content plus the rows of any live report it shows. */
export function pageHash(project: Project, lib: Library, page: Page): string {
  const reports = page.elements.filter((e) => e.kind === 'report');
  if (reports.length === 0) return staticHash(page);
  const dyn = reports.map((r) => {
    if (r.kind !== 'report') return '';
    const end = r.rows > 0 ? r.offset + r.rows : undefined;
    if (r.report === 'nameplates') return nameplateLabels(project, lib).slice(r.offset, end);
    return reportTable(project, lib, r.report).rows.slice(r.offset, end).map((x) => x.cells);
  });
  return `${staticHash(page)}.${hashOf(dyn).slice(0, 8)}`;
}

const short = (v: unknown): string => hashOf(v).slice(0, 8);

/** Devices by full designation with a signature of what is drawn and recorded for each. */
function deviceInventory(project: Project, lib: Library): Record<string, string> {
  const idx = deviceIndex(project, lib);
  const texts = new Map<string, string>();
  for (const pg of project.pages) {
    for (const e of pg.elements) {
      if ((e.kind === 'symbol' || e.kind === 'box') && e.designation && e.functionText) {
        const k = keyOf(pg, e.designation, e.location);
        if (!texts.has(k)) texts.set(k, canonical(e.functionText));
      }
    }
  }
  const out: Record<string, string> = {};
  for (const d of idx.devices) {
    out[d.key] = short({ at: d.reps.map((r) => `${r.position}/${r.role}/${r.symbolId ?? r.kind}`).sort(), text: texts.get(d.key), parts: d.rec?.parts, fields: d.rec?.fields, parent: d.rec?.parent });
  }
  return out;
}

/** Wires by number and ends with a signature of cross-section, colour, type and cable core. */
function wireInventory(project: Project, lib: Library): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [number, from, to, xs, colour, type, cable] of wireRows(project, lib)) {
    let key = `${number || '-'} ${from}>${to}`;
    for (let n = 2; key in out; n++) key = `${number || '-'} ${from}>${to} #${n}`;
    out[key] = short([xs, colour, type, cable]);
  }
  return out;
}

function partInventory(project: Project, lib: Library): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of computeBom(project, lib).rows) if (r.code && r.qty) out[r.code] = (out[r.code] ?? 0) + r.qty;
  return out;
}

/** The snapshot stored with an issued revision. */
export function makeSnapshot(project: Project, lib: Library): Snapshot {
  const lang = project.settings.drawingLanguage;
  return {
    pages: project.pages.map((p) => ({ id: p.id, title: p.title[lang] || p.title.en || p.title.it || '', hash: pageHash(project, lib, p) })),
    inventory: { devices: deviceInventory(project, lib), wires: wireInventory(project, lib), parts: partInventory(project, lib) },
  };
}

export interface PageChange {
  id: string;
  title: string;
  status: 'added' | 'changed' | 'removed';
}
const byId = (pages: Snapshot['pages']) => new Map(pages.map((p) => [p.id, p]));
function diffPages(from: Snapshot['pages'], to: Snapshot['pages']): PageChange[] {
  const a = byId(from), b = byId(to);
  const out: PageChange[] = [];
  for (const p of to) {
    const o = a.get(p.id);
    if (!o) out.push({ id: p.id, title: p.title, status: 'added' });
    else if (o.hash !== p.hash) out.push({ id: p.id, title: p.title, status: 'changed' });
  }
  for (const p of from) if (!b.has(p.id)) out.push({ id: p.id, title: p.title, status: 'removed' });
  return out;
}

/** The pages as they are now, with hashes (no inventory: cheap). */
function currentPages(project: Project, lib: Library): Snapshot['pages'] {
  const lang = project.settings.drawingLanguage;
  return project.pages.map((p) => ({ id: p.id, title: p.title[lang] || p.title.en || p.title.it || '', hash: pageHash(project, lib, p) }));
}

/** Pages added, changed or removed since the last issued revision; none are reported before the first issue. */
export function changedPages(project: Project, lib: Library): PageChange[] {
  const last = project.revisions[project.revisions.length - 1];
  return last ? diffPages(last.pages, currentPages(project, lib)) : [];
}

const matrixMemo = new WeakMap<Revision[], { rev: string; changed: Set<string> }[]>();
/** For each issued revision, the pages that changed in it (all pages in the first one). */
export function revisionMatrix(project: Project): { rev: string; changed: Set<string> }[] {
  const hit = matrixMemo.get(project.revisions);
  if (hit) return hit;
  const m = project.revisions.map((r, i) => ({ rev: r.number, changed: new Set(i === 0 ? r.pages.map((p) => p.id) : diffPages(project.revisions[i - 1].pages, r.pages).filter((c) => c.status !== 'removed').map((c) => c.id)) }));
  matrixMemo.set(project.revisions, m);
  return m;
}

/** The revision index of a sheet: the last issued revision in which it changed; undefined before any issue. */
export function pageRevision(project: Project, pageId: string): string | undefined {
  const m = revisionMatrix(project);
  for (let i = m.length - 1; i >= 0; i--) if (m[i].changed.has(pageId)) return m[i].rev;
  return undefined;
}

/** The next revision number: 0 for the first, then one more than the last number (or the next letter). */
export function nextRevisionNumber(project: Project): string {
  const last = project.revisions[project.revisions.length - 1]?.number;
  if (last === undefined) return '0';
  if (/^\d+$/.test(last)) return String(Number(last) + 1);
  if (/^[A-Y]$/.test(last)) return String.fromCharCode(last.charCodeAt(0) + 1);
  return `${last}.1`;
}

export interface ItemChange {
  key: string;
  status: 'added' | 'removed' | 'changed';
  /** For parts: quantity before and after. */
  from?: number;
  to?: number;
}
export interface Comparison {
  pages: PageChange[];
  devices: ItemChange[];
  wires: ItemChange[];
  parts: ItemChange[];
}
function diffMap<T extends string | number>(a: Record<string, T>, b: Record<string, T>, qty = false): ItemChange[] {
  const out: ItemChange[] = [];
  for (const k of Object.keys(b)) {
    if (!(k in a)) out.push({ key: k, status: 'added', ...(qty ? { to: b[k] as number } : {}) });
    else if (a[k] !== b[k]) out.push({ key: k, status: 'changed', ...(qty ? { from: a[k] as number, to: b[k] as number } : {}) });
  }
  for (const k of Object.keys(a)) if (!(k in b)) out.push({ key: k, status: 'removed', ...(qty ? { from: a[k] as number } : {}) });
  return out.sort((x, y) => x.key.localeCompare(y.key, 'en', { numeric: true }));
}
/** What changed from one snapshot to another: pages, devices, wires and parts. */
export function compareSnapshots(a: Snapshot, b: Snapshot): Comparison {
  return { pages: diffPages(a.pages, b.pages), devices: diffMap(a.inventory.devices, b.inventory.devices), wires: diffMap(a.inventory.wires, b.inventory.wires), parts: diffMap(a.inventory.parts, b.inventory.parts, true) };
}
/** Compares two issued revisions by number, or a revision with the working copy ('working'). */
export function compareRevisions(project: Project, lib: Library, from: string, to: string): Comparison | undefined {
  const snap = (n: string): Snapshot | undefined => (n === 'working' ? makeSnapshot(project, lib) : project.revisions.find((r) => r.number === n));
  const a = snap(from), b = snap(to);
  return a && b ? compareSnapshots(a, b) : undefined;
}
