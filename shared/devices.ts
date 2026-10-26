// Devices and cross-references (rule 1: the schematic is the source of truth). A device is every
// symbol, box and assembly outline that carries the same full designation (function aspect,
// location aspect and product part): the coil and its contacts, the single-line and the multi-line
// representation of a breaker. Nothing is stored twice; the index is computed from the model.
// Pages are scanned once and cached while their object is unchanged, so editing one page rescans
// only that page (incremental, product rule 7).

import { rungAt } from './ladder';
import { sheetMm } from './sheets';
import type { Library, Role } from './library/types';
import { symbolRole, withProjectSymbols } from './library/types';
import { templateOf } from './model/queries';
import { zoneIndex } from './model/zones';
import type { CrossRefSettings, DeviceRec, Page, Project } from './model/types';
import { fullDesignation } from './numbering';

export type ReprKind = 'symbol' | 'box' | 'assembly';
export interface DeviceRepr {
  page: string;
  pageIndex: number;
  el: string;
  kind: ReprKind;
  symbolId?: string;
  role: Role;
  /** For contacts: the contact type shown in a contact image. */
  contact?: 'no' | 'nc' | 'main';
  x: number;
  y: number;
  /** Cross-reference text in the project's format: "8.3" or "08-E3". */
  position: string;
}
export interface Device {
  /** Full designation: the device's identity. */
  key: string;
  reps: DeviceRepr[];
  rec?: DeviceRec;
}
export interface DeviceIndex {
  devices: Device[];
  byKey: Map<string, Device>;
  /** Representation of an element: keyed `${pageId}/${elementId}`. */
  byEl: Map<string, { device: Device; rep: DeviceRepr }>;
  /** Interruption points by signal name. */
  signals: Map<string, DeviceRepr[]>;
}

interface Rec {
  id: string;
  kind: ReprKind;
  symbolId?: string;
  designation: string;
  location?: string;
  x: number;
  y: number;
  value?: string;
}
const scans = new WeakMap<Page, Rec[]>();
/** Counts page scans: tests use it to check that edits rescan only the pages that changed. */
export const scanStats = { pages: 0 };

function scan(page: Page): Rec[] {
  let r = scans.get(page);
  if (r) return r;
  scanStats.pages++;
  r = [];
  for (const e of page.elements) {
    if (e.kind === 'symbol' && (e.designation || e.value)) r.push({ id: e.id, kind: 'symbol', symbolId: e.symbolId, designation: e.designation, location: e.location, x: e.x, y: e.y, value: e.value });
    else if (e.kind === 'box' && e.designation) r.push({ id: e.id, kind: 'box', designation: e.designation, location: e.location, x: e.x, y: e.y });
    else if (e.kind === 'rect' && e.assembly) r.push({ id: e.id, kind: 'assembly', designation: e.assembly, x: e.x, y: e.y });
  }
  scans.set(page, r);
  return r;
}

/** The full designation of an element on a page (aspects default from the page). */
export const keyOf = (page: Page, designation: string, location?: string): string => fullDesignation(page.function ?? '', location ?? page.location ?? '', designation);

/** The frame zone of a point on a page: column and row labels from the page's template. */
export function zoneAt(project: Project, page: Page, x: number, y: number): { col: string; row: string } {
  const t = templateOf(project, page);
  const { w, h } = sheetMm(page.size);
  const m = t.frame.margins;
  const fx = m.l, fy = m.t, fw = w - m.l - m.r, fh = h - m.t - m.b;
  return { col: t.frame.columns[zoneIndex(x, fx, fw, t.frame.columns.length)] ?? '', row: t.frame.rows[zoneIndex(y, fy, fh, t.frame.rows.length)] ?? '' };
}

