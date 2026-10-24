// Live reports (brief, M3): terminal diagrams, cable list, wire list, connector pin lists, BOM,
// contents, symbol legend, colour and suffix tables, tightening-torque table, nameplates and the
// marker lists. Every table is computed from the schematic (rule 1); nothing is typed twice. The
// work is incremental: device scans and nets are cached per page (shared/devices, shared/connectivity),
// so after an edit only the pages that changed are scanned again; the tables are cached per project.

import { bomCell, bomHeader, computeBom } from './bom';
import { deviceIndex, keyOf, type Device } from './devices';
import { dt, pick } from './drawingText';
import type { Lang } from './i18n';
import type { Library, PartDef } from './library/types';
import { findPart, isTerminalPart, withProjectSymbols } from './library/types';
import type { CableRec, Page, Project, ReportId, SymbolEl } from './model/types';
import { netlist, destinations, type NetlistGroup } from './netlist';
import { rt, type ReportTextKey } from './reportText';
import { colourName, formatWireNumber, wireSpec } from './wires';

export interface ReportRow {
  cells: string[];
  /** A heading row (a strip, a cable, a connector): drawn bold, not counted as data. */
  heading?: boolean;
}
export interface ReportTable {
  id: ReportId;
  title: string;
  headers: string[];
  /** Relative column widths. */
  widths: number[];
  rows: ReportRow[];
  /** A note printed under the table. */
  note?: string;
}

const natural = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });
const num = (s: string | undefined): number => {
  const m = /-?\d+(?:[.,]\d+)?/.exec(s ?? '');
  return m ? Number(m[0].replace(',', '.')) : NaN;
};
const R = (...cells: string[]): ReportRow => ({ cells });
const H = (...cells: string[]): ReportRow => ({ cells, heading: true });

/** The symbol elements of a project, by function (cached per page object). */
const symScan = new WeakMap<Page, SymbolEl[]>();
function symbolsOf(page: Page): SymbolEl[] {
  let s = symScan.get(page);
  if (!s) symScan.set(page, (s = page.elements.filter((e): e is SymbolEl => e.kind === 'symbol')));
  return s;
}

interface Terminal {
  strip: string;
  designation: string;
  no: string;
  el: SymbolEl;
  page: Page;
  pageIndex: number;
}

/** Terminal strips: the devices drawn with the terminal symbol, their terminals in numbered order. */
export function terminalStrips(project: Project, libIn: Library): { key: string; designation: string; terminals: Terminal[]; device?: Device }[] {
  const lib = withProjectSymbols(libIn, project.symbols);
  const idx = deviceIndex(project, libIn);
  const strips = new Map<string, Terminal[]>();
  project.pages.forEach((page, pageIndex) => {
    for (const el of symbolsOf(page)) {
      if (lib.symbols.get(el.symbolId)?.function !== 'terminal' || !el.designation) continue;
      const key = keyOf(page, el.designation, el.location);
      (strips.get(key) ?? strips.set(key, []).get(key)!).push({ strip: key, designation: el.designation, no: el.value ?? '', el, page, pageIndex });
    }
  });
  return [...strips.entries()].sort((a, b) => natural(a[0], b[0])).map(([key, terminals]) => ({
    key,
    designation: terminals[0].designation,
    device: idx.byKey.get(key),
    terminals: terminals.slice().sort((a, b) => (a.no && b.no ? natural(a.no, b.no) : a.no ? -1 : b.no ? 1 : a.pageIndex - b.pageIndex || a.el.y - b.el.y || a.el.x - b.el.x)),
  }));
}

const widthOf = (p: PartDef | undefined): number => num(p?.data.Width);

/** Length of a strip in millimetres: the widths of its terminals and of its other parts (end plates, stops); NaN when a part has no width. */
function stripLength(project: Project, lib: Library, terminals: number, device?: Device): number {
  const parts = device?.rec?.parts ?? [];
  let total = 0;
  for (const u of parts) {
    const part = findPart(lib, project.parts, u.part);
    const w = widthOf(part);
    if (Number.isNaN(w)) return NaN;
    total += w * u.qty * (isTerminalPart(part) ? terminals : 1);
  }
  return parts.length ? total : NaN;
}
export const stripLengthText = (mm: number): string => (Number.isNaN(mm) ? '' : `${Math.round(mm * 10) / 10} mm`);

