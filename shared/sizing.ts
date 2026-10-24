// The sizing engine (product rule 12, M6 part 1): pure functions that turn load data, supply data and
// installation conditions into requirements, and check library part data against them. No file system,
// no UI, no stock: shared/feeders.ts finds the feeders of a project and shared/stock.ts ranks parts by
// availability. The AI assistant (M7) reuses this API unchanged, so it never invents a rating.
//
// API (all pure; amperes, volts, millimetres, metres, kA):
//   loadCurrent(load, supply)             Ib of a motor (nameplate or computed) or a load
//   voltageDrop(ib, length, xs, ...)      voltage drop of a three-phase feeder
//   sizeCable(input)                      smallest cross-section meeting Ib <= In <= Iz, I2 <= 1.45 Iz, voltage drop
//   breakerRequirement / contactorRequirement / overloadRequirement   what each device must provide
//   breakerMeets / contactorMeets / overloadMeets / cableMeets          check a part's data against a requirement
// Every requirement carries `text` (what is required), `assumptions` and `unverified` (which table values
// have not been checked against the primary text); SIZING_NOTE says the result does not replace the
// engineer's verification (CLAUDE.md, rule 2).
//
// Standards, with clauses where we are sure (clauses recorded from secondary sources are in docs/to-verify.md):
//   IEC 60364-5-52  current-carrying capacity, correction factors (shared/ampacity.ts), voltage drop (Annex G)
//   IEC 60364-4-43  overload protection: Ib <= In <= Iz (clause 433.1) and I2 <= 1.45 Iz (clause 433.1)
//   IEC 60947-2     circuit-breakers: rated current, ultimate breaking capacity Icu, poles
//   IEC 60898-1     miniature circuit-breakers: tripping curves B, C, D
//   IEC 60947-4-1   contactors and motor starters: utilisation category AC-3, thermal overload relays

import { AMBIENT_FACTOR_PVC, AMPACITY_VERIFIED, CORRECTION_VERIFIED, CROSS_SECTIONS, correctedCapacity, groupingFactor } from './ampacity';
import { t } from './i18n';
import type { LoadData, SupplyData } from './model/types';

export const SIZING_NOTE = (): string => t('A proposal computed from the stated data and assumptions. It does not replace the engineer\'s verification.');

/** Resistivity of copper at the conductor temperature in normal service: IEC 60364-5-52 Annex G, 0.0225 ohm mm2/m (to verify). */
export const RHO_COPPER = 0.0225;
/** Reactance of cables: IEC 60364-5-52 Annex G, 0.08 milliohm per metre (to verify). */
export const REACTANCE_PER_M = 0.08e-3;
export const VOLTAGE_DROP_VERIFIED = false;
/**
 * Conventional tripping current of a breaker as a multiple of In, used for I2 <= 1.45 Iz: 1.45 In (IEC 60898-1
 * conventional tripping current); IEC 60947-2 breakers use 1.30 In, so 1.45 is the safe bound for both (to verify).
 */
export const CONVENTIONAL_TRIPPING = 1.45;

/** Part data keys the engine reads (library/parts/*.json `data`, see library/README.md). */
export const DATA = {
  type: 'Type', poles: 'Poles', curve: 'Tripping characteristic', rated: 'Rated current', icu: 'Breaking capacity',
  ac3: 'Rated operational current AC-3', range: 'Setting range', xs: 'Conductor cross-section', cores: 'Cores',
} as const;
/** Values of the `Type` key that mark a part as one the engine can size. */
export const PART_TYPES = ['MCB', 'MPCB', 'Contactor', 'Overload relay', 'Power cable'] as const;
export type PartType = (typeof PART_TYPES)[number];
export type PartData = Record<string, string>;

