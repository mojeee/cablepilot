// Wires: conductor colours, the company wire-class table, wire types and automatic wire numbering
// (brief, M3). The schematic is the source of truth (rule 1): numbers are computed from the nets
// (a net, and the nets joined to it across pages by interruption points, carries one number) and
// stored on the wires so they print and export; renumbering is a command and undoes like any edit.

import { netGroups, projectNets, type Net } from './connectivity';
import { zoneAt } from './devices';
import type { Library } from './library/types';
import { DEFAULT_NUMBERING, DEFAULT_WIRE_CLASSES, NUMBERING_PRESETS } from './model/wireDefaults';
import type { NumberingSettings, Page, Project, WireClass, WireEl, WireType } from './model/types';

/**
 * Conductor colour codes of IEC 60757 with screen colours. The names match
 * library/colours/iec-60757.json (a test compares them); the hex values are only how the colour is
 * shown on screen and on paper, not a value of the standard. White is drawn light grey so it is
 * visible on white paper. docs/to-verify.md lists the code table.
 */
export const WIRE_COLOURS: { code: string; name: { en: string; it: string }; hex: string }[] = [
  { code: 'BK', name: { en: 'black', it: 'nero' }, hex: '#000000' },
  { code: 'BN', name: { en: 'brown', it: 'marrone' }, hex: '#8a5a2b' },
  { code: 'RD', name: { en: 'red', it: 'rosso' }, hex: '#d40000' },
  { code: 'OG', name: { en: 'orange', it: 'arancione' }, hex: '#f08a00' },
  { code: 'YE', name: { en: 'yellow', it: 'giallo' }, hex: '#e6c800' },
  { code: 'GN', name: { en: 'green', it: 'verde' }, hex: '#1a8f1a' },
  { code: 'BU', name: { en: 'blue', it: 'blu' }, hex: '#1b4fd8' },
  { code: 'VT', name: { en: 'violet', it: 'viola' }, hex: '#7a2bbf' },
  { code: 'GY', name: { en: 'grey', it: 'grigio' }, hex: '#7d7d7d' },
  { code: 'WH', name: { en: 'white', it: 'bianco' }, hex: '#b8b8b8' },
  { code: 'PK', name: { en: 'pink', it: 'rosa' }, hex: '#e87ca0' },
  { code: 'TQ', name: { en: 'turquoise', it: 'turchese' }, hex: '#1ab7b0' },
  { code: 'GNYE', name: { en: 'green-and-yellow', it: 'giallo-verde' }, hex: '#1a8f1a' },
];
export const colourHex = (code: string): string => WIRE_COLOURS.find((c) => c.code === code)?.hex ?? '#000000';
export const colourName = (code: string, lang: 'en' | 'it'): string => WIRE_COLOURS.find((c) => c.code === code)?.name[lang] ?? code;
/** GNYE is drawn green with a yellow dashed stripe over it. */
export const STRIPE_HEX = '#e6c800';

export { DEFAULT_NUMBERING, DEFAULT_WIRE_CLASSES, NUMBERING_PRESETS };

/** The wire class of a potential; the class "signal" for a wire with no potential or an unlisted one. */
export function classFor(project: Project, potential?: string): WireClass | undefined {
  return (potential ? project.wireClasses.find((c) => c.id === potential) : undefined) ?? project.wireClasses.find((c) => c.id === 'signal');
}

export interface WireSpec {
  colour: string;
  crossSection: string;
  type: string;
  suffix: string;
}
/** What a wire is made of: its wire type if it names one, else the class of its potential; the suffix is the class's. */
export function wireSpec(project: Project, wire: Pick<WireEl, 'wireType' | 'potential'>, netPotential?: string): WireSpec {
  const cls = classFor(project, wire.potential ?? netPotential);
  const wt: WireType | undefined = wire.wireType ? project.wireTypes.find((w) => w.id === wire.wireType) : undefined;
  return {
    colour: wt?.colour ?? cls?.colour ?? 'BK',
    crossSection: wt?.crossSection ?? cls?.crossSection ?? '',
    type: wt?.type ?? cls?.type ?? '',
    suffix: cls?.suffix ?? '',
  };
}
/** "10 mm² BK": the label of a bundle of wires. */
export const bundleLabel = (s: WireSpec): string => `${s.crossSection ? `${s.crossSection} mm²` : ''} ${s.colour}`.trim();

export interface NumberCtx {
  n: number;
  page: number;
  col: string;
  row: string;
  potential: string;
  suffix: string;
}
/** Fills a numbering pattern: {n} {n:3} (padded counter), {page} {page:2}, {col}, {row}, {potential}, {suffix}. */
export function formatWireNumber(pattern: string, c: NumberCtx): string {
  return pattern.replace(/\{(\w+)(?::(\d+))?\}/g, (m, k: string, pad?: string) => {
    const v = k === 'n' ? c.n : k === 'page' ? c.page : k === 'col' ? c.col : k === 'row' ? c.row : k === 'potential' ? c.potential : k === 'suffix' ? c.suffix : undefined;
    if (v === undefined) return m;
    return typeof v === 'number' && pad ? String(v).padStart(Number(pad), '0') : String(v);
  });
}