function partTitle(project: Project, lib: Library, id: string | undefined, lang: Lang): string {
  if (!id) return '';
  const p = findPart(lib, project.parts, id);
  return p ? p.code : id;
}

function terminalTable(project: Project, lib: Library, lang: Lang): ReportTable {
  const nl = netlist(project, lib);
  const rows: ReportRow[] = [];
  for (const s of terminalStrips(project, lib)) {
    const terminalPart = (s.device?.rec?.parts ?? []).map((u) => u.part).find((id) => isTerminalPart(findPart(lib, project.parts, id)));
    const len = stripLengthText(stripLength(project, lib, s.terminals.length, s.device));
    rows.push(H(s.key, '', `${s.terminals.length} ${rt(lang, 'val.terminals')}`, len ? `${rt(lang, 'col.length')} ${len}` : '', partTitle(project, lib, terminalPart, lang), '', ''));
    for (const t of s.terminals) {
      const side = (pin: string): { dest: string; wire: string } => {
        const g: NetlistGroup | undefined = nl.byPin.get(`${t.page.id}/${t.el.id}/${pin}`);
        const d = destinations(g, { page: t.page.id, el: t.el.id, pin }).map((p) => p.label);
        return { dest: [...new Set(d)].join(', '), wire: g?.numbers.join(', ') ?? '' };
      };
      const a = side('1'), b = side('2');
      rows.push(R(a.dest, a.wire, t.no, pick(t.el.functionText, lang).replace(/\n/g, ' '), partTitle(project, lib, terminalPart, lang), b.wire, b.dest));
    }
  }
  return { id: 'terminals', title: rt(lang, 'report.terminals'), headers: [rt(lang, 'col.destIn'), rt(lang, 'col.wire'), rt(lang, 'col.terminal'), rt(lang, 'col.function'), rt(lang, 'col.part'), rt(lang, 'col.wire'), rt(lang, 'col.destOut')], widths: [44, 22, 16, 56, 38, 22, 44], rows };
}

/** One connection per pair of neighbouring endpoints of a net group (a daisy chain in reading order). */
interface Connection {
  number: string;
  from: string;
  to: string;
  group: NetlistGroup;
  wire: NetlistGroup['wires'][number] | undefined;
}
function connections(project: Project, lib: Library): Connection[] {
  const out: Connection[] = [];
  for (const g of netlist(project, lib).groups) {
    const pins = g.pins.filter((p) => p.label);
    const wire = g.wires.find((w) => w.number) ?? g.wires[0];
    for (let i = 0; i + 1 < pins.length; i++) out.push({ number: wire?.number ?? '', from: pins[i].label, to: pins[i + 1].label, group: g, wire });
  }
  return out.sort((a, b) => natural(a.number, b.number) || natural(a.from, b.from));
}

/** The core of a cable a wire is, with the cable's part data. */
function coreSpec(project: Project, lib: Library, w: { cable?: string; core?: string }): { colour?: string; crossSection?: string } {
  if (!w.cable) return {};
  const cab = project.cables.find((c) => c.id === w.cable);
  const part = cab?.part ? findPart(lib, project.parts, cab.part) : undefined;
  const xs = part?.data['Conductor cross-section'];
  return { colour: w.core && /^[A-Z]{2,4}$/.test(w.core) ? w.core : undefined, crossSection: xs ? String(num(xs)) : undefined };
}

function wireTable(project: Project, lib: Library, lang: Lang): ReportTable {
  const rows = connections(project, lib).map((c) => {
    const w = c.wire?.wire;
    const spec = wireSpec(project, { wireType: w?.wireType, potential: w?.potential }, c.group.potential);
    const core = w ? coreSpec(project, lib, w) : {};
    return R(c.number, c.from, c.to, core.crossSection ?? spec.crossSection, core.colour ?? spec.colour, spec.type, w?.cable ? `${w.cable}${w.core ? `:${w.core}` : ''}` : '');
  });
  return { id: 'wires', title: rt(lang, 'report.wires'), headers: [rt(lang, 'col.number'), rt(lang, 'col.from'), rt(lang, 'col.to'), rt(lang, 'col.crossSection'), rt(lang, 'col.colour'), rt(lang, 'col.type'), rt(lang, 'col.cable')], widths: [24, 52, 52, 24, 20, 30, 30], rows };
}