const NUM = /-?\d+(?:[.,]\d+)?/g;
const nums = (s: string | undefined): number[] => (s ?? '').match(NUM)?.map((x) => Number(x.replace(',', '.'))) ?? [];
/** The first number of a data value ("16 A" gives 16, "2,5 mm²" gives 2.5); NaN when there is none. */
export const numOf = (s: string | undefined): number => nums(s)[0] ?? NaN;
/** "9 - 13 A" gives [9, 13]; undefined when the value does not hold two numbers. */
export const rangeOf = (s: string | undefined): [number, number] | undefined => {
  const n = nums(s);
  return n.length >= 2 ? [Math.min(n[0], n[1]), Math.max(n[0], n[1])] : undefined;
};
const r1 = (x: number): number => Math.round(x * 10) / 10;
const r2 = (x: number): number => Math.round(x * 100) / 100;

/** What a check of a part's data against a requirement found: it meets it, it does not, or the data it needs is missing. */
export interface Match {
  status: 'ok' | 'fails' | 'data-missing';
  /** Plain reasons ("rated current 10 A is below 16 A"; "no breaking capacity stated"). */
  reasons: string[];
}
const ok = (): Match => ({ status: 'ok', reasons: [] });
function combine(parts: Match[]): Match {
  const fails = parts.filter((p) => p.status === 'fails'), miss = parts.filter((p) => p.status === 'data-missing');
  if (fails.length) return { status: 'fails', reasons: fails.flatMap((p) => p.reasons) };
  if (miss.length) return { status: 'data-missing', reasons: miss.flatMap((p) => p.reasons) };
  return ok();
}
const atLeast = (value: number, need: number, what: string, unit: string): Match =>
  Number.isNaN(value) ? { status: 'data-missing', reasons: [t('no {what} stated', { what })] }
    : value >= need - 1e-9 ? ok() : { status: 'fails', reasons: [t('{what} {value} {unit} is below {need} {unit}', { what, value, need: r2(need), unit })] };

// ---- load current ------------------------------------------------------------------------------------

export interface LoadCurrent {
  /** Design current Ib in amperes; undefined when data is missing. */
  ib?: number;
  source: 'nameplate' | 'computed' | 'missing';
  /** Load fields still needed: 'current', or 'powerKw', 'cosPhi' (and 'efficiency' for motors). */
  missing: string[];
}
/**
 * Design current Ib. A stated current wins (the nameplate current of a motor, or the load current). Otherwise
 * Ib = P / (sqrt(3) U cos(phi) eta), with eta = 1 for a load given as electrical power and the nameplate
 * efficiency for a motor given as shaft power.
 */
export function loadCurrent(load: LoadData | undefined, supply: Pick<SupplyData, 'voltage'>): LoadCurrent {
  if (!load) return { source: 'missing', missing: ['current'] };
  if (load.current && load.current > 0) return { ib: r2(load.current), source: 'nameplate', missing: [] };
  const missing: string[] = [];
  if (!load.powerKw || load.powerKw <= 0) missing.push('powerKw');
  if (!load.cosPhi || load.cosPhi <= 0) missing.push('cosPhi');
  if (load.kind === 'motor' && (!load.efficiency || load.efficiency <= 0)) missing.push('efficiency');
  if (missing.length) return { source: 'missing', missing };
  const eta = load.kind === 'motor' ? (load.efficiency as number) / 100 : 1;
  return { ib: r2(((load.powerKw as number) * 1000) / (Math.sqrt(3) * supply.voltage * (load.cosPhi as number) * eta)), source: 'computed', missing: [] };
}

// ---- voltage drop ------------------------------------------------------------------------------------

/**
 * Voltage drop of a three-phase copper feeder, IEC 60364-5-52 Annex G: dU = sqrt(3) Ib L (rho cos(phi) / S + lambda sin(phi))
 * in volts between phases, as a percentage of the line voltage. Without cos(phi) only the resistive term is used.
 */
