// Layout exchange (M6 part 3): the cabinet layout as a documented, versioned JSON file and a CSV, read back
// with a preview (the import is a list of commands that the user accepts, so it is undoable), and the body
// sizes of parts from an ERP item master through the warehouse's column mapping. The format is described in
// docs/layout-format.md. Pure: the main process reads and writes the files.

import { apply, type Command } from '../commands';
import { toCsv } from '../export/csv';
import { t } from '../i18n';
import type { Lang } from '../i18n';
import { newId as defaultId } from '../ids';
import { findPart, type Library } from '../library/types';
import type { CabEl, CabItem, Project, Rot } from '../model/types';
import { CAB_ITEMS } from '../model/types';
import { fail, ok, type Result } from '../result';
import { codeKey, dimsFromRows, type ColumnMapping } from '../stock';
import { shortDesignation } from './draw';
import { cabinetOf, isCab, originOf, type Cabinet } from './model';
import { layoutPageCommands } from './pages';
import { footprint, syncSizeCommands } from './place';
import { cabinetDevices } from './size';

export const LAYOUT_FORMAT = 'cablepilot-layout';
export const LAYOUT_VERSION = 1;

/** One item of a layout file: coordinates in millimetres, from the plate's top-left corner (door devices: the door's), y down. */
export interface LayoutRow {
  type: CabItem;
  /** A device's full designation, or the label of any other item ("A1", "R1", "D1"). */
  designation: string;
  partCode: string;
  /** The enclosure the item belongs to. */
  enclosure: string;
  mount: 'enclosure' | 'plate' | 'door';
  /** Label of the rail a device sits on. */
  rail: string;
  x: number;
  y: number;
  /** Height above the plate surface: 0 on the plate, the depth between plate and door for door devices. */
  z: number;
  rotation: number;
  /** The footprint seen from the front (after the rotation). */
  width: number;
  height: number;
  depth: number;
  locked: boolean;
  note: string;
}
export interface LayoutFile {
  format: typeof LAYOUT_FORMAT;
  version: number;
  units: 'mm';
  project: string;
  items: LayoutRow[];
}

export const CSV_COLUMNS = ['type', 'designation', 'part_code', 'enclosure', 'mount', 'rail', 'x', 'y', 'z', 'rotation', 'width', 'height', 'depth', 'locked', 'note'] as const;

const ITEM_NAME: Record<CabItem, () => string> = { enclosure: () => t('Enclosure'), plate: () => t('Plate'), rail: () => t('DIN rail'), duct: () => t('Duct'), device: () => t('Device'), zone: () => t('No-mount zone'), cover: () => t('Cover'), dim: () => t('Dimension') };
const r2 = (v: number) => Math.round(v * 100) / 100;

/** The layout of the project as an exchange file. */
export function exportLayout(project: Project, lib: Library, cab: Cabinet = cabinetOf(project)): LayoutFile {
  const enc = cab.enclosure;
  const encName = enc?.designation ?? 'A1';
  const codeOfDevice = new Map(cabinetDevices(project, lib).map((d) => [d.key, d.part?.code ?? '']));
  const codeOf = (e: CabEl) => (e.part ? (findPart(lib, project.parts, e.part)?.code ?? e.part) : '');
  const railLabel = (id?: string) => cab.rails.find((r) => r.el.id === id)?.el.designation ?? '';
  const items: LayoutRow[] = [];
  const row = (e: CabEl, o: { x: number; y: number }, mount: LayoutRow['mount'], z: number, partCode: string, rail = ''): LayoutRow => ({ type: e.item, designation: e.designation ?? '', partCode, enclosure: encName, mount, rail, x: r2(e.x - o.x), y: r2(e.y - o.y), z, rotation: e.rot ?? 0, width: r2(e.w), height: r2(e.h), depth: r2(e.d ?? 0), locked: !!e.locked, note: e.note ?? '' });
  if (enc) items.push(row(enc, { x: enc.x, y: enc.y }, 'enclosure', 0, codeOf(enc)));
  if (enc && cab.plate) items.push(row(cab.plate, { x: enc.x, y: enc.y }, 'plate', 0, codeOf(cab.plate)));
  const po = cab.plate ? { x: cab.plate.x, y: cab.plate.y } : { x: enc?.x ?? 0, y: enc?.y ?? 0 };
  for (const p of [...cab.rails, ...cab.ducts, ...cab.zones, ...cab.covers, ...cab.dims]) items.push(row(p.el, po, 'plate', 0, codeOf(p.el)));
  const depthToDoor = (enc?.d ?? 0) - (cab.plate?.d ?? 0);
  for (const p of cab.devices) {
    const door = cab.doors.includes(p.page);
    items.push(row(p.el, originOf(cab, p), door ? 'door' : 'plate', door ? r2(depthToDoor) : 0, codeOfDevice.get(p.el.designation as string) ?? '', railLabel(p.el.rail)));
  }
  return { format: LAYOUT_FORMAT, version: LAYOUT_VERSION, units: 'mm', project: project.name, items };
}