/** Cross-reference text: page.column ("8.3") or page-column-row ("08-E3"). */
export function formatPosition(fmt: CrossRefSettings, pageNo: number, col: string, row: string): string {
  const no = String(pageNo).padStart(fmt.pageDigits, '0');
  return fmt.format === 'page.column' ? `${no}.${col}` : `${no}-${col}${row}`;
}

const natural = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });
const memo = new WeakMap<Project, { lib: Library; idx: DeviceIndex }>();

export function deviceIndex(project: Project, libIn: Library): DeviceIndex {
  const hit = memo.get(project);
  if (hit && hit.lib === libIn) return hit.idx;
  const lib = withProjectSymbols(libIn, project.symbols);
  const byKey = new Map<string, Device>();
  const byEl = new Map<string, { device: Device; rep: DeviceRepr }>();
  const signals = new Map<string, DeviceRepr[]>();
  project.pages.forEach((page, pageIndex) => {
    for (const r of scan(page)) {
      const def = r.symbolId ? lib.symbols.get(r.symbolId) : undefined;
      const z = zoneAt(project, page, r.x, r.y);
      const rep: DeviceRepr = {
        page: page.id, pageIndex, el: r.id, kind: r.kind, symbolId: r.symbolId, role: symbolRole(def), x: r.x, y: r.y,
        // On a ladder page the position is the line number of the rung (M8 part 2).
        position: page.ladder ? String(rungAt(page, r.y) ?? '') : formatPosition(project.settings.crossRef, pageIndex + 1, z.col, z.row),
      };
      if (def?.function === 'contact-no') rep.contact = 'no';
      else if (def?.function === 'contact-nc') rep.contact = 'nc';
      else if (rep.role === 'main' && r.kind === 'symbol') rep.contact = 'main';
      if (def?.function === 'interruption') {
        if (r.value) (signals.get(r.value) ?? signals.set(r.value, []).get(r.value)!).push(rep);
        continue;
      }
      if (!r.designation) continue;
      const key = keyOf(page, r.designation, r.location);
      let d = byKey.get(key);
      if (!d) byKey.set(key, (d = { key, reps: [] }));
      d.reps.push(rep);
      byEl.set(`${page.id}/${r.id}`, { device: d, rep });
    }
  });
  for (const rec of project.devices) {
    const d = byKey.get(rec.designation);
    if (d) d.rec = rec;
  }
  const devices = [...byKey.values()].sort((a, b) => natural(a.key, b.key));
  const idx: DeviceIndex = { devices, byKey, byEl, signals };
  memo.set(project, { lib: libIn, idx });
  return idx;
}

export interface RefInfo {
  device: Device;
  rep: DeviceRepr;
  /** Coils of the same device (other than this element). */
  coils: DeviceRepr[];
  /** Contacts and power parts of the same device (other than this element). */
  contacts: DeviceRepr[];
  /** Every other representation of the device. */
  others: DeviceRepr[];
}
export function refsOf(idx: DeviceIndex, pageId: string, elId: string): RefInfo | undefined {
  const hit = idx.byEl.get(`${pageId}/${elId}`);
  if (!hit) return undefined;
  const others = hit.device.reps.filter((r) => r !== hit.rep && r.kind !== 'assembly');
  return { ...hit, others, coils: others.filter((r) => r.role === 'coil'), contacts: others.filter((r) => r.role !== 'coil') };
}

/** Main and auxiliary functions of a device: how many coils, power parts and auxiliary contacts it has. */
export function deviceFunctions(d: Device): { coils: number; main: number; aux: number } {
  const n = { coils: 0, main: 0, aux: 0 };
  for (const r of d.reps) if (r.kind !== 'assembly') n[r.role === 'coil' ? 'coils' : r.role]++;
  return n;
}

/** Partner interruption points of the same signal (this one left out). */
export function interruptionPartners(idx: DeviceIndex, signal: string, pageId: string, elId: string): DeviceRepr[] {
  return (idx.signals.get(signal) ?? []).filter((r) => !(r.page === pageId && r.el === elId));
}