export function voltageDrop(ib: number, lengthM: number, xs: number, voltage: number, cosPhi?: number): { volts: number; percent: number } {
  const c = cosPhi && cosPhi > 0 && cosPhi <= 1 ? cosPhi : 1;
  const s = Math.sqrt(1 - c * c);
  const volts = Math.sqrt(3) * ib * lengthM * ((RHO_COPPER / xs) * c + REACTANCE_PER_M * s);
  return { volts: r2(volts), percent: r2((volts / voltage) * 100) };
}

// ---- cable -------------------------------------------------------------------------------------------

export interface CableInput {
  /** Design current Ib. */
  ib: number;
  /** Rated (or set) current In of the protective device; defaults to Ib. */
  inRating?: number;
  method: string;
  supply: SupplyData;
  /** Feeder length in metres; undefined skips the voltage drop. */
  lengthM?: number;
  cosPhi?: number;
}
export interface CableSizing {
  /** Smallest cross-section in mm² that meets every condition; undefined when none in the table does. */
  xs?: number;
  /** Capacity Iz of that cross-section after correction, and the factors behind it. */
  iz?: number;
  table?: number;
  kT?: number;
  kG?: number;
  /** Minimum Iz the capacity condition needs: max(Ib, In). */
  izRequired: number;
  /** Ib <= In <= Iz holds for the proposed size. */
  coordination: boolean;
  /** I2 = 1.45 In, and I2 <= 1.45 Iz holds. */
  i2: number;
  i2Ok: boolean;
  drop?: { volts: number; percent: number; ok: boolean };
  limitedBy: 'capacity' | 'voltage-drop';
  /** Why no size was proposed: the method is not stated or not in the table, a factor is not covered, or nothing is large enough. */
  problem?: 'method' | 'factors' | 'too-large';
  /** Table values behind this result that are not verified against the primary text. */
  unverified: string[];
}

/** Which table values a cable result rests on that are unverified (empty when all are verified). */
export function unverifiedFor(drop: boolean): string[] {
  return [
    ...(AMPACITY_VERIFIED ? [] : ['IEC 60364-5-52 Table B.52-5']),
    ...(CORRECTION_VERIFIED ? [] : ['IEC 60364-5-52 Tables B.52-14 and B.52-17']),
    ...(drop && !VOLTAGE_DROP_VERIFIED ? ['IEC 60364-5-52 Annex G'] : []),
  ];
}

/**
 * The smallest standard cross-section (PVC, copper, three loaded conductors) with Ib <= In <= Iz after the ambient and
 * grouping factors, I2 <= 1.45 Iz (IEC 60364-4-43 clause 433.1) and a voltage drop within the limit. Steps up to the
 * next size while the drop is too large.
 */
export function sizeCable(inp: CableInput): CableSizing {
  const inR = Math.max(inp.inRating ?? inp.ib, inp.ib);
  const need = Math.max(inR, inp.ib);
  const base: CableSizing = { izRequired: r2(need), coordination: false, i2: r2(CONVENTIONAL_TRIPPING * inR), i2Ok: false, limitedBy: 'capacity', unverified: unverifiedFor(inp.lengthM !== undefined) };
  const first = correctedCapacity(inp.method, CROSS_SECTIONS[0], inp.supply.ambient, inp.supply.grouping);
  if (!first) {
    const methodKnown = correctedCapacity(inp.method, CROSS_SECTIONS[0], 30, 1) !== undefined;
    return { ...base, problem: methodKnown ? 'factors' : 'method' };
  }
  let limited: CableSizing['limitedBy'] = 'capacity';
  for (const xs of CROSS_SECTIONS) {
    const c = correctedCapacity(inp.method, xs, inp.supply.ambient, inp.supply.grouping);
    if (!c || c.iz < need) continue;
    const drop = inp.lengthM !== undefined ? voltageDrop(inp.ib, inp.lengthM, xs, inp.supply.voltage, inp.cosPhi) : undefined;
    const dropOk = drop ? drop.percent <= inp.supply.maxDropPct : true;
    if (!dropOk) { limited = 'voltage-drop'; continue; }
    return { ...base, xs, iz: c.iz, table: c.table, kT: c.kT, kG: c.kG, coordination: inp.ib <= inR && inR <= c.iz, i2Ok: CONVENTIONAL_TRIPPING * inR <= 1.45 * c.iz, ...(drop ? { drop: { ...drop, ok: true } } : {}), limitedBy: limited };
  }
  return { ...base, problem: 'too-large', limitedBy: limited };
}