export const layoutJson = (f: LayoutFile): string => `${JSON.stringify(f, null, 2)}\n`;

/** CSV: UTF-8 with a byte order mark, ";" as separator in Italian, "," otherwise (shared/export/csv). */
export function layoutCsv(f: LayoutFile, lang: Lang): string {
  const rows = f.items.map((i) => [i.type, i.designation, i.partCode, i.enclosure, i.mount, i.rail, String(i.x), String(i.y), String(i.z), String(i.rotation), String(i.width), String(i.height), String(i.depth), i.locked ? 'yes' : '', i.note]);
  return toCsv([[...CSV_COLUMNS], ...rows], lang);
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

function rowOf(raw: Record<string, unknown>, at: string): Result<LayoutRow> {
  if (!CAB_ITEMS.includes(raw.type as CabItem)) return fail('layout.row', `${at}: "${String(raw.type)}" is not an item type.`, `Use one of: ${CAB_ITEMS.join(', ')}.`);
  for (const k of ['x', 'y', 'width', 'height'] as const) if (!isNum(raw[k])) return fail('layout.row', `${at}: ${k} is not a number.`, 'Coordinates and sizes are numbers in millimetres.');
  const mount = raw.mount === 'door' || raw.mount === 'enclosure' ? raw.mount : 'plate';
  return ok({
    type: raw.type as CabItem, designation: isStr(raw.designation) ? raw.designation : '', partCode: isStr(raw.partCode) ? raw.partCode : '', enclosure: isStr(raw.enclosure) ? raw.enclosure : '',
    mount, rail: isStr(raw.rail) ? raw.rail : '', x: raw.x as number, y: raw.y as number, z: isNum(raw.z) ? raw.z : 0, rotation: isNum(raw.rotation) ? raw.rotation : 0,
    width: raw.width as number, height: raw.height as number, depth: isNum(raw.depth) ? raw.depth : 0, locked: raw.locked === true, note: isStr(raw.note) ? raw.note : '',
  });
}

export function parseLayoutJson(text: string): Result<LayoutFile> {
  let d: unknown;
  try { d = JSON.parse(text); } catch { return fail('layout.json', 'The file is not valid JSON.', 'Export the layout from CablePilot or check the file.'); }
  const o = d as Record<string, unknown> | null;
  if (!o || o.format !== LAYOUT_FORMAT) return fail('layout.format', 'This is not a CablePilot layout file.', 'Choose a layout file exported by CablePilot (format "cablepilot-layout").');
  if (!isNum(o.version) || o.version > LAYOUT_VERSION) return fail('layout.version', `This layout file has format version ${String(o.version)}; this app reads up to ${LAYOUT_VERSION}.`, 'Update CablePilot to read it.');
  if (!Array.isArray(o.items)) return fail('layout.items', 'The layout file has no items list.', 'Export the layout again.');
  const items: LayoutRow[] = [];
  for (const [i, raw] of o.items.entries()) {
    const r = rowOf((raw ?? {}) as Record<string, unknown>, `Item ${i + 1}`);
    if (!r.ok) return r;
    items.push(r.value);
  }
  return ok({ format: LAYOUT_FORMAT, version: o.version, units: 'mm', project: isStr(o.project) ? o.project : '', items });
}

export function parseLayoutCsv(rows: string[][]): Result<LayoutFile> {
  const head = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const col = (name: string) => head.indexOf(name);
  if (col('type') < 0 || col('x') < 0 || col('y') < 0 || col('width') < 0 || col('height') < 0) return fail('layout.csv', 'The CSV needs the columns type, x, y, width and height.', `Export the layout as CSV from CablePilot to see the columns: ${CSV_COLUMNS.join(', ')}.`);
  const num = (r: string[], name: string) => { const c = col(name); const v = c >= 0 ? Number((r[c] ?? '').trim().replace(',', '.')) : NaN; return v; };
  const str = (r: string[], name: string) => (col(name) >= 0 ? (r[col(name)] ?? '').trim() : '');
  const items: LayoutRow[] = [];
  for (const [i, r] of rows.slice(1).entries()) {
    if (r.every((c) => !c.trim())) continue;
    const res = rowOf({ type: str(r, 'type'), designation: str(r, 'designation'), partCode: str(r, 'part_code'), enclosure: str(r, 'enclosure'), mount: str(r, 'mount'), rail: str(r, 'rail'), x: num(r, 'x'), y: num(r, 'y'), z: Number.isFinite(num(r, 'z')) ? num(r, 'z') : 0, rotation: Number.isFinite(num(r, 'rotation')) ? num(r, 'rotation') : 0, width: num(r, 'width'), height: num(r, 'height'), depth: Number.isFinite(num(r, 'depth')) ? num(r, 'depth') : 0, locked: /^(yes|true|1|si)$/i.test(str(r, 'locked')), note: str(r, 'note') }, `Row ${i + 2}`);
    if (!res.ok) return res;
    items.push(res.value);
  }
  return ok({ format: LAYOUT_FORMAT, version: LAYOUT_VERSION, units: 'mm', project: '', items });
}

export interface ImportPlan {
  commands: Command[];
  /** One line per change, for the preview list. */
  changes: string[];
  warnings: string[];
  added: number;
  moved: number;
  unchanged: number;
  page: string;
}

const rotOf = (v: number): Rot => ((((Math.round(v / 90) * 90) % 360) + 360) % 360) as Rot;

/**
 * What importing a layout file would change: devices are matched by designation and must exist in the schematic
 * (rule 1: the schematic decides which devices there are), other items by type and label. Everything the import
 * touches counts as placed by hand: the next suggestion keeps it.
 */
export function planLayoutImport(project: Project, lib: Library, file: LayoutFile, newId: (prefix?: string) => string = defaultId): ImportPlan {
  const cab = cabinetOf(project);
  const plan: ImportPlan = { commands: [], changes: [], warnings: [], added: 0, moved: 0, unchanged: 0, page: cab.front?.id ?? '' };
  const encRow = file.items.find((i) => i.type === 'enclosure');
  const plateRow = file.items.find((i) => i.type === 'plate');
  if (!cab.enclosure && !encRow) { plan.warnings.push(t('The layout has no enclosure and the file has none either: add an enclosure item first.')); return plan; }
  const wantDoor = file.items.some((i) => i.type === 'device' && i.mount === 'door');
  const encDims = cab.enclosure ?? (encRow ? { w: encRow.width, h: encRow.height, d: encRow.depth } : { w: 800, h: 1000, d: 300 });
  const pages = layoutPageCommands(project, encDims, wantDoor || cab.doors.length > 0);
  plan.commands.push(...pages.cmds);
  const frontId = pages.ids.front, doorId = pages.ids.door;
  plan.page = frontId;
  const partIdOf = (code: string): string | undefined => {
    if (!code) return undefined;
    const all = [...lib.parts.values(), ...project.parts];
    return all.find((p) => codeKey(p.code) === codeKey(code))?.id;
  };
  // The enclosure and the plate first: every other position is relative to them.
  let enc = cab.enclosure;
  let plate = cab.plate;
  const front: CabEl[] = [];
  if (encRow) {
    const patch = { designation: encRow.designation || encRow.enclosure || 'A1', w: encRow.width, h: encRow.height, d: encRow.depth, ...(partIdOf(encRow.partCode) ? { part: partIdOf(encRow.partCode) } : {}) };
    if (enc) {
      if (enc.w !== patch.w || enc.h !== patch.h || enc.d !== patch.d) { plan.commands.push({ type: 'el/update', page: frontId, id: enc.id, patch }); plan.changes.push(t('Enclosure {name}: {w} x {h} x {d}', { name: patch.designation, w: patch.w, h: patch.h, d: patch.d })); plan.moved++; } else plan.unchanged++;
      enc = { ...enc, ...patch };
    } else {
      enc = { id: newId('c'), kind: 'cab', item: 'enclosure', x: 120, y: 100, ...patch };
      front.push(enc); plan.changes.push(t('Add enclosure {name}', { name: patch.designation })); plan.added++;
    }
  }
  if (enc && plateRow) {
    const patch = { x: enc.x + plateRow.x, y: enc.y + plateRow.y, w: plateRow.width, h: plateRow.height, d: plateRow.depth || 3, designation: plateRow.designation || 'MP1', ...(partIdOf(plateRow.partCode) ? { part: partIdOf(plateRow.partCode) } : {}) };
    if (plate) {
      if (['x', 'y', 'w', 'h'].some((k) => (plate as unknown as Record<string, number>)[k] !== (patch as unknown as Record<string, number>)[k])) { plan.commands.push({ type: 'el/update', page: frontId, id: plate.id, patch }); plan.changes.push(t('Plate {name}: {w} x {h}', { name: patch.designation, w: patch.w, h: patch.h })); plan.moved++; } else plan.unchanged++;
      plate = { ...plate, ...patch };
    } else {
      plate = { id: newId('c'), kind: 'cab', item: 'plate', ...patch };
      front.push(plate); plan.changes.push(t('Add plate {name}', { name: patch.designation })); plan.added++;
    }
  }
  const po = plate ? { x: plate.x, y: plate.y } : { x: enc?.x ?? 0, y: enc?.y ?? 0 };
  const doorFrame = cab.doorFrame;
  const doorOrigin = doorFrame ? { x: doorFrame.x, y: doorFrame.y } : { x: enc?.x ?? 0, y: enc?.y ?? 0 };
  const railId = new Map(cab.rails.map((r) => [r.el.designation ?? '', r.el.id]));
  const frontAdd: CabEl[] = [...front];
  const doorAdd: CabEl[] = [];
  const existing = [...cab.rails, ...cab.ducts, ...cab.zones, ...cab.covers, ...cab.dims].map((p) => p.el);
  // Non-device items by (type, label); dimension lines have no label and are matched by position.
  for (const row of file.items) {
    if (row.type === 'enclosure' || row.type === 'plate' || row.type === 'device') continue;
    const at = { x: po.x + row.x, y: po.y + row.y };
    const found = existing.find((e) => e.item === row.type && (e.designation ?? '') === row.designation && (row.designation !== '' || (e.x === at.x && e.y === at.y)));
    const patch = { x: at.x, y: at.y, w: row.width, h: row.height, ...(row.depth ? { d: row.depth } : {}), ...(row.note ? { note: row.note } : {}), ...(row.designation ? { designation: row.designation } : {}), ...(partIdOf(row.partCode) ? { part: partIdOf(row.partCode) } : {}) };
    if (found) {
      if (['x', 'y', 'w', 'h'].some((k) => (found as unknown as Record<string, number>)[k] !== (patch as unknown as Record<string, number>)[k])) { plan.commands.push({ type: 'el/update', page: frontId, id: found.id, patch }); plan.changes.push(t('{type} {name}: {x}, {y}', { type: ITEM_NAME[row.type](), name: row.designation, x: patch.x - po.x, y: patch.y - po.y })); plan.moved++; } else plan.unchanged++;
    } else {
      const el: CabEl = { id: newId('c'), kind: 'cab', item: row.type, ...patch } as CabEl;
      frontAdd.push(el);
      if (row.type === 'rail') railId.set(row.designation, el.id);
      plan.changes.push(t('Add {type} {name}', { type: ITEM_NAME[row.type](), name: row.designation })); plan.added++;
    }
  }
  // Devices: they must be in the schematic.
  const bom = cabinetDevices(project, lib);
  const keyOfName = (name: string): string | undefined => {
    if (bom.some((d) => d.key === name)) return name;
    const short = bom.filter((d) => shortDesignation(d.key) === name);
    return short.length === 1 ? short[0].key : undefined;
  };
  const placed = new Map(cab.devices.map((p) => [p.el.designation as string, p]));
  for (const row of file.items) {
    if (row.type !== 'device') continue;
    const key = keyOfName(row.designation);
    if (!key) { plan.warnings.push(t('{name} is not a device of this schematic and was not placed.', { name: row.designation })); continue; }
    const cd = bom.find((d) => d.key === key);
    if (cd && row.partCode && cd.part && codeKey(cd.part.code) !== codeKey(row.partCode)) plan.warnings.push(t('{name}: the file says part {file}, the schematic has {schem}; the schematic wins.', { name: row.designation, file: row.partCode, schem: cd.part.code }));
    const door = row.mount === 'door';
    const o = door ? doorOrigin : po;
    const at = { x: r2(o.x + row.x), y: r2(o.y + row.y) };
    const rot = rotOf(row.rotation);
    const patch: Partial<CabEl> = { x: at.x, y: at.y, w: row.width, h: row.height, ...(row.depth ? { d: row.depth } : {}), ...(rot ? { rot } : {}), ...(row.locked ? { locked: true } : {}), ...(row.rail && railId.get(row.rail) ? { rail: railId.get(row.rail) } : {}) };
    const cur = placed.get(key);
    if (cur) {
      if (cur.el.x !== at.x || cur.el.y !== at.y || cur.el.w !== row.width || cur.el.h !== row.height || (cur.el.rot ?? 0) !== rot) {
        plan.commands.push({ type: 'el/update', page: cur.page.id, id: cur.el.id, patch });
        plan.changes.push(t('Move {name}: {from} → {to}', { name: shortDesignation(key), from: `${r2(cur.el.x - o.x)}, ${r2(cur.el.y - o.y)}`, to: `${row.x}, ${row.y}` })); plan.moved++;
      } else plan.unchanged++;
    } else {
      const el: CabEl = { id: newId('c'), kind: 'cab', item: 'device', designation: key, ...patch } as CabEl;
      (door ? doorAdd : frontAdd).push(el);
      plan.changes.push(t('Place {name}: {x}, {y}', { name: shortDesignation(key), x: row.x, y: row.y })); plan.added++;
    }
  }
  if (frontAdd.length) plan.commands.push({ type: 'el/add', page: frontId, elements: frontAdd });
  if (doorAdd.length) {
    const hasFrame = !!cab.doors[0]?.elements.some((e) => isCab(e) && e.item === 'enclosure');
    plan.commands.push({ type: 'el/add', page: doorId, elements: [...(hasFrame || !enc ? [] : [{ ...enc, id: newId('c'), auto: undefined } as CabEl]), ...doorAdd] });
  }
  return plan;
}

/** The result of applying an import plan, for tests and the preview. */
export const applyPlan = (project: Project, lib: Library, plan: ImportPlan): Project => apply(project, { type: 'batch', label: 'import layout', commands: plan.commands }, { lib });

export interface DimsPlan {
  commands: Command[];
  changes: string[];
  /** Codes of the file that match no part of the library or the project. */
  unmatched: string[];
  skipped: number;
  mapped: boolean;
}

/** Body sizes from an ERP item master: parts matched by code (or a manual link) get the file's dimensions, then devices follow. */
export function planDimsImport(project: Project, lib: Library, rows: string[][], mapping: ColumnMapping, links: Record<string, string> = {}): DimsPlan {
  const read = dimsFromRows(rows, mapping);
  const plan: DimsPlan = { commands: [], changes: [], unmatched: [], skipped: read.skipped.length, mapped: read.mapped };
  if (!read.mapped) return plan;
  const all = new Map([...lib.parts, ...project.parts.map((p) => [p.id, p] as const)]);
  for (const it of read.items) {
    const linked = links[it.code] ? all.get(links[it.code]) : undefined;
    const part = linked ?? [...all.values()].find((p) => codeKey(p.code) === codeKey(it.code));
    if (!part) { plan.unmatched.push(it.code); continue; }
    const cur = part.dimensions;
    if (cur && cur.w === it.dims.w && cur.h === it.dims.h && cur.d === it.dims.d) continue;
    plan.commands.push({ type: 'part/dims', id: part.id, dims: it.dims });
    plan.changes.push(`${part.code}: ${cur ? `${cur.w} x ${cur.h} x ${cur.d}` : '-'} → ${it.dims.w} x ${it.dims.h} x ${it.dims.d}`);
  }
  if (plan.commands.length) {
    const next = apply(project, { type: 'batch', label: 'dims', commands: plan.commands }, { lib });
    const sync = syncSizeCommands(next, lib);
    plan.commands.push(...sync);
    if (sync.length) plan.changes.push(t('{n} devices on the layout get their new size', { n: sync.length }));
  }
  return plan;
}

export { footprint };
