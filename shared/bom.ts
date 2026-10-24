// The bill of materials, generated live from the schematic (rule 1): one row per part of every
// device, in the order of the designations, with the devices of a nested assembly under their
// assembly. Quantities are per unit times the number of units to build. Device discovery is
// incremental through shared/devices.ts (pages are rescanned only when they change).

import { dt, pick } from './drawingText';
import { deviceIndex, type Device, type DeviceRepr } from './devices';
import type { Lang } from './i18n';
import type { Library } from './library/types';
import { findPart } from './library/types';
import type { Page, Project } from './model/types';

export const BOM_BASE_COLUMNS = ['designation', 'position', 'qty', 'code', 'description', 'manufacturer'] as const;
export type BomBaseColumn = (typeof BOM_BASE_COLUMNS)[number];

export interface BomRow {
  /** Nesting depth: devices of an assembly are one level below it. */
  level: number;
  designation: string;
  /** Cross-reference of the device's main representation: "08-E3". */
  position: string;
  qty: number;
  qtyPerUnit: number;
  code: string;
  description: string;
  manufacturer: string;
  fields: Record<string, string>;
  part?: string;
  /** A device with no part assigned yet. */
  missing?: boolean;
  /** A heading row of an assembly that has no part of its own. */
  assembly?: boolean;
}
export interface Bom {
  rows: BomRow[];
  units: number;
  /** Devices with no part assigned. */
  missing: number;
}

/** The representation that gives the device its position: a coil or power part on a multi-line page first. */
function mainRep(project: Project, d: Device): DeviceRepr | undefined {
  const rank = (r: DeviceRepr) => (r.kind === 'assembly' ? 4 : 0) + (project.pages[r.pageIndex]?.type === 'singleLine' ? 2 : 0) + (r.role === 'aux' ? 1 : 0);
  return d.reps.slice().sort((a, b) => rank(a) - rank(b) || a.pageIndex - b.pageIndex)[0];
}

function describe(project: Project, d: Device, lang: Lang): string {
  for (const r of d.reps) {
    const page: Page | undefined = project.pages[r.pageIndex];
    const el = page?.elements.find((e) => e.id === r.el);
    if (el && (el.kind === 'symbol' || el.kind === 'box')) {
      const t = pick(el.functionText, lang);
      if (t) return t.replace(/\n/g, ' ');
    } else if (el && el.kind === 'rect' && el.label) return el.label;
  }
  return '';
}

export function computeBom(project: Project, lib: Library): Bom {
  const lang = project.settings.drawingLanguage;
  const units = Math.max(1, project.settings.bom.units || 1);
  const idx = deviceIndex(project, lib);
  const children = new Map<string, Device[]>();
  const roots: Device[] = [];
  for (const d of idx.devices) {
    const parent = d.rec?.parent;
    if (parent && parent !== d.key && idx.byKey.has(parent)) (children.get(parent) ?? children.set(parent, []).get(parent)!).push(d);
    else roots.push(d);
  }
  const rows: BomRow[] = [];
  let missing = 0;
  const seen = new Set<string>();
  const visit = (d: Device, level: number) => {
    if (seen.has(d.key)) return;
    seen.add(d.key);
    const rep = mainRep(project, d);
    const position = rep?.position ?? '';
    const fields = d.rec?.fields ?? {};
    const parts = d.rec?.parts ?? [];
    const kids = children.get(d.key) ?? [];
    const onlyOutline = d.reps.every((r) => r.kind === 'assembly');
    if (parts.length === 0) {
      if (onlyOutline || kids.length) rows.push({ level, designation: d.key, position, qty: 0, qtyPerUnit: 0, code: '', description: describe(project, d, lang), manufacturer: '', fields, assembly: true });
      else {
        missing++;
        rows.push({ level, designation: d.key, position, qty: 0, qtyPerUnit: 0, code: '', description: describe(project, d, lang), manufacturer: '', fields, missing: true });
      }
    }
    for (const u of parts) {
      const part = findPart(lib, project.parts, u.part);
      rows.push({
        level, designation: d.key, position, qty: u.qty * units, qtyPerUnit: u.qty, part: u.part, fields,
        code: part?.code ?? u.part, description: part ? pick(part.description, lang) : '', manufacturer: part?.manufacturer ?? '',
      });
    }
    for (const k of kids) visit(k, level + 1);
  };
  for (const d of roots) visit(d, 0);
  for (const pp of project.projectParts) {
    const part = findPart(lib, project.parts, pp.part);
    rows.push({ level: 0, designation: '', position: '', qty: pp.qty * units, qtyPerUnit: pp.qty, part: pp.part, fields: pp.fields, code: part?.code ?? pp.part, description: part ? pick(part.description, lang) : '', manufacturer: part?.manufacturer ?? '' });
  }
  if (project.settings.bom.group === 'part') return { rows: groupByPart(rows), units, missing };
  return { rows, units, missing };
}

/** Rows merged by part: the designations and positions are listed, the quantities added. Headings go. */
function groupByPart(rows: BomRow[]): BomRow[] {
  const out: BomRow[] = [];
  const byPart = new Map<string, BomRow>();
  for (const r of rows) {
    if (r.assembly) continue;
    if (!r.part) { out.push({ ...r, level: 0 }); continue; }
    const g = byPart.get(r.part);
    if (!g) {
      const row = { ...r, level: 0, fields: { ...r.fields } };
      byPart.set(r.part, row);
      out.push(row);
      continue;
    }
    g.qty += r.qty;
    g.qtyPerUnit += r.qtyPerUnit;
    if (r.designation) g.designation = g.designation ? `${g.designation}, ${r.designation}` : r.designation;
    if (r.position && !g.position.split(', ').includes(r.position)) g.position = g.position ? `${g.position}, ${r.position}` : r.position;
    for (const [k, v] of Object.entries(r.fields)) if (!g.fields[k]) g.fields[k] = v;
  }
  return out;
}

/** The text of one cell of a BOM row in a column (a base column or field:<id>). */
export function bomCell(r: BomRow, col: string): string {
  switch (col) {
    case 'designation': return r.designation;
    case 'position': return r.position;
    case 'qty': return r.qty ? String(r.qty) : '';
    case 'code': return r.code;
    case 'description': return r.description;
    case 'manufacturer': return r.manufacturer;
    default: return col.startsWith('field:') ? (r.fields[col.slice(6)] ?? '') : '';
  }
}

/** The header of a column in the drawing language (it ends up on paper and in files). */
export function bomHeader(project: Project, col: string, lang: Lang): string {
  if ((BOM_BASE_COLUMNS as readonly string[]).includes(col)) return dt(lang, `bom.${col}` as 'bom.code');
  const f = project.settings.bom.userFields.find((u) => `field:${u.id}` === col);
  return f ? pick(f.label, lang) : col;
}

/** CSV of the BOM with the configured columns: UTF-8 with a byte order mark; ";" in Italian, "," otherwise. */
export function bomToCsv(project: Project, bom: Bom, lang: Lang = project.settings.drawingLanguage): string {
  const sep = lang === 'it' ? ';' : ',';
  const cols = project.settings.bom.columns;
  const q = (s: string) => (/["\n;,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [cols.map((c) => q(bomHeader(project, c, lang))).join(sep), ...bom.rows.map((r) => cols.map((c) => q(bomCell(r, c))).join(sep))];
  return `﻿${lines.join('\r\n')}\r\n`;
}
