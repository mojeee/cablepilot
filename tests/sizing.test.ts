// Sizing worked examples. Every expected value is built from the tables we ship (shared/ampacity.ts, with its
// source in the header: IEC 60364-5-52 Tables B.52-5, B.52-14 and B.52-17, all still unverified against the primary
// text) or from the formula named in the comment, so a change in a table shows up here.
import { describe, expect, it } from 'vitest';
import { AMBIENT_FACTOR_PVC, CAPACITY_3_LOADED_PVC_CU, CROSS_SECTIONS, ambientFactor, correctedCapacity, groupingFactor, minCorrectedCrossSection } from '@shared/ampacity';
import { breakerMeets, breakerRequirement, cableMeets, contactorMeets, contactorRequirement, loadCurrent, overloadMeets, overloadRequirement, sizeCable, voltageDrop, unverifiedFor } from '@shared/sizing';
import type { SupplyData } from '@shared/model/types';
import { DEFAULT_SUPPLY } from '@shared/model/defaults';

const supply = (p: Partial<SupplyData> = {}): SupplyData => ({ ...DEFAULT_SUPPLY, ...p });

describe('design current', () => {
  it('computes a motor current from shaft power: Ib = P / (sqrt(3) U cos(phi) eta)', () => {
    // 5.5 kW, 400 V, cos phi 0.85, eta 87 %: 5500 / (1.7320508 * 400 * 0.85 * 0.87) = 10.735 A
    const r = loadCurrent({ kind: 'motor', powerKw: 5.5, cosPhi: 0.85, efficiency: 87 }, supply());
    expect(r.source).toBe('computed');
    expect(r.ib).toBeCloseTo(10.74, 2);
  });
  it('uses the nameplate current when it is stated, and a load without efficiency', () => {
    expect(loadCurrent({ kind: 'motor', current: 11.2, powerKw: 5.5 }, supply())).toMatchObject({ ib: 11.2, source: 'nameplate' });
    // 10 kW load, cos phi 0.9: 10000 / (1.7320508 * 400 * 0.9) = 16.04 A
    expect(loadCurrent({ kind: 'load', powerKw: 10, cosPhi: 0.9 }, supply()).ib).toBeCloseTo(16.04, 2);
  });
  it('says what is missing instead of guessing', () => {
    expect(loadCurrent({ kind: 'motor', powerKw: 5.5 }, supply()).missing).toEqual(['cosPhi', 'efficiency']);
    expect(loadCurrent(undefined, supply()).missing).toEqual(['current']);
  });
});

describe('correction factors', () => {
  it('reads the ambient table (Table B.52-14, PVC) and refuses temperatures between its steps', () => {
    expect(ambientFactor(30)).toBe(1);
    expect(ambientFactor(40)).toBe(0.87);
    expect(AMBIENT_FACTOR_PVC.map(([t]) => t)).toEqual([10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]);
    expect(ambientFactor(32)).toBeUndefined();
  });
  it('reads the grouping table (Table B.52-17 item 1): the next tabulated count in between, none for method E', () => {
    expect(groupingFactor('B1', 1)).toBe(1);
    expect(groupingFactor('B1', 3)).toBe(0.7);
    expect(groupingFactor('B1', 10)).toBe(0.45);
    expect(groupingFactor('B1', 21)).toBeUndefined();
    expect(groupingFactor('E', 2)).toBeUndefined();
    expect(groupingFactor('E', 1)).toBe(1);
  });
  it('multiplies the capacity table by both factors', () => {
    const base = CAPACITY_3_LOADED_PVC_CU.B1[CROSS_SECTIONS.indexOf(4)];
    expect(base).toBe(28);
    // 4 mm², method B1, 40 °C, 3 circuits: 28 * 0.87 * 0.7 = 17.052
    expect(correctedCapacity('B1', 4, 40, 3)).toMatchObject({ table: 28, kT: 0.87, kG: 0.7, iz: 17.05 });
    expect(correctedCapacity('Z9', 4, 30, 1)).toBeUndefined();
  });
  it('finds the smallest size for a current with the factors applied', () => {
    expect(minCorrectedCrossSection('B1', 16, 30, 1)).toBe(2.5);
    expect(minCorrectedCrossSection('B1', 16, 40, 3)).toBe(4);
  });
});

describe('voltage drop', () => {
  it('follows IEC 60364-5-52 Annex G: sqrt(3) Ib L (rho cos(phi) / S + lambda sin(phi))', () => {
    // 10.74 A, 100 m, 2.5 mm², cos phi 0.85: sqrt(3)*10.74*100*(0.0225/2.5*0.85 + 0.08e-3*0.5268) = 14.31 V = 3.58 % of 400 V
    expect(voltageDrop(10.74, 100, 2.5, 400, 0.85)).toEqual({ volts: 14.31, percent: 3.58 });
    // no cos phi: resistive only, sqrt(3)*10.74*100*0.0225/2.5 = 16.74 V
    expect(voltageDrop(10.74, 100, 2.5, 400).volts).toBeCloseTo(16.74, 2);
  });
});

