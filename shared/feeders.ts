// Feeders and the "size the whole project" review (product rule 12, M6 part 1). A feeder is a load (a motor, or any
// device with load data) and the series chain the schematic shows between it and the supply: the overload relay and
// contactors, the terminals, and the first breaker or fuse (where the chain stops). Everything is read from the
// schematic (rule 1); the numbers come from shared/sizing.ts and the ranking from shared/stock.ts.
//
// A line is one thing to size: a breaker, a contactor, an overload relay, a cable, or the plain wires of the feeder.
// Each line has its requirement (text, assumptions, unverified values), what the project has now, and ranked
// options. Confirming an option is one command (`lineCommands`); "accept all" is one batch (`acceptAllCommand`).
// Nothing here changes the project.

import type { Bom } from './bom';
import type { Command } from './commands';
import { netGroups, projectNets, type Net } from './connectivity';
import { deviceIndex, type Device } from './devices';
import type { Library, PartDef } from './library/types';
import { findPart, withProjectSymbols } from './library/types';
import type { CableRec, DeviceRec, LoadData, Page, Project, WireEl } from './model/types';
import { coreSpec } from './reports';
import { correctedCapacity } from './ampacity';
import { t } from './i18n';
import {
  breakerMeets, breakerRequirement, cableMeets, cableRequirementText, contactorMeets, contactorRequirement, DATA, loadCurrent, numOf, overloadMeets,
  overloadRequirement, rangeOf, sizeCable, SIZING_NOTE, type CableSizing, type Match, type Requirement,
} from './sizing';
import { isMetres, rankOptions, type Option, type StockList } from './stock';
import { isNumbered, wireSpec } from './wires';

export { SIZING_NOTE };
export type LineRole = 'breaker' | 'contactor' | 'overload' | 'cable' | 'wires';
export type LineStatus = 'ok' | 'change' | 'unavailable' | 'missing';

export interface Line {
  /** Stable: feeder, role and subject. */
  id: string;
  feeder: string;
  role: LineRole;
  /** The device designation, the cable id, or '' for the wires. */
  subject: string;
  /** ok: what the project has meets the requirement. change: a proposal exists. unavailable: nothing meets it. missing: data is missing (see `missing`). */
  status: LineStatus;
  requirement?: Requirement;
  /** What the project has now, as text ("GEN-MCB-3P-C32A", "2.5 mm²"), and why it does not meet the requirement. */
  current?: { label: string; part?: string; reasons: string[] };
  options: Option[];
  /** The best option; for the wires, the cross-section to give them. */
  proposal?: { option?: Option; xs?: number };
  /** Cable lines: the sizing result behind the requirement (Iz, factors, voltage drop). */
  cable?: CableSizing;
  /** Inputs still needed: load fields ('powerKw', 'cosPhi', 'efficiency', 'current') or 'installationMethod'. */
  missing: string[];
}
export interface Feeder {
  /** Designation of the load device. */
  load: string;
  data?: LoadData;
  /** Design current Ib. */
  ib?: number;
  ibSource?: 'nameplate' | 'computed';
  /** Length used for the voltage drop, metres, and where it came from. */
  length?: { metres: number; source: 'cable' | 'wire' | 'load' };
  lines: Line[];
  /** Load fields missing for the whole feeder. */
  missing: string[];
}

// ---- finding the feeders in the schematic ---------------------------------------------------------------