function boxesByDesignation(project: Project): Map<string, { page: Page; box: Extract<Page['elements'][number], { kind: 'box' }> }> {
  const m = new Map<string, { page: Page; box: Extract<Page['elements'][number], { kind: 'box' }> }>();
  for (const pg of project.pages) for (const e of pg.elements) if (e.kind === 'box' && e.designation && !m.has(e.designation)) m.set(e.designation, { page: pg, box: e });
  return m;
}

/** The cores of a cable: used cores with their ends, then the spare cores of the part. */
export function cableCores(project: Project, lib: Library, c: CableRec): { core: string; colour: string; wire: string; from: string; to: string; spare?: boolean }[] {
  const part = c.part ? findPart(lib, project.parts, c.part) : undefined;
  const colours = (part?.data['Core colours'] ?? '').split(/[,\s]+/).filter(Boolean);
  const count = Math.round(num(part?.data.Cores ?? part?.data.Conductors));
  const out: ReturnType<typeof cableCores> = [];
  if (c.kind === 'multicore') {
    const used = new Set<string>();
    for (const g of netlist(project, lib).groups) {
      for (const w of g.wires) {
        if (w.wire.cable !== c.id) continue;
        const pins = g.pins.filter((p) => p.label);
        const core = w.wire.core ?? '';
        if (used.has(`${core}|${w.number}`)) continue;
        used.add(`${core}|${w.number}`);
        out.push({ core, colour: /^[A-Z]{2,4}$/.test(core) ? core : (colours[Number(core) - 1] ?? ''), wire: w.number ?? '', from: pins[0]?.label ?? '', to: pins.length > 1 ? pins[pins.length - 1].label : '' });
      }
    }
    out.sort((a, b) => natural(a.core, b.core));
    const taken = new Set(out.flatMap((o) => [o.core, o.colour]));
    const n = Number.isNaN(count) ? colours.length : count;
    for (let i = 1; i <= n; i++) {
      const col = colours[i - 1] ?? '';
      if (taken.has(String(i)) || (col && taken.has(col))) continue;
      out.push({ core: col || String(i), colour: col, wire: '', from: '', to: '', spare: true });
    }
    return out;
  }
  // A patch cable between two named pins ("-A3:ETH" to "-A4:P1"): one straight-through link, pin to pin.
  if (c.from?.includes(':') && c.to?.includes(':')) {
    const n = Number.isNaN(count) ? 0 : count;
    return [{ core: n ? `1-${n}` : '', colour: '', wire: '', from: c.from, to: c.to }];
  }
  // Flat ribbon and patch cables: pin n of one connector to pin n of the other.
  const boxes = boxesByDesignation(project);
  const a = c.from ? boxes.get(c.from)?.box : undefined, b = c.to ? boxes.get(c.to)?.box : undefined;
  if (!a || !b) return out;
  const bp = new Set(b.pins.map((p) => p.id));
  for (const p of a.pins.slice().sort((x, y) => natural(x.id, y.id))) {
    if (bp.has(p.id)) out.push({ core: p.id, colour: colours[Number(p.id) - 1] ?? '', wire: '', from: `${c.from}:${p.id}`, to: `${c.to}:${p.id}` });
  }
  return out;
}

