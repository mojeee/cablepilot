// The electrical rule check (CLAUDE.md, rule 5): continuous and incremental. Page-local rules are
// computed per page object and cached (an edit recomputes only the page that changed, like nets and
// device scans); project-wide rules (duplicates, coils and contacts, PLC addresses, PE, potentials
// joined across pages) are cheap aggregations over the cached per-page facts. A finding names its
// page and position (the marker on the page), says which rule found it, and carries a one-click fix
// (plain commands, so it undoes like any edit) when the fix is a plain edit.
//
// Standards: every rule cites its standard and clause in a comment. Clause numbers recorded from
// secondary sources are listed in docs/to-verify.md; checks that depend on installation conditions
// show their assumptions and do not replace the engineer's verification (CLAUDE.md, rule 2).

import { apply, type Command } from './commands';
import { netGroups, pageNets, projectNets, type Net } from './connectivity';
import { deviceIndex, keyOf, type Device } from './devices';
import { boxPinsWorld } from './draw/box';
import { pinWorld } from './draw/symbol';
import { pointOnPolyline, samePt } from './geometry/wires';
import type { Library } from './library/types';
import { findPart, isTerminalPart, symbolRole, withProjectSymbols } from './library/types';
import type { DeviceRec, Page, Project, Pt, SymbolEl, WireEl } from './model/types';
import { nextDesignation, parseDesignation } from './numbering';
import { capacityOf, minCrossSection } from './ampacity';
import { coreSpec } from './reports';
import { isNumbered, wireSpec } from './wires';

export type Severity = 'error' | 'warning' | 'info';
export const RULES = ['duplicate-designation', 'unconnected-wire', 'coil-no-contacts', 'contact-no-coil', 'contacts-exceeded', 'potential-conflict', 'cable-size', 'method-missing', 'colour-pe', 'colour-gnye', 'colour-neutral', 'missing-pe', 'terminal-wires', 'plc-address'] as const;
export type RuleId = (typeof RULES)[number];

export interface Fix {
  id: 'rename-designation' | 'remove-wire' | 'wire-type';
  args: Record<string, string | number>;
  commands: Command[];
}
export interface Finding {
  /** Stable while the problem stays the same: rule, page and subject. */
  id: string;
  rule: RuleId;
  severity: Severity;
  page?: string;
  element?: string;
  /** Where the marker sits on the page, in millimetres. */
  at?: Pt;
  args: Record<string, string | number>;
  fix?: Fix;
}
export interface CheckResult {
  findings: Finding[];
  errors: number;
  warnings: number;
  infos: number;
  byPage: Map<string, Finding[]>;
}

const SEVERITY: Record<RuleId, Severity> = {
  'duplicate-designation': 'error', 'unconnected-wire': 'warning', 'coil-no-contacts': 'warning', 'contact-no-coil': 'warning', 'contacts-exceeded': 'error', 'potential-conflict': 'error',
  'cable-size': 'warning', 'method-missing': 'info', 'colour-pe': 'error', 'colour-gnye': 'error', 'colour-neutral': 'warning', 'missing-pe': 'error', 'terminal-wires': 'warning', 'plc-address': 'error',
};
const mk = (rule: RuleId, id: string, p: Omit<Finding, 'id' | 'rule' | 'severity'>): Finding => ({ id: `${rule}:${id}`, rule, severity: SEVERITY[rule], ...p });

// ---- per-page facts, cached while the page object and what it depends on are unchanged --------------

interface DesigFact { key: string; cls: 'coil' | 'main' | 'box'; sl: boolean; el: string; x: number; y: number; des: string; letters: string; location?: string }
interface PlcFact { address: string; el: string; x: number; y: number }
interface PageFacts {
  local: Finding[];
  desig: DesigFact[];
  plc: PlcFact[];
  protective: boolean;
  live: boolean;
  pe: boolean;
  links: boolean;
  firstWire?: { el: string; at: Pt };
}
interface Deps { lib: Library; potentials: unknown; symbols: unknown; wireClasses: unknown; wireTypes: unknown; cables: unknown; parts: unknown; devices: unknown; method: string }
const cache = new WeakMap<Page, { deps: Deps; facts: PageFacts }>();
/** Counts page computations: tests use it to check that edits recheck only the pages that changed. */
export const checkStats = { pages: 0 };