interface Graph {
  netsOfElement: Map<string, Net[]>;
  netsOfGroup: Map<string, Net[]>;
  groupOfNet: Map<string, string>;
  info: Map<string, { fn: string; key: string }>;
}
function buildGraph(project: Project, lib: Library): Graph {
  const idx = deviceIndex(project, lib);
  const syms = withProjectSymbols(lib, project.symbols).symbols;
  const nets = projectNets(project, lib);
  const netsOfElement = new Map<string, Net[]>();
  const info = new Map<string, { fn: string; key: string }>();
  for (const n of nets) for (const p of n.pins) (netsOfElement.get(`${n.page}/${p.element}`) ?? netsOfElement.set(`${n.page}/${p.element}`, []).get(`${n.page}/${p.element}`)!).push(n);
  for (const [k, hit] of idx.byEl) info.set(k, { fn: hit.rep.symbolId ? syms.get(hit.rep.symbolId)?.function ?? '' : hit.rep.kind, key: hit.device.key });
  const groups = netGroups(project, lib, nets);
  const netsOfGroup = new Map<string, Net[]>();
  const groupOfNet = new Map<string, string>();
  const byId = new Map(nets.map((n) => [n.id, n]));
  for (const g of groups) {
    netsOfGroup.set(g.id, g.nets.map((id) => byId.get(id) as Net));
    for (const id of g.nets) groupOfNet.set(id, g.id);
  }
  return { netsOfElement, netsOfGroup, groupOfNet, info };
}

interface Chain {
  breakers: string[];
  contactors: string[];
  overloads: string[];
  wires: { w: WireEl; page: string; colour: string; type: string; xs: number }[];
}
/** Walks from a load toward the supply through terminals, overload relays and contactors, stopping at the first breaker or fuse. */
function chainOf(project: Project, lib: Library, g: Graph, dev: Device): Chain {
  const out: Chain = { breakers: [], contactors: [], overloads: [], wires: [] };
  const seenEl = new Set<string>(), seenGroup = new Set<string>(), seenWire = new Set<string>();
  const queue = dev.reps.filter((r) => r.kind !== 'assembly').map((r) => `${r.page}/${r.el}`);
  queue.forEach((q) => seenEl.add(q));
  const pages = new Map(project.pages.map((p) => [p.id, p]));
  const add = (list: string[], k: string) => { if (!list.includes(k)) list.push(k); };
  while (queue.length) {
    const e = queue.shift() as string;
    for (const n of g.netsOfElement.get(e) ?? []) {
      const gid = g.groupOfNet.get(n.id) ?? n.id;
      if (seenGroup.has(gid)) continue;
      seenGroup.add(gid);
      for (const net of g.netsOfGroup.get(gid) ?? [n]) {
        const pe = project.potentials.find((p) => p.id === net.potential)?.kind === 'pe';
        for (const wid of net.wires) {
          const w = pages.get(net.page)?.elements.find((x) => x.id === wid);
          if (!w || w.kind !== 'wire' || w.bundle || pe || !isNumbered(pages.get(net.page) as Page) || seenWire.has(`${net.page}/${wid}`)) continue;
          seenWire.add(`${net.page}/${wid}`);
          const spec = wireSpec(project, w, net.potential);
          if (spec.colour === 'GNYE') continue;
          out.wires.push({ w, page: net.page, colour: spec.colour, type: spec.type, xs: numOf(coreSpec(project, lib, w).crossSection ?? spec.crossSection) });
        }
        for (const p of net.pins) {
          const k = `${net.page}/${p.element}`;
          if (seenEl.has(k)) continue;
          const el = g.info.get(k);
          if (!el) continue;
          if (el.fn === 'breaker' || el.fn === 'fuse') { add(out.breakers, el.key); seenEl.add(k); }
          else if (el.fn === 'contactor' || el.fn === 'overload' || el.fn === 'terminal') {
            seenEl.add(k);
            queue.push(k);
            if (el.fn === 'contactor') add(out.contactors, el.key);
            if (el.fn === 'overload') add(out.overloads, el.key);
          }
        }
      }
    }
  }
  return out;
}

// ---- sizing a feeder ------------------------------------------------------------------------------------