/** Page types whose wires are numbered: single-line pages, data pages and report pages are not. */
const NUMBERED = new Set<Page['type']>(['power', 'control', 'plc', 'terminals', 'layout', 'cables']);
export const isNumbered = (pg: Page): boolean => NUMBERED.has(pg.type);

/**
 * Numbers the wires of the project (or of the groups that touch one page). A net and every net
 * joined to it by interruption points or mated connectors form one group and share one number. The
 * counter is per potential, per page and column, or single, by `settings.numbering.scheme`; the
 * pattern builds the text. Groups are taken in reading order. Numbers typed by hand (numberLocked)
 * stay and are never given twice.
 */
export function renumberWires(project: Project, lib: Library, pageId?: string, nets: Net[] = projectNets(project, lib)): Project {
  const cfg = project.settings.numbering;
  const byNet = new Map(nets.map((n) => [n.id, n]));
  const pageIdx = new Map(project.pages.map((p, i) => [p.id, i]));
  const wireOf = new Map<string, { page: Page; wire: WireEl }>();
  for (const pg of project.pages) for (const e of pg.elements) if (e.kind === 'wire') wireOf.set(`${pg.id}/${e.id}`, { page: pg, wire: e });

  interface G { wires: { page: Page; wire: WireEl }[]; potential: string; firstPage: number; fx: number; fy: number; locked?: string; touched: boolean }
  const groups: G[] = [];
  for (const g of netGroups(project, lib, nets)) {
    const wires: G['wires'] = [];
    let potential = g.potentials[0] ?? '';
    for (const nid of g.nets) for (const wid of byNet.get(nid)?.wires ?? []) {
      const w = wireOf.get(`${byNet.get(nid)?.page}/${wid}`);
      if (w && isNumbered(w.page) && !w.wire.bundle) wires.push(w);
    }
    if (wires.length === 0) continue;
    if (!potential) potential = wires.find((w) => w.wire.potential)?.wire.potential ?? '';
    wires.sort((a, b) => (pageIdx.get(a.page.id) ?? 0) - (pageIdx.get(b.page.id) ?? 0));
    const first = wires[0];
    const pi = pageIdx.get(first.page.id) ?? 0;
    const onFirst = wires.filter((w) => w.page === first.page).flatMap((w) => w.wire.points).sort((a, b) => a.x - b.x || a.y - b.y)[0];
    const lockedWire = wires.find((w) => w.wire.numberLocked && w.wire.number);
    groups.push({ wires, potential, firstPage: pi, fx: onFirst.x, fy: onFirst.y, locked: lockedWire?.wire.number, touched: !pageId || wires.some((w) => w.page.id === pageId) });
  }
  groups.sort((a, b) => a.firstPage - b.firstPage || a.fx - b.fx || a.fy - b.fy);

  const used = new Set<string>();
  for (const g of groups) {
    if (g.locked) used.add(g.locked);
    else if (!g.touched) for (const w of g.wires) if (w.wire.number) used.add(w.wire.number);
  }
  const counters = new Map<string, number>();
  const assigned = new Map<string, string>();
  for (const g of groups) {
    if (!g.touched) continue;
    if (g.locked) {
      for (const w of g.wires) assigned.set(`${w.page.id}/${w.wire.id}`, g.locked);
      continue;
    }
    const page = project.pages[g.firstPage];
    const zone = zoneAt(project, page, g.fx, g.fy);
    const spec = wireSpec(project, g.wires[0].wire, g.potential);
    const scope = cfg.scheme === 'potential' ? `p:${g.potential}` : cfg.scheme === 'page-column' ? `c:${g.firstPage}:${zone.col}` : 's';
    let k = counters.get(scope) ?? cfg.start - cfg.step;
    let text: string;
    do {
      k += cfg.step;
      text = formatWireNumber(cfg.pattern, { n: k, page: g.firstPage + 1, col: zone.col, row: zone.row, potential: g.potential, suffix: spec.suffix });
    } while (used.has(text));
    counters.set(scope, k);
    used.add(text);
    for (const w of g.wires) assigned.set(`${w.page.id}/${w.wire.id}`, text);
  }
  let changed = false;
  const pages = project.pages.map((pg) => {
    let pc = false;
    const elements = pg.elements.map((e) => {
      if (e.kind !== 'wire') return e;
      const n = assigned.get(`${pg.id}/${e.id}`);
      if (n === undefined || e.number === n) return e;
      pc = true;
      return { ...e, number: n };
    });
    if (pc) changed = true;
    return pc ? { ...pg, elements } : pg;
  });
  return changed ? { ...project, pages } : project;
}