function cableTable(project: Project, lib: Library, lang: Lang): ReportTable {
  const rows: ReportRow[] = [];
  for (const c of project.cables.slice().sort((a, b) => natural(a.id, b.id))) {
    const part = c.part ? findPart(lib, project.parts, c.part) : undefined;
    const ends = c.from || c.to ? `${c.from ?? ''} - ${c.to ?? ''}` : '';
    rows.push(H(c.id, part ? part.code : '', rt(lang, `kind.${c.kind}` as ReportTextKey), c.length ?? '', ends, pick(c.functionText, lang)));
    for (const k of cableCores(project, lib, c)) rows.push(R('', k.core, k.colour, k.spare ? rt(lang, 'val.spare') : k.wire, k.from, k.to));
  }
  return { id: 'cables', title: rt(lang, 'report.cables'), headers: [rt(lang, 'col.cable'), rt(lang, 'col.core'), rt(lang, 'col.colour'), rt(lang, 'col.wire'), rt(lang, 'col.from'), rt(lang, 'col.to')], widths: [30, 24, 22, 30, 60, 60], rows };
}

function pinTable(project: Project, lib: Library, lang: Lang): ReportTable {
  const nl = netlist(project, lib);
  const rows: ReportRow[] = [];
  const boxes: { page: Page; box: Extract<Page['elements'][number], { kind: 'box' }> }[] = [];
  for (const pg of project.pages) for (const e of pg.elements) if (e.kind === 'box' && e.designation && e.pins.length) boxes.push({ page: pg, box: e });
  boxes.sort((a, b) => natural(a.box.designation, b.box.designation));
  for (const { page, box } of boxes) {
    rows.push(H(box.designation, pick(box.functionText, lang).replace(/\n/g, ' '), box.mate ? `-> ${box.mate}` : ''));
    for (const p of box.pins.slice().sort((x, y) => natural(x.id, y.id))) {
      const g = nl.byPin.get(`${page.id}/${box.id}/${p.id}`);
      const d = [...new Set(destinations(g, { page: page.id, el: box.id, pin: p.id }).map((x) => x.label))];
      rows.push(R(p.id, p.name ?? '', d.join(', '), g?.numbers.join(', ') ?? ''));
    }
  }
  return { id: 'pins', title: rt(lang, 'report.pins'), headers: [rt(lang, 'col.pin'), rt(lang, 'col.name'), rt(lang, 'col.connectedTo'), rt(lang, 'col.wire')], widths: [20, 60, 120, 40], rows };
}

function bomTable(project: Project, lib: Library, lang: Lang): ReportTable {
  const bom = computeBom(project, lib);
  const cols = project.settings.bom.columns;
  const rows = bom.rows.map((r): ReportRow => ({ cells: cols.map((c) => bomCell(r, c)), heading: r.assembly }));
  const w: Record<string, number> = { designation: 36, position: 20, qty: 12, code: 44, description: 80, manufacturer: 28 };
  return { id: 'bom', title: rt(lang, 'report.bom'), headers: cols.map((c) => bomHeader(project, c, lang)), widths: cols.map((c) => w[c] ?? 24), rows };
}

function contentsTable(project: Project, lang: Lang): ReportTable {
  const rows = project.pages.map((p, i) => R(String(i + 1).padStart(2, '0'), pick(p.title, lang) || dt(lang, `type.${p.type}` as 'type.cover'), dt(lang, `type.${p.type}` as 'type.cover')));
  return { id: 'contents', title: rt(lang, 'report.contents'), headers: [rt(lang, 'col.no'), rt(lang, 'col.title'), rt(lang, 'col.type')], widths: [16, 120, 60], rows };
}

/** The symbols the project uses, once each, in library order (category, then id). */
export function usedSymbols(project: Project, libIn: Library): { id: string; title: string; source: string; category: string }[] {
  const lib = withProjectSymbols(libIn, project.symbols);
  const ids = new Set<string>();
  for (const pg of project.pages) for (const e of symbolsOf(pg)) ids.add(e.symbolId);
  return [...ids].map((id) => lib.symbols.get(id)).filter((d): d is NonNullable<typeof d> => !!d).sort((a, b) => natural(a.category, b.category) || natural(a.id, b.id)).map((d) => ({ id: d.id, title: d.title.en, source: d.source, category: d.category }));
}
function legendTable(project: Project, lib: Library, lang: Lang): ReportTable {
  const l = withProjectSymbols(lib, project.symbols);
  const rows = usedSymbols(project, lib).map((u) => R('', pick(l.symbols.get(u.id)?.title, lang) || u.title, u.source));
  return { id: 'legend', title: rt(lang, 'report.legend'), headers: [rt(lang, 'col.symbol'), rt(lang, 'col.meaning'), rt(lang, 'col.reference')], widths: [30, 70, 150], rows };
}