export interface SizingContext {
  project: Project;
  lib: Library;
  stock: StockList | null;
  bom: Bom;
}
const partsOf = (c: SizingContext): PartDef[] => [...c.lib.parts.values(), ...c.project.parts.filter((p) => !c.lib.parts.has(p.id))];
const typesOf = (role: LineRole): string[] => (role === 'breaker' ? ['MCB', 'MPCB'] : role === 'contactor' ? ['Contactor'] : role === 'overload' ? ['Overload relay'] : ['Power cable']);
const r1 = (x: number) => Math.round(x * 10) / 10;

/** The part of a device with a sizing type of this role, if it has one. */
function currentPart(c: SizingContext, rec: { parts: { part: string; qty?: number }[] } | undefined, role: LineRole): PartDef | undefined {
  for (const u of rec?.parts ?? []) {
    const p = findPart(c.lib, c.project.parts, u.part);
    if (p && typesOf(role).includes(p.data[DATA.type])) return p;
  }
  return undefined;
}
const partLabel = (p: PartDef): string => p.code;

/** Sort key: closeness to the requirement, smallest rating first. */
function sortKey(role: LineRole, p: PartDef): number {
  const d = p.data;
  if (role === 'breaker') return d[DATA.type] === 'MPCB' ? (rangeOf(d[DATA.range])?.[1] ?? 1e9) : numOf(d[DATA.rated]);
  if (role === 'contactor') return numOf(d[DATA.ac3]);
  if (role === 'overload') { const r = rangeOf(d[DATA.range]); return r ? r[1] - r[0] : 1e9; }
  return numOf(d[DATA.xs]);
}
function candidates(c: SizingContext, role: LineRole, meets: (d: Record<string, string>) => Match & { inProtect?: number }): { part: PartDef; match: Match & { inProtect?: number } }[] {
  return partsOf(c).filter((p) => typesOf(role).includes(p.data[DATA.type])).sort((a, b) => sortKey(role, a) - sortKey(role, b) || a.code.localeCompare(b.code, 'en', { numeric: true })).map((part) => ({ part, match: meets(part.data) }));
}

/** The feeder's length for the voltage drop: a cable's length, else the longest wire length, else the load's own. */
function feederLength(project: Project, chain: Chain, load: LoadData | undefined): Feeder['length'] {
  const cables = new Set(chain.wires.map((x) => x.w.cable).filter((x): x is string => !!x));
  const cl = project.cables.filter((cb) => cables.has(cb.id)).map((cb) => numOf(cb.length)).filter((n) => Number.isFinite(n) && n > 0);
  if (cl.length) return { metres: Math.max(...cl), source: 'cable' };
  const wl = chain.wires.map((x) => numOf(x.w.length)).filter((n) => Number.isFinite(n) && n > 0);
  if (wl.length) return { metres: Math.max(...wl), source: 'wire' };
  return load?.length && load.length > 0 ? { metres: load.length, source: 'load' } : undefined;
}

/** Devices with load data, and motors that have none yet (they show what is missing). */
export function loadDevices(project: Project, lib: Library): Device[] {
  const syms = withProjectSymbols(lib, project.symbols).symbols;
  return deviceIndex(project, lib).devices.filter((d) => d.rec?.load || d.reps.some((r) => r.symbolId && syms.get(r.symbolId)?.function === 'motor'));
}