/** Requirement text of a cable: "cable at least 2.5 mm², method B1, 30 °C". */
export function cableRequirementText(s: CableSizing, method: string, supply: SupplyData): string {
  if (s.xs === undefined) return t('no cross-section in the table meets Iz of at least {iz} A (method {method}, {ambient} °C)', { iz: s.izRequired, method, ambient: supply.ambient });
  return t('cable of at least {xs} mm², method {method}, {ambient} °C, grouping {grouping}, Iz {iz} A', { xs: s.xs, method, ambient: supply.ambient, grouping: supply.grouping, iz: s.iz ?? 0 });
}

// ---- protective devices and starter parts ------------------------------------------------------------

export interface Requirement {
  text: string;
  assumptions: string[];
  /** Table values behind it that are not verified (empty for requirements with no table value). */
  unverified: string[];
}

export interface BreakerRequirement extends Requirement {
  /** Minimum rated current In (MCB) or the current the setting range must contain (MPCB). */
  inMin: number;
  poles: number;
  curve?: 'B' | 'C' | 'D';
  /** Minimum breaking capacity in kA; undefined: the prospective short-circuit current is not stated. */
  icuMin?: number;
}
/** Breaker: In >= Ib, three poles, the chosen curve, Icu >= prospective Ik (IEC 60947-2, IEC 60898-1). */
export function breakerRequirement(ib: number, load: LoadData | undefined, supply: SupplyData): BreakerRequirement {
  const curve = load?.curve ?? 'C';
  const icuMin = supply.ik > 0 ? supply.ik : undefined;
  const text = `In ≥ ${r1(ib)} A, ${t('curve {curve}', { curve })}, ${t('{n} poles', { n: 3 })}${icuMin !== undefined ? `, Icu ≥ ${icuMin} kA` : ''}`;
  const assumptions = [
    t('Three-phase circuit; a motor protective circuit breaker is set to Ib.'),
    t('The tripping curve is the one chosen for the load (default C); starting current is not computed.'),
    icuMin !== undefined ? t('Icu is compared with the prospective short-circuit current at the board, {ik} kA.', { ik: icuMin }) : t('The prospective short-circuit current is not stated: the breaking capacity is not checked.'),
  ];
  return { text, assumptions, unverified: [], inMin: r1(ib), poles: 3, curve, ...(icuMin !== undefined ? { icuMin } : {}) };
}

/** Does a part's data meet a breaker requirement? MCB: In >= Ib; MPCB: the setting range contains Ib. Also returns the protective current In the cable must carry. */
export function breakerMeets(d: PartData, req: BreakerRequirement, ib: number): Match & { inProtect?: number } {
  const type = d[DATA.type];
  const checks: Match[] = [atLeast(numOf(d[DATA.poles]), req.poles, t('poles'), '')];
  let inProtect: number | undefined;
  if (type === 'MCB') {
    const rated = numOf(d[DATA.rated]);
    checks.push(atLeast(rated, req.inMin, t('rated current'), 'A'));
    inProtect = rated;
    const curve = d[DATA.curve];
    checks.push(!curve ? { status: 'data-missing', reasons: [t('no {what} stated', { what: t('tripping curve') })] } : req.curve && curve !== req.curve ? { status: 'fails', reasons: [t('curve {curve} instead of {need}', { curve, need: req.curve })] } : ok());
  } else if (type === 'MPCB') {
    const range = rangeOf(d[DATA.range]);
    checks.push(!range ? { status: 'data-missing', reasons: [t('no {what} stated', { what: t('setting range') })] } : range[0] <= ib && ib <= range[1] ? ok() : { status: 'fails', reasons: [t('setting range {lo} to {hi} A does not contain {ib} A', { lo: range[0], hi: range[1], ib: r1(ib) })] });
    inProtect = ib;
  } else return { status: 'fails', reasons: [t('not a breaker')] };
  if (req.icuMin !== undefined) checks.push(atLeast(numOf(d[DATA.icu]), req.icuMin, t('breaking capacity'), 'kA'));
  return { ...combine(checks), inProtect };
}