const ptKey = (p: Pt): string => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`;
const recMaps = new WeakMap<DeviceRec[], Map<string, DeviceRec>>();
function recOf(devices: DeviceRec[], key: string): DeviceRec | undefined {
  let m = recMaps.get(devices);
  if (!m) recMaps.set(devices, (m = new Map(devices.map((r) => [r.designation, r]))));
  return m.get(key);
}
const numOf = (s: string | undefined): number => {
  const m = /\d+(?:[.,]\d+)?/.exec(s ?? '');
  return m ? Number(m[0].replace(',', '.')) : NaN;
};

const LIVE_KINDS = new Set(['ac', 'neutral', 'dc-plus', 'dc-minus', 'dc']);

function computeFacts(project: Project, page: Page, libIn: Library): PageFacts {
  checkStats.pages++;
  const lib = withProjectSymbols(libIn, project.symbols);
  const f: PageFacts = { local: [], desig: [], plc: [], protective: false, live: false, pe: false, links: false };
  const wires = page.elements.filter((e): e is WireEl => e.kind === 'wire');
  const syms = page.elements.filter((e): e is SymbolEl => e.kind === 'symbol');
  const nets = pageNets(project, page, libIn);
  if (wires[0]) f.firstWire = { el: wires[0].id, at: wires[0].points[0] };
  const sl = page.type === 'singleLine';

  // Pins of symbols and boxes, junctions: what a wire end can connect to.
  const pinPts = new Set<string>();
  const earthEls = new Set<string>();
  const symPins = new Map<string, { id: string; x: number; y: number }[]>();
  for (const el of page.elements) {
    if (el.kind === 'symbol') {
      const def = lib.symbols.get(el.symbolId);
      if (!def) continue;
      const pins = pinWorld(def, el);
      symPins.set(el.id, pins);
      for (const p of pins) pinPts.add(ptKey(p));
      if (def.function === 'earth-pe') earthEls.add(el.id);
    } else if (el.kind === 'box') for (const p of boxPinsWorld(el)) pinPts.add(ptKey(p));
    else if (el.kind === 'junction') pinPts.add(ptKey(el));
  }

  // Unconnected wire ends. Rule 5 of CLAUDE.md; IEC 61082-1 (connection lines join the connection
  // points of objects; a line ending in free space is unfinished). Clause: docs/to-verify.md.
  const bbox = wires.map((w) => ({ x0: Math.min(...w.points.map((p) => p.x)), x1: Math.max(...w.points.map((p) => p.x)), y0: Math.min(...w.points.map((p) => p.y)), y1: Math.max(...w.points.map((p) => p.y)) }));
  const endCount = new Map<string, number>();
  const endFree = (i: number, p: Pt): boolean => {
    const k = ptKey(p);
    endCount.set(k, (endCount.get(k) ?? 0) + 1);
    if (pinPts.has(k)) return false;
    for (let j = 0; j < wires.length; j++) {
      if (j === i) continue;
      const b = bbox[j];
      if (p.x < b.x0 - 1e-6 || p.x > b.x1 + 1e-6 || p.y < b.y0 - 1e-6 || p.y > b.y1 + 1e-6) continue;
      if (pointOnPolyline(p, wires[j].points)) return false;
    }
    return true;
  };
  wires.forEach((w, i) => {
    const a = w.points[0], z = w.points[w.points.length - 1];
    const freeA = endFree(i, a), freeZ = endFree(i, z);
    if (freeA && freeZ) f.local.push(mk('unconnected-wire', `${page.id}:${w.id}`, { page: page.id, element: w.id, at: a, args: { stray: 1 }, fix: { id: 'remove-wire', args: {}, commands: [{ type: 'el/remove', page: page.id, ids: [w.id] }] } }));
    else if (freeA || freeZ) f.local.push(mk('unconnected-wire', `${page.id}:${w.id}:${freeA ? 0 : 1}`, { page: page.id, element: w.id, at: freeA ? a : z, args: { stray: 0 } }));
  });

  // Potentials: two different potentials connected together in one net on this page.
  // IEC 60204-1, clause 13.2 (identification of conductors by potential) and the basic requirement
  // that circuits of different potential are not joined; here the potentials a net carries, by tags and wires.
  const netOfPin = new Map<string, Net>();
  for (const n of nets) {
    for (const p of n.pins) netOfPin.set(`${p.element}/${p.pin}`, n);
    const first = wires.find((w) => w.id === n.wires[0]);
    if (n.conflict) f.local.push(mk('potential-conflict', n.id, { page: page.id, element: first?.id, at: first?.points[0], args: { potentials: n.potentials.join(', ') } }));
    if (n.signals.length) f.links = true;
    const kind = n.potential ? project.potentials.find((p) => p.id === n.potential)?.kind : undefined;
    if (kind && LIVE_KINDS.has(kind)) f.live = true;
    if (kind === 'pe' || n.pins.some((p) => earthEls.has(p.element))) f.pe = true;
  }
  for (const el of page.elements) if (el.kind === 'box' && el.mate) f.links = true;

  // Conductor colour against the potential type. IEC 60204-1, clause 13.2.2 (protective conductor:
  // green-and-yellow, and green-and-yellow only for protective conductors) and 13.2.3 / IEC 60445
  // (neutral: blue). Clause numbers: docs/to-verify.md.
  const byId = new Map(wires.map((w) => [w.id, w]));
  const numbered = isNumbered(page);
  if (numbered) {
    for (const n of nets) {
      if (!n.potential) continue;
      const kind = project.potentials.find((p) => p.id === n.potential)?.kind;
      const bad: { w: WireEl; colour: string; viaCore: boolean; xs: string; type: string }[] = [];
      let rule: RuleId | undefined;
      for (const id of n.wires) {
        const w = byId.get(id);
        if (!w) continue;
        const spec = wireSpec(project, w, n.potential);
        const core = coreSpec(project, lib, w);
        const colour = core.colour ?? spec.colour;
        const r: RuleId | undefined = kind === 'pe' ? (colour !== 'GNYE' ? 'colour-pe' : undefined) : colour === 'GNYE' ? 'colour-gnye' : kind === 'neutral' && colour !== 'BU' ? 'colour-neutral' : undefined;
        if (r) { rule = r; bad.push({ w, colour, viaCore: !!core.colour, xs: spec.crossSection, type: spec.type }); }
      }
      if (!rule || !bad.length) continue;
      const target = rule === 'colour-gnye' ? undefined : rule === 'colour-pe' ? 'GNYE' : 'BU';
      const fixable = target && bad.every((b) => !b.viaCore);
      f.local.push(mk(rule, `${n.id}`, {
        page: page.id, element: bad[0].w.id, at: bad[0].w.points[0], args: { potential: n.potential, colour: bad[0].colour, to: target ?? '' },
        ...(fixable ? { fix: typedFix(project, page, bad.map((b) => b.w), target, bad[0].xs, bad[0].type) } : {}),
      }));
    }
  }

  // Terminals: more wires than the terminal connection allows. IEC 60204-1, clause 13.1.1 (the
  // connection of two or more conductors to one terminal connection point only where the terminal is
  // designed for it). The allowed number is the part's "Conductors per connection" data, else one.
  for (const el of syms) {
    const def = lib.symbols.get(el.symbolId);
    if (!def) continue;
    if (def.function === 'terminal' && el.designation) {
      const rec = recOf(project.devices, keyOf(page, el.designation, el.location));
      let max = 1;
      for (const u of rec?.parts ?? []) {
        const part = findPart(lib, project.parts, u.part);
        if (isTerminalPart(part) && part?.data['Conductors per connection']) max = Math.max(max, numOf(part.data['Conductors per connection']) || 1);
      }
      for (const p of symPins.get(el.id) ?? []) {
        const n = endCount.get(ptKey(p)) ?? 0;
        if (n > max) f.local.push(mk('terminal-wires', `${page.id}:${el.id}:${p.id}`, { page: page.id, element: el.id, at: { x: p.x, y: p.y }, args: { des: el.designation, no: el.value ?? p.id, n, max } }));
      }
    }
    // PLC addresses: collected for the project-wide duplicate check (the channel symbols; racks and cards arrive with M5).
    if ((def.function === 'plc-input' || def.function === 'plc-output') && el.value?.trim()) f.plc.push({ address: el.value.trim().toUpperCase(), el: el.id, x: el.x, y: el.y });
    // Designations (duplicates): coils, power parts and boxes; contacts and terminals are representations of a device.
    if (el.designation && def.function !== 'terminal') {
      const role = symbolRole(def);
      const letters = parseDesignation(el.designation).letters;
      if (role !== 'aux' && letters) f.desig.push({ key: keyOf(page, el.designation, el.location), cls: role === 'coil' ? 'coil' : 'main', sl, el: el.id, x: el.x, y: el.y, des: el.designation, letters, location: el.location });
    }
  }
  for (const el of page.elements) {
    if (el.kind !== 'box' || !el.designation) continue;
    const letters = parseDesignation(el.designation).letters;
    if (letters) f.desig.push({ key: keyOf(page, el.designation, el.location), cls: 'box', sl, el: el.id, x: el.x, y: el.y, des: el.designation, letters, location: el.location });
  }

  // Conductor cross-section against the protective device and the stated installation method.
  // IEC 60364-5-52 (current-carrying capacity, Annex B tables; a conductor must carry at least the
  // rated current of the device that protects it, with In <= Iz from IEC 60364-4-43 clause 433.2).
  // Assumptions are shown with every finding; values are unverified (shared/ampacity.ts, docs/to-verify.md).
  if (numbered) {
    for (const el of syms) {
      const def = lib.symbols.get(el.symbolId);
      if (!el.designation || (def?.function !== 'breaker' && def?.function !== 'fuse')) continue;
      const rec = recOf(project.devices, keyOf(page, el.designation, el.location));
      const rated = (rec?.parts ?? []).map((u) => numOf(findPart(lib, project.parts, u.part)?.data['Rated current'])).filter((n) => Number.isFinite(n));
      if (!rated.length) continue;
      const rating = Math.min(...rated);
      f.protective = true;
      if (!project.settings.installationMethod) continue;
      const seen = new Set<Net>();
      for (const p of symPins.get(el.id) ?? []) {
        const net = netOfPin.get(`${el.id}/${p.id}`);
        if (!net || seen.has(net)) continue;
        seen.add(net);
        const bad: { w: WireEl; xs: number; cap: number; colour: string; type: string }[] = [];
        for (const id of net.wires) {
          const w = byId.get(id);
          if (!w || w.bundle) continue;
          const spec = wireSpec(project, w, net.potential);
          const xs = numOf(coreSpec(project, lib, w).crossSection ?? spec.crossSection);
          const cap = capacityOf(project.settings.installationMethod, xs);
          if (cap !== undefined && cap < rating) bad.push({ w, xs, cap, colour: spec.colour, type: spec.type });
        }
        if (!bad.length) continue;
        const min = minCrossSection(project.settings.installationMethod, rating);
        const worst = bad.reduce((a, b) => (b.cap < a.cap ? b : a));
        const viaCable = bad.some((b) => b.w.cable);
        f.local.push(mk('cable-size', `${page.id}:${el.id}:${net.id}`, {
          page: page.id, element: worst.w.id, at: worst.w.points[0],
          args: { wire: worst.w.number ?? '', xs: worst.xs, cap: worst.cap, device: el.designation, rating, method: project.settings.installationMethod, min: min ?? '' },
          ...(min !== undefined && !viaCable ? { fix: typedFix(project, page, bad.map((b) => b.w), worst.colour, String(min), worst.type) } : {}),
        }));
      }
    }
  }
  return f;
}

/** Commands that give wires a wire type of a cross-section and colour (adding the type when it is new). */
function typedFix(project: Project, page: Page, wires: WireEl[], colour: string | undefined, xs: string, type: string): Fix {
  const col = colour ?? 'BK';
  const id = `${xs}mm2-${col}`;
  const commands: Command[] = [];
  if (!project.wireTypes.some((w) => w.id === id)) commands.push({ type: 'project/wires', wireTypes: [...project.wireTypes, { id, type, crossSection: xs, colour: col }] });
  for (const w of wires) commands.push({ type: 'el/update', page: page.id, id: w.id, patch: { wireType: id } });
  return { id: 'wire-type', args: { xs, colour: col }, commands };
}

function factsOf(project: Project, page: Page, lib: Library): PageFacts {
  const deps: Deps = { lib, potentials: project.potentials, symbols: project.symbols, wireClasses: project.wireClasses, wireTypes: project.wireTypes, cables: project.cables, parts: project.parts, devices: project.devices, method: project.settings.installationMethod };
  const hit = cache.get(page);
  if (hit && (Object.keys(deps) as (keyof Deps)[]).every((k) => hit.deps[k] === deps[k])) return hit.facts;
  const facts = computeFacts(project, page, lib);
  cache.set(page, { deps, facts });
  return facts;
}

// ---- contacts available on a device's parts ------------------------------------------------------

/** "1 NO + 1 NC", "2 CO": normally open, normally closed and changeover contacts a part provides. */
export function parseContacts(s: string | undefined): { no: number; nc: number; co: number } {
  const out = { no: 0, nc: 0, co: 0 };
  for (const m of (s ?? '').matchAll(/(\d+)\s*(NO|NC|CO)\b/gi)) out[m[2].toLowerCase() as 'no' | 'nc' | 'co'] += Number(m[1]);
  return out;
}

// ---- project-wide rules ------------------------------------------------------------------------

const memo = new WeakMap<Project, { lib: Library; result: CheckResult }>();

export function runChecks(project: Project, libIn: Library): CheckResult {
  const hit = memo.get(project);
  if (hit && hit.lib === libIn) return hit.result;
  const lib = withProjectSymbols(libIn, project.symbols);
  const findings: Finding[] = [];
  const pageIdx = new Map(project.pages.map((p, i) => [p.id, i]));
  const facts = project.pages.map((p) => factsOf(project, p, libIn));
  for (const f of facts) findings.push(...f.local);

  // Duplicate reference designations. IEC 81346-1 (a reference designation identifies one object
  // uniquely within its aspect); clause: docs/to-verify.md. Two coils, two power parts or two boxes
  // with the same full designation on pages of the same kind; contacts and a single-line plus
  // multi-line pair are one device, not duplicates (docs/decisions.md, M2). The later one is flagged.
  const seen = new Map<string, { page: Page; d: DesigFact }>();
  project.pages.forEach((pg, i) => {
    for (const d of facts[i].desig) {
      const k = `${d.key}|${d.cls}|${d.sl ? 'sl' : 'ml'}`;
      const first = seen.get(k);
      if (!first) { seen.set(k, { page: pg, d }); continue; }
      const letters = d.letters;
      const next = nextDesignation(project, pg, letters, d.location);
      findings.push(mk('duplicate-designation', `${pg.id}:${d.el}`, {
        page: pg.id, element: d.el, at: { x: d.x, y: d.y }, args: { des: d.des, other: first.page.id },
        fix: { id: 'rename-designation', args: { to: next }, commands: [{ type: 'device/relink', page: pg.id, id: d.el, designation: next }] },
      }));
    }
  });

  // Coils and contacts. IEC 81346-2 class K (relays and contactors) and IEC 61082-1 (contact
  // cross-references): a relay or contactor coil needs contacts, a contact needs its coil or device.
  // Contacts used against contacts available: IEC 60947-5-1 (auxiliary contacts of control devices) as
  // listed in the device's parts data (clause: docs/to-verify.md).
  const idx = deviceIndex(project, libIn);
  for (const d of idx.devices) {
    const coils = d.reps.filter((r) => r.kind === 'symbol' && r.role === 'coil');
    const aux = d.reps.filter((r) => r.role === 'aux' && r.kind === 'symbol');
    const mains = d.reps.filter((r) => r.role === 'main' && r.kind !== 'assembly');
    const at = (r: Device['reps'][number]) => ({ page: project.pages[r.pageIndex].id, element: r.el, at: { x: r.x, y: r.y } });
    const des = designationOf(project, d);
    if (coils.length && !aux.length && !mains.length && parseDesignation(d.key).letters?.startsWith('K')) findings.push(mk('coil-no-contacts', d.key, { ...at(coils[0]), args: { des } }));
    if (aux.length && !coils.length && !mains.length) findings.push(mk('contact-no-coil', d.key, { ...at(aux[0]), args: { des } }));
    if (aux.length && d.rec) {
      let any = false;
      const have = { no: 0, nc: 0, co: 0 };
      for (const u of d.rec.parts) {
        const data = findPart(lib, project.parts, u.part)?.data;
        for (const key of ['Auxiliary contacts', 'Contacts']) {
          if (!data?.[key]) continue;
          any = true;
          const c = parseContacts(data[key]);
          have.no += c.no * u.qty; have.nc += c.nc * u.qty; have.co += c.co * u.qty;
        }
      }
      const used = { no: aux.filter((r) => r.contact === 'no').length, nc: aux.filter((r) => r.contact === 'nc').length };
      // A changeover contact serves as one NO or one NC.
      const short = Math.max(0, used.no - have.no) + Math.max(0, used.nc - have.nc) - have.co;
      if (any && short > 0) findings.push(mk('contacts-exceeded', d.key, { ...at(aux[aux.length - 1]), args: { des, used: contactText(used.no, used.nc, 0), have: contactText(have.no, have.nc, have.co) } }));
    }
  }

  // Two potentials connected together across pages (interruption points, mated connectors).
  // Same rule as above; only groups that no single page already reports.
  if (facts.some((f) => f.links)) {
    const nets = projectNets(project, libIn);
    const byId = new Map(nets.map((n) => [n.id, n]));
    for (const g of netGroups(project, libIn, nets)) {
      if (!g.conflict || g.nets.some((id) => byId.get(id)?.conflict)) continue;
      const n = byId.get(g.nets[0]);
      const pg = project.pages.find((p) => p.id === n?.page);
      const w = pg?.elements.find((e) => e.id === n?.wires[0]) as WireEl | undefined;
      findings.push(mk('potential-conflict', g.id, { page: n?.page, element: w?.id, at: w?.points[0], args: { potentials: g.potentials.join(', ') } }));
    }
  }

  // PLC addresses used twice. Each channel (input or output) has one address in the controller's
  // address space; two channels with one address would drive or read the same point (rule 5 of CLAUDE.md).
  const addr = new Map<string, { page: Page }>();
  project.pages.forEach((pg, i) => {
    for (const a of facts[i].plc) {
      const first = addr.get(a.address);
      if (!first) { addr.set(a.address, { page: pg }); continue; }
      findings.push(mk('plc-address', `${pg.id}:${a.el}`, { page: pg.id, element: a.el, at: { x: a.x, y: a.y }, args: { address: a.address, other: first.page.id } }));
    }
  });

  // Missing PE connection. IEC 60204-1, clause 8.2 (protective bonding: exposed conductive parts are
  // connected to the protective bonding circuit) and IEC 61439-1 clause 8.4.3 (protective circuits).
  // Clauses: docs/to-verify.md. Here: live circuits are drawn but no PE conductor or earth symbol is connected.
  const livePage = facts.findIndex((f) => f.live);
  if (livePage >= 0 && !facts.some((f) => f.pe)) findings.push(mk('missing-pe', 'project', { page: project.pages[livePage].id, args: {} }));

  // Installation method not stated while protective devices with a rated current are drawn.
  const prot = facts.findIndex((f) => f.protective);
  if (prot >= 0 && !project.settings.installationMethod) findings.push(mk('method-missing', 'project', { page: project.pages[prot].id, args: {} }));

  const rank = { error: 0, warning: 1, info: 2 } as const;
  findings.sort((a, b) => rank[a.severity] - rank[b.severity] || (pageIdx.get(a.page ?? '') ?? -1) - (pageIdx.get(b.page ?? '') ?? -1) || (a.at?.y ?? 0) - (b.at?.y ?? 0) || (a.at?.x ?? 0) - (b.at?.x ?? 0) || a.id.localeCompare(b.id));
  const byPage = new Map<string, Finding[]>();
  for (const f of findings) if (f.page) (byPage.get(f.page) ?? byPage.set(f.page, []).get(f.page)!).push(f);
  const result: CheckResult = { findings, errors: findings.filter((f) => f.severity === 'error').length, warnings: findings.filter((f) => f.severity === 'warning').length, infos: findings.filter((f) => f.severity === 'info').length, byPage };
  memo.set(project, { lib: libIn, result });
  return result;
}

const contactText = (no: number, nc: number, co: number): string => [no && `${no} NO`, nc && `${nc} NC`, co && `${co} CO`].filter(Boolean).join(' + ') || '0';
/** The designation as drawn on the device's first representation (the key adds aspects). */
function designationOf(project: Project, d: Device): string {
  const r = d.reps[0];
  const el = r ? project.pages[r.pageIndex]?.elements.find((e) => e.id === r.el) : undefined;
  return el && (el.kind === 'symbol' || el.kind === 'box') && el.designation ? el.designation : d.key;
}

/**
 * Every plain fix, in one list of commands: fixes are applied one after another (each check is
 * re-run), so two fixes never make the same choice twice (e.g. two duplicates get different numbers).
 */
export function fixAllCommands(project: Project, lib: Library): Command[] {
  const cmds: Command[] = [];
  const tried = new Set<string>();
  let p = project;
  for (let i = 0; i < 200; i++) {
    const f = runChecks(p, lib).findings.find((x) => x.fix && !tried.has(x.id));
    if (!f?.fix) break;
    tried.add(f.id);
    const next = apply(p, { type: 'batch', label: 'fix', commands: f.fix.commands }, { lib });
    if (next === p) continue;
    cmds.push(...f.fix.commands);
    p = next;
  }
  return cmds;
}