/** Sizes one feeder. `graph` is built once per project by sizeProject. */
function sizeFeeder(c: SizingContext, g: Graph, dev: Device): Feeder {
  const { project, lib } = c;
  const load = dev.rec?.load;
  const supply = project.settings.supply;
  const lc = loadCurrent(load, supply);
  const feeder: Feeder = { load: dev.key, ...(load ? { data: load } : {}), lines: [], missing: lc.missing };
  if (lc.ib === undefined) return feeder;
  const ib = lc.ib;
  feeder.ib = ib;
  feeder.ibSource = lc.source === 'nameplate' ? 'nameplate' : 'computed';
  const chain = chainOf(project, lib, g, dev);
  const length = feederLength(project, chain, load);
  if (length) feeder.length = length;
  const method = project.settings.installationMethod;
  const line = (role: LineRole, subject: string, p: Partial<Line> & Pick<Line, 'status'>): Line => ({ id: `${dev.key}|${role}|${subject}`, feeder: dev.key, role, subject, options: [], missing: [], ...p });
  const units = Math.max(1, project.settings.bom.units || 1);
  const need = (current: PartDef | undefined) => (p: PartDef, unit: string): number => (current && current.id === p.id ? 0 : isMetres(unit) ? 0 : units * 1);

  // Conductors of the chain, grouped by cable (wires with no cable form one group).
  const groups = new Map<string, Chain['wires']>();
  for (const x of chain.wires) (groups.get(x.w.cable ?? '') ?? groups.set(x.w.cable ?? '', []).get(x.w.cable ?? '')!).push(x);
  const cableRec = (id: string): CableRec | undefined => project.cables.find((cb) => cb.id === id);
  const groupXs = (id: string, ws: Chain['wires']): number => {
    const part = id ? currentPart(c, { parts: [{ part: cableRec(id)?.part ?? '' }] }, 'cable') : undefined;
    if (part) return numOf(part.data[DATA.xs]);
    const xs = ws.map((x) => x.xs).filter((n) => Number.isFinite(n));
    return xs.length ? Math.min(...xs) : NaN;
  };
  // Breaker: In >= Ib, poles, curve, Icu. The cable is then sized for the breaker's In (Ib <= In <= Iz).
  let inEffective = ib;
  for (const key of chain.breakers.slice(0, 1)) {
    const req = breakerRequirement(ib, load, supply);
    const cur = currentPart(c, deviceRec(project, key), 'breaker');
    const curMatch = cur ? breakerMeets(cur.data, req, ib) : undefined;
    const options = rankOptions(candidates(c, 'breaker', (d) => breakerMeets(d, req, ib)), c.stock, partsOf(c), c.bom, need(cur));
    const ok = curMatch?.status === 'ok';
    const best = options[0];
    feeder.lines.push(line('breaker', key, {
      status: ok ? 'ok' : best ? 'change' : 'unavailable', requirement: req,
      current: cur ? { label: partLabel(cur), part: cur.id, reasons: curMatch?.reasons ?? [] } : { label: '', reasons: [t('no part assigned')] },
      options, ...(best && !ok ? { proposal: { option: best } } : {}),
    }));
    const chosen = ok ? curMatch : best ? breakerMeets(best.part.data, req, ib) : undefined;
    if (chosen?.inProtect) inEffective = Math.max(ib, chosen.inProtect);
  }

  // Contactors and overload relays.
  const creq = contactorRequirement(ib, load);
  for (const key of chain.contactors) {
    const cur = currentPart(c, deviceRec(project, key), 'contactor');
    const m = cur ? contactorMeets(cur.data, creq) : undefined;
    const options = rankOptions(candidates(c, 'contactor', (d) => contactorMeets(d, creq)), c.stock, partsOf(c), c.bom, need(cur));
    const ok = m?.status === 'ok';
    feeder.lines.push(line('contactor', key, { status: ok ? 'ok' : options[0] ? 'change' : 'unavailable', requirement: creq, current: cur ? { label: partLabel(cur), part: cur.id, reasons: m?.reasons ?? [] } : { label: '', reasons: [t('no part assigned')] }, options, ...(!ok && options[0] ? { proposal: { option: options[0] } } : {}) }));
  }
  const oreq = overloadRequirement(ib);
  for (const key of chain.overloads) {
    const cur = currentPart(c, deviceRec(project, key), 'overload');
    const m = cur ? overloadMeets(cur.data, oreq) : undefined;
    const options = rankOptions(candidates(c, 'overload', (d) => overloadMeets(d, oreq)), c.stock, partsOf(c), c.bom, need(cur));
    const ok = m?.status === 'ok';
    feeder.lines.push(line('overload', key, { status: ok ? 'ok' : options[0] ? 'change' : 'unavailable', requirement: oreq, current: cur ? { label: partLabel(cur), part: cur.id, reasons: m?.reasons ?? [] } : { label: '', reasons: [t('no part assigned')] }, options, ...(!ok && options[0] ? { proposal: { option: options[0] } } : {}) }));
  }

  // Cable and wires.
  const cableReq = (s: CableSizing): Requirement => ({
    text: cableRequirementText(s, method, supply),
    assumptions: [
      t('PVC-insulated copper conductors, three loaded conductors, method {method}, {ambient} °C ambient, grouping {grouping}.', { method: method || '?', ambient: supply.ambient, grouping: supply.grouping }),
      t('Ib ≤ In ≤ Iz and I2 ≤ 1.45 Iz (IEC 60364-4-43), with In {inr} A.', { inr: r1(inEffective) }),
      length ? t('Voltage drop of {pct} % at most over {m} m (IEC 60364-5-52 Annex G); motor starting is not checked.', { pct: supply.maxDropPct, m: length.metres }) : t('No length stated: the voltage drop is not checked.'),
      ...(load?.cosPhi ? [] : [t('cos φ is not stated: the voltage drop uses the resistive part only.')]),
    ],
    unverified: s.unverified,
  });
  for (const [id, ws] of groups) {
    const sizing = sizeCable({ ib, inRating: inEffective, method, supply, ...(length ? { lengthM: length.metres } : {}), ...(load?.cosPhi ? { cosPhi: load.cosPhi } : {}) });
    const base = { cable: sizing };
    if (!method) { feeder.lines.push(line(id ? 'cable' : 'wires', id, { status: 'missing', missing: ['installationMethod'], ...base })); continue; }
    const req = cableReq(sizing);
    if (sizing.xs === undefined) { feeder.lines.push(line(id ? 'cable' : 'wires', id, { status: 'unavailable', requirement: req, ...base })); continue; }
    const xsMin = sizing.xs;
    const have = groupXs(id, ws);
    if (!id) {
      const ok = Number.isFinite(have) && have >= xsMin;
      feeder.lines.push(line('wires', '', { status: ok ? 'ok' : 'change', requirement: req, current: { label: Number.isFinite(have) ? `${have} mm²` : '', reasons: ok ? [] : [t('{have} mm² is below {need} mm²', { have: Number.isFinite(have) ? have : '?', need: xsMin })] }, ...(ok ? {} : { proposal: { xs: xsMin } }), ...base }));
      continue;
    }
    const rec = cableRec(id);
    const cur = currentPart(c, rec ? { parts: [{ part: rec.part ?? '' }] } : undefined, 'cable');
    const m = cur ? cableMeets(cur.data, xsMin) : undefined;
    const metres = numOf(rec?.length);
    const options = rankOptions(candidates(c, 'cable', (d) => cableMeets(d, xsMin)), c.stock, partsOf(c), c.bom, (p, unit) => (cur && cur.id === p.id ? 0 : isMetres(unit) ? (Number.isFinite(metres) ? metres * units : 0) : units));
    const ok = m?.status === 'ok';
    feeder.lines.push(line('cable', id, { status: ok ? 'ok' : options[0] ? 'change' : 'unavailable', requirement: req, current: cur ? { label: partLabel(cur), part: cur.id, reasons: m?.reasons ?? [] } : { label: Number.isFinite(have) ? `${have} mm²` : '', reasons: [t('no cable part assigned')] }, options, ...(!ok && options[0] ? { proposal: { option: options[0] } } : {}), ...base }));
  }
  return feeder;
}