export interface ContactorRequirement extends Requirement {
  /** Minimum AC-3 current in amperes. */
  ac3Min: number;
  poles: number;
}
/** Contactor: AC-3 current >= motor current (IEC 60947-4-1). A star-delta starter's line and delta contactors carry the winding current, Ib / sqrt(3). */
export function contactorRequirement(ib: number, load: LoadData | undefined): ContactorRequirement {
  const star = load?.starter === 'star-delta';
  const ac3Min = r1(star ? ib / Math.sqrt(3) : ib);
  return {
    text: `AC-3 ≥ ${ac3Min} A, ${t('{n} poles', { n: 3 })}`,
    assumptions: [
      star ? t('Star-delta starter: every contactor is sized for the winding current Ib / √3 (the star contactor could be smaller).') : t('Direct-on-line starter: AC-3 current at least the motor current.'),
      t('Utilisation category AC-3 (squirrel-cage motors, switching off during running); the contactor is not checked against the starting current or the electrical life.'),
    ],
    unverified: [], ac3Min, poles: 3,
  };
}
export function contactorMeets(d: PartData, req: ContactorRequirement): Match {
  if (d[DATA.type] !== 'Contactor') return { status: 'fails', reasons: [t('not a contactor')] };
  return combine([atLeast(numOf(d[DATA.ac3]), req.ac3Min, t('AC-3 current'), 'A'), atLeast(numOf(d[DATA.poles]), req.poles, t('poles'), '')]);
}

export interface OverloadRequirement extends Requirement {
  /** The setting range must contain this current. */
  setting: number;
}
/** Overload relay: the setting range contains the motor current (IEC 60947-4-1). */
export function overloadRequirement(ib: number): OverloadRequirement {
  return {
    text: t('setting range containing {ib} A', { ib: r1(ib) }),
    assumptions: [t('The relay sits in the motor line and is set to the motor current; a relay inside a star-delta winding loop would need the range divided by √3.'), t('Trip class is not checked.')],
    unverified: [], setting: r1(ib),
  };
}
export function overloadMeets(d: PartData, req: OverloadRequirement): Match {
  if (d[DATA.type] !== 'Overload relay') return { status: 'fails', reasons: [t('not an overload relay')] };
  const range = rangeOf(d[DATA.range]);
  if (!range) return { status: 'data-missing', reasons: [t('no {what} stated', { what: t('setting range') })] };
  return range[0] <= req.setting && req.setting <= range[1] ? ok() : { status: 'fails', reasons: [t('setting range {lo} to {hi} A does not contain {ib} A', { lo: range[0], hi: range[1], ib: req.setting })] };
}

/** A power cable part: cross-section at least the sized one, with three phase cores and a protective core. */
export function cableMeets(d: PartData, xsMin: number): Match {
  if (d[DATA.type] !== 'Power cable') return { status: 'fails', reasons: [t('not a power cable')] };
  return combine([atLeast(numOf(d[DATA.xs]), xsMin, t('cross-section'), 'mm²'), atLeast(numOf(d[DATA.cores]), 4, t('cores'), '')]);
}

/** The ambient temperatures the correction table covers (for the supply data form). */
export const AMBIENT_STEPS: readonly number[] = AMBIENT_FACTOR_PVC.map(([x]) => x);
/** Grouping counts the form offers. */
export const GROUPING_STEPS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 16, 20];
export { groupingFactor };