const potentialLabel = (project: Project, id: string, lang: Lang) => (id === 'signal' ? rt(lang, 'val.signal') : (project.potentials.find((p) => p.id === id)?.label ?? id));
function colourTable(project: Project, lang: Lang): ReportTable {
  const rows = project.wireClasses.map((c) => R(potentialLabel(project, c.id, lang), c.colour, colourName(c.colour, lang), c.crossSection ? `${c.crossSection} mm²` : '', c.type));
  if (project.wireTypes.length) {
    rows.push(H(rt(lang, 'val.wireTypes')));
    for (const w of project.wireTypes) rows.push(R(w.id, w.colour, colourName(w.colour, lang), w.crossSection ? `${w.crossSection} mm²` : '', w.type));
  }
  return { id: 'colours', title: rt(lang, 'report.colours'), headers: [rt(lang, 'col.function'), rt(lang, 'col.colour'), rt(lang, 'col.colourName'), rt(lang, 'col.crossSection'), rt(lang, 'col.type')], widths: [50, 20, 40, 30, 40], rows };
}
function suffixTable(project: Project, lang: Lang): ReportTable {
  const cfg = project.settings.numbering;
  const rows = project.wireClasses.map((c) => R(potentialLabel(project, c.id, lang), c.suffix, formatWireNumber(cfg.pattern, { n: cfg.start, page: 1, col: '1', row: 'A', potential: c.id, suffix: c.suffix })));
  return { id: 'suffixes', title: rt(lang, 'report.suffixes'), headers: [rt(lang, 'col.function'), rt(lang, 'col.suffix'), rt(lang, 'col.example')], widths: [60, 40, 60], rows };
}

function torqueTable(project: Project, lib: Library, lang: Lang): ReportTable {
  const ids = new Set<string>();
  for (const s of terminalStrips(project, lib)) for (const u of s.device?.rec?.parts ?? []) ids.add(u.part);
  for (const pp of project.projectParts) ids.add(pp.part);
  const parts = [...ids].map((id) => findPart(lib, project.parts, id)).filter((p): p is PartDef => !!p && p.category === 'terminals' && 'Tightening torque' in p.data).sort((a, b) => num(a.data['Conductor cross-section']) - num(b.data['Conductor cross-section']) || natural(a.code, b.code));
  const rows = parts.map((p) => R(p.code, p.data['Conductor cross-section'] ?? '', p.data['Tightening torque'] ?? '', p.source, p.verification === 'primary' ? rt(lang, 'val.verified') : rt(lang, 'val.unverified')));
  return { id: 'torque', title: rt(lang, 'report.torque'), headers: [rt(lang, 'col.part'), rt(lang, 'col.crossSection'), rt(lang, 'col.torque'), rt(lang, 'col.source'), rt(lang, 'col.status')], widths: [50, 26, 28, 110, 30], rows, note: rt(lang, 'note.torque') };
}

/** Label text of every device that has a function text or a nameplate text (device field "nameplate"). */
export function nameplateLabels(project: Project, libIn: Library): { key: string; lines: string[] }[] {
  const idx = deviceIndex(project, libIn);
  const lang = project.settings.drawingLanguage;
  const syms = withProjectSymbols(libIn, project.symbols).symbols;
  const out: { key: string; lines: string[] }[] = [];
  for (const d of idx.devices) {
    if (d.reps.every((r) => r.kind === 'assembly') || d.reps.every((r) => r.role === 'aux')) continue;
    if (d.reps.some((r) => r.symbolId && syms.get(r.symbolId)?.function === 'terminal')) continue; // terminal strips have markers, not nameplates
    let text = d.rec?.fields.nameplate ?? '';
    if (!text) {
      for (const r of d.reps) {
        const pg = project.pages[r.pageIndex];
        const el = pg?.elements.find((e) => e.id === r.el);
        if (el && (el.kind === 'symbol' || el.kind === 'box')) {
          const t = pick(el.functionText, lang);
          if (t) { text = t; break; }
        }
      }
    }
    if (!text) continue;
    const des = d.reps[0] ? (project.pages[d.reps[0].pageIndex]?.elements.find((e) => e.id === d.reps[0].el) as { designation?: string } | undefined)?.designation ?? d.key : d.key;
    out.push({ key: d.key, lines: [des, ...text.split('\n').map((l) => l.trim()).filter(Boolean)] });
  }
  return out;
}
function nameplateTable(project: Project, lib: Library, lang: Lang): ReportTable {
  const rows = nameplateLabels(project, lib).map((n) => R(n.lines[0], n.lines.join(' / ')));
  return { id: 'nameplates', title: rt(lang, 'report.nameplates'), headers: [rt(lang, 'col.designation'), rt(lang, 'col.text')], widths: [40, 180], rows };
}