const recMemo = new WeakMap<object, Map<string, DeviceRec>>();
function deviceRec(project: Project, key: string): DeviceRec | undefined {
  let m = recMemo.get(project.devices);
  if (!m) recMemo.set(project.devices, (m = new Map(project.devices.map((r) => [r.designation, r]))));
  return m.get(key);
}

/** Sizes every feeder of the project: the data behind the "size the whole project" review table. */
export function sizeProject(c: SizingContext): Feeder[] {
  const g = buildGraph(c.project, c.lib);
  return loadDevices(c.project, c.lib).map((d) => sizeFeeder(c, g, d));
}
// ---- commands -------------------------------------------------------------------------------------------

/** The label shown for a line: "-QF1 breaker" etc. is built in the UI; this is the undo label. */
const undoLabel = (l: Line): string => `Size ${l.feeder}: ${l.subject || l.role}`;

/**
 * The command that applies a line's proposal (or another option the user picked): assigns the part (replacing the
 * device's part of the same sizing role) and sets the current setting of a motor protective breaker or overload relay;
 * for a cable, assigns the cable part; for wires, gives them a wire type of the proposed cross-section.
 * One command, so one undo step. undefined when there is nothing to apply.
 */
export function lineCommands(c: SizingContext, l: Line, pickOption?: Option, ib?: number): Command | undefined {
  const opt = pickOption ?? l.proposal?.option;
  if (l.role === 'wires') {
    const xs = l.proposal?.xs;
    if (!xs) return undefined;
    const g = buildGraph(c.project, c.lib);
    const dev = deviceIndex(c.project, c.lib).byKey.get(l.feeder);
    if (!dev) return undefined;
    const wires = chainOf(c.project, c.lib, g, dev).wires.filter((x) => !x.w.cable && !(x.xs >= xs));
    const types = new Map<string, { id: string; type: string; crossSection: string; colour: string }>();
    const cmds: Command[] = [];
    for (const x of wires) {
      const id = `${xs}mm2-${x.colour}`;
      if (!c.project.wireTypes.some((w) => w.id === id)) types.set(id, { id, type: x.type, crossSection: String(xs), colour: x.colour });
      cmds.push({ type: 'el/update', page: x.page, id: x.w.id, patch: { wireType: id } });
    }
    if (!cmds.length) return undefined;
    return { type: 'batch', label: undoLabel(l), commands: [...(types.size ? [{ type: 'project/wires' as const, wireTypes: [...c.project.wireTypes, ...types.values()] }] : []), ...cmds] };
  }
  if (!opt) return undefined;
  const embed: Command = { type: 'part/embed', def: opt.part };
  if (l.role === 'cable') {
    const rec = c.project.cables.find((x) => x.id === l.subject);
    return rec ? { type: 'batch', label: undoLabel(l), commands: [embed, { type: 'cable/set', cable: { ...rec, part: opt.part.id } }] } : undefined;
  }
  const rec = deviceRec(c.project, l.subject);
  const kept = (rec?.parts ?? []).filter((u) => !typesOf(l.role).includes(findPart(c.lib, c.project.parts, u.part)?.data[DATA.type] ?? ''));
  const setting = (opt.part.data[DATA.type] === 'MPCB' || opt.part.data[DATA.type] === 'Overload relay') && ib !== undefined ? { fields: { setting: `${r1(ib)} A` } } : {};
  return { type: 'batch', label: undoLabel(l), commands: [embed, { type: 'device/update', key: l.subject, patch: { parts: [...kept, { part: opt.part.id, qty: 1 }], ...setting } }] };
}

/** Every line with a proposal as one command: one undo step for "accept all". undefined when there is nothing to change. */
export function acceptAllCommand(c: SizingContext, feeders: Feeder[]): Command | undefined {
  const commands: Command[] = [];
  for (const f of feeders) for (const l of f.lines) if (l.status === 'change') { const cmd = lineCommands(c, l, undefined, f.ib); if (cmd) commands.push(cmd); }
  return commands.length ? { type: 'batch', label: 'Size the whole project', commands } : undefined;
}