describe('cable sizing: Ib <= In <= Iz and I2 <= 1.45 Iz', () => {
  const base = { ib: 10.74, inRating: 16, method: 'B1', supply: supply() };
  it('picks 2.5 mm² for a 16 A breaker in method B1 at 30 °C (1.5 mm² carries only the 15.5 A of the table)', () => {
    const r = sizeCable(base);
    expect(r).toMatchObject({ xs: 2.5, iz: 21, table: 21, kT: 1, kG: 1, coordination: true, i2: 23.2, i2Ok: true, limitedBy: 'capacity' });
    expect(r.unverified.length).toBeGreaterThan(0);
  });
  it('steps up with ambient temperature and grouping', () => {
    expect(sizeCable({ ...base, supply: supply({ ambient: 40, grouping: 3 }) })).toMatchObject({ xs: 4, iz: 17.05 });
  });
  it('steps up when the voltage drop is too large, and says so', () => {
    const r = sizeCable({ ...base, lengthM: 150, cosPhi: 0.85 });
    // 2.5 mm² over 150 m: 21.47 V = 5.37 % > 5 %; 4 mm²: 3.36 %
    expect(r).toMatchObject({ xs: 4, limitedBy: 'voltage-drop' });
    expect(r.drop).toMatchObject({ ok: true });
    expect(r.drop?.percent).toBeCloseTo(3.36, 2);
  });
  it('uses the breaker current, not only Ib', () => {
    expect(sizeCable({ ...base, inRating: 32 }).xs).toBe(6);
  });
  it('reports why it cannot size', () => {
    expect(sizeCable({ ...base, method: '' }).problem).toBe('method');
    expect(sizeCable({ ...base, supply: supply({ ambient: 32 }) }).problem).toBe('factors');
    expect(sizeCable({ ...base, inRating: 200 }).problem).toBe('too-large');
  });
  it('lists the unverified tables it rests on', () => {
    expect(unverifiedFor(true)).toContain('IEC 60364-5-52 Annex G');
    expect(unverifiedFor(false)).not.toContain('IEC 60364-5-52 Annex G');
  });
});

describe('devices', () => {
  const mcb = { Type: 'MCB', Poles: '3', 'Tripping characteristic': 'C', 'Rated current': '16 A', 'Breaking capacity': '6 kA' };
  it('breaker: In >= Ib, curve, poles and Icu >= Ik (IEC 60947-2, IEC 60898-1)', () => {
    const req = breakerRequirement(10.74, { kind: 'motor', curve: 'C' }, supply({ ik: 6 }));
    expect(req).toMatchObject({ inMin: 10.7, poles: 3, curve: 'C', icuMin: 6 });
    expect(req.text).toBe('In ≥ 10.7 A, curve C, 3 poles, Icu ≥ 6 kA');
    expect(breakerMeets(mcb, req, 10.74)).toMatchObject({ status: 'ok', inProtect: 16 });
    expect(breakerMeets({ ...mcb, 'Breaking capacity': '4.5 kA' }, req, 10.74).status).toBe('fails');
    expect(breakerMeets({ ...mcb, 'Tripping characteristic': 'B' }, req, 10.74).status).toBe('fails');
    expect(breakerMeets({ ...mcb, 'Rated current': '10 A' }, req, 10.74).status).toBe('fails');
    expect(breakerMeets({ ...mcb, Poles: '1' }, req, 10.74).status).toBe('fails');
  });
  it('breaker: missing technical data is "data missing", never a pass; no Ik stated skips Icu', () => {
    const req = breakerRequirement(10.74, undefined, supply({ ik: 6 }));
    const { 'Breaking capacity': _icu, ...noIcu } = mcb;
    expect(breakerMeets(noIcu, req, 10.74).status).toBe('data-missing');
    expect(breakerMeets(noIcu, breakerRequirement(10.74, undefined, supply()), 10.74).status).toBe('ok');
    expect(breakerRequirement(10.74, undefined, supply()).text).not.toContain('Icu');
  });
  it('motor protective breaker: the setting range contains Ib; the cable current is the setting', () => {
    const mpcb = { Type: 'MPCB', Poles: '3', 'Setting range': '10 - 16 A', 'Breaking capacity': '10 kA' };
    const req = breakerRequirement(14.15, undefined, supply({ ik: 10 }));
    expect(breakerMeets(mpcb, req, 14.15)).toMatchObject({ status: 'ok', inProtect: 14.15 });
    expect(breakerMeets({ ...mpcb, 'Setting range': '6.3 - 10 A' }, req, 14.15).status).toBe('fails');
  });
  it('contactor: AC-3 current >= Ib; star-delta uses the winding current Ib / sqrt(3) (IEC 60947-4-1)', () => {
    const c12 = { Type: 'Contactor', Poles: '3', 'Rated operational current AC-3': '12 A' };
    expect(contactorRequirement(14.15, { kind: 'motor' }).ac3Min).toBe(14.2);
    expect(contactorRequirement(14.15, { kind: 'motor', starter: 'star-delta' }).ac3Min).toBe(8.2);
    expect(contactorMeets(c12, contactorRequirement(14.15, { kind: 'motor' })).status).toBe('fails');
    expect(contactorMeets(c12, contactorRequirement(14.15, { kind: 'motor', starter: 'star-delta' })).status).toBe('ok');
    expect(contactorMeets({ Type: 'Contactor', Poles: '3' }, contactorRequirement(5, undefined)).status).toBe('data-missing');
  });
  it('overload relay: the setting range contains Ib', () => {
    const fr = { Type: 'Overload relay', 'Setting range': '9 - 13 A' };
    expect(overloadMeets(fr, overloadRequirement(10.74)).status).toBe('ok');
    expect(overloadMeets(fr, overloadRequirement(14.15)).status).toBe('fails');
    expect(overloadMeets({ Type: 'Overload relay' }, overloadRequirement(10)).status).toBe('data-missing');
  });
  it('cable part: cross-section at least the sized one, four cores', () => {
    const cab = { Type: 'Power cable', Cores: '4', 'Conductor cross-section': '2.5 mm²' };
    expect(cableMeets(cab, 2.5).status).toBe('ok');
    expect(cableMeets(cab, 4).status).toBe('fails');
    expect(cableMeets({ ...cab, Cores: '3' }, 2.5).status).toBe('fails');
    expect(cableMeets({ Type: 'Control cable' }, 1).status).toBe('fails');
  });
});