function wireMarkerTable(project: Project, lib: Library, lang: Lang): ReportTable {
  const by = new Map<string, { qty: number; xs: string; colour: string }>();
  for (const c of connections(project, lib)) {
    if (!c.number) continue;
    const w = c.wire?.wire;
    const spec = wireSpec(project, { wireType: w?.wireType, potential: w?.potential }, c.group.potential);
    const r = by.get(c.number) ?? { qty: 0, xs: spec.crossSection, colour: spec.colour };
    r.qty += 2;
    by.set(c.number, r);
  }
  const rows = [...by.entries()].sort((a, b) => natural(a[0], b[0])).map(([n, r]) => R(n, String(r.qty), r.xs ? `${r.xs} mm²` : '', r.colour));
  return { id: 'wireMarkers', title: rt(lang, 'report.wireMarkers'), headers: [rt(lang, 'col.marker'), rt(lang, 'col.qty'), rt(lang, 'col.crossSection'), rt(lang, 'col.colour')], widths: [60, 24, 30, 24], rows };
}
function terminalMarkerTable(project: Project, lib: Library, lang: Lang): ReportTable {
  const rows: ReportRow[] = [];
  for (const s of terminalStrips(project, lib)) for (const t of s.terminals) rows.push(R(s.designation, t.no || '-', '1'));
  return { id: 'terminalMarkers', title: rt(lang, 'report.terminalMarkers'), headers: [rt(lang, 'col.strip'), rt(lang, 'col.marker'), rt(lang, 'col.qty')], widths: [60, 40, 24], rows };
}

const memo = new WeakMap<Project, { lib: Library; tables: Map<ReportId, ReportTable> }>();

/** A report as a table, in the project's drawing language; cached until the project changes. */
export function reportTable(project: Project, lib: Library, id: ReportId): ReportTable {
  let hit = memo.get(project);
  if (!hit || hit.lib !== lib) memo.set(project, (hit = { lib, tables: new Map() }));
  const cached = hit.tables.get(id);
  if (cached) return cached;
  const lang = project.settings.drawingLanguage;
  let t: ReportTable;
  switch (id) {
    case 'terminals': t = terminalTable(project, lib, lang); break;
    case 'cables': t = cableTable(project, lib, lang); break;
    case 'wires': t = wireTable(project, lib, lang); break;
    case 'pins': t = pinTable(project, lib, lang); break;
    case 'bom': t = bomTable(project, lib, lang); break;
    case 'contents': t = contentsTable(project, lang); break;
    case 'legend': t = legendTable(project, lib, lang); break;
    case 'colours': t = colourTable(project, lang); break;
    case 'suffixes': t = suffixTable(project, lang); break;
    case 'torque': t = torqueTable(project, lib, lang); break;
    case 'nameplates': t = nameplateTable(project, lib, lang); break;
    case 'wireMarkers': t = wireMarkerTable(project, lib, lang); break;
    case 'terminalMarkers': t = terminalMarkerTable(project, lib, lang); break;
  }
  hit.tables.set(id, t);
  return t;
}

/** Header and rows of a table as plain rows, for CSV and XLSX. */
export const tableMatrix = (t: ReportTable): string[][] => [t.headers, ...t.rows.map((r) => r.cells.concat(Array(Math.max(0, t.headers.length - r.cells.length)).fill('')))];
