// Feeders found in the schematic, the review of every line, and the commands that confirm a proposal.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeBom } from '@shared/bom';
import { createHistory, exec, undo } from '@shared/commands/history';
import { parseCsv } from '@shared/export/csv';
import { acceptAllCommand, lineCommands, sizeProject, type Feeder, type SizingContext } from '@shared/feeders';
import { parseProject } from '@shared/file';
import type { Project } from '@shared/model/types';
import { runChecks } from '@shared/checks';
import { applyMapping, guessMapping, newStockList } from '@shared/stock';
import { loadLibrary } from './support/library';

const lib = loadLibrary();
const open = (name: string): Project => {
  const r = parseProject(readFileSync(join(__dirname, '..', 'samples', `${name}.cablepilot.json`), 'utf8'));
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};
const csv = parseCsv(readFileSync(join(__dirname, '..', 'samples', 'stock-sample.csv'), 'utf8'));
const stock = newStockList(applyMapping(csv, guessMapping(csv)), null, { stockDate: '2026-10-24', sourceName: 'stock-sample.csv' });
const ctxOf = (project: Project, s = stock): SizingContext => ({ project, lib, stock: s, bom: computeBom(project, lib) });
const withMotor = (p: Project, kw: number): Project => ({ ...p, devices: p.devices.map((d) => (d.designation === '+DS-M1' && d.load ? { ...d, load: { ...d.load, powerKw: kw } } : d)) });
const line = (f: Feeder, role: string, subject = '') => f.lines.find((l) => l.role === role && l.subject === subject)!;

describe('the samples ship with their feeders sized', () => {
  it('finds the conveyor feeder from the schematic: breaker, contactor, relay, cable and wires, all meeting their requirement', () => {
    const [f] = sizeProject(ctxOf(open('conveyor')));
    expect(f).toMatchObject({ load: '+DS-M1', ibSource: 'computed', length: { metres: 12, source: 'cable' }, missing: [] });
    expect(f.ib).toBeCloseTo(10.74, 2);
    expect(f.lines.map((l) => [l.role, l.subject, l.status])).toEqual([['breaker', '+DS-QF1', 'ok'], ['contactor', '+DS-KM1', 'ok'], ['overload', '+DS-FR1', 'ok'], ['cable', '-W1', 'ok'], ['wires', '', 'ok']]);
    expect(line(f, 'breaker', '+DS-QF1').requirement?.text).toBe('In ≥ 10.7 A, curve C, 3 poles, Icu ≥ 6 kA');
    expect(line(f, 'cable', '-W1').cable).toMatchObject({ xs: 2.5, iz: 21 });
  });
  it('sizes both pumps, with star-delta contactors at the winding current, and still has a clean rule check', () => {
    const p = open('pump-station');
    const fs = sizeProject(ctxOf(p));
    expect(fs.map((f) => f.load)).toEqual(['+PS-M1', '+PS-M2']);
    expect(fs[0].lines.filter((l) => l.role === 'contactor')).toHaveLength(3);
    expect(fs.flatMap((f) => f.lines).every((l) => l.status === 'ok')).toBe(true);
    expect(runChecks(p, lib).findings).toEqual([]);
  });
  it('lists motors without load data and says what is missing', () => {
    const p = open('conveyor');
    const bare = { ...p, devices: p.devices.map((d) => { const { load: _l, ...rest } = d; return rest; }) };
    const [f] = sizeProject(ctxOf(bare));
    expect(f.lines).toEqual([]);
    expect(f.missing).toEqual(['current']);
  });
});

describe('a larger motor', () => {
  const p = withMotor(open('conveyor'), 7.5); // Ib = 7500 / (sqrt(3) 400 0.85 0.87) = 14.64 A
  const c = ctxOf(p);
  const [f] = sizeProject(c);
  it('keeps what still fits and proposes what does not, from stock, with warehouse and quantities', () => {
    expect(f.ib).toBeCloseTo(14.64, 2);
    expect(line(f, 'breaker', '+DS-QF1').status).toBe('ok'); // C16 >= 14.64
    expect(line(f, 'cable', '-W1').status).toBe('ok'); // 16 A <= Iz 21 A
    const km = line(f, 'contactor', '+DS-KM1');
    expect(km).toMatchObject({ status: 'change', current: { label: 'GEN-CONTACTOR-12A' } });
    expect(km.current?.reasons).toEqual(['AC-3 current 12 A is below 14.6 A']);
    expect(km.proposal?.option?.part.id).toBe('generic-contactor-18a');
    // 18 A: on hand 18, reserved 4, the project uses 0 of it: 14 free, 14 available; the pick takes 1.
    expect(km.proposal?.option).toMatchObject({ availability: 'enough', needed: 1 });
    expect(km.proposal?.option?.stock).toMatchObject({ free: 14, available: 14 });
    expect(km.proposal?.option?.stock?.rows[0].item).toMatchObject({ warehouse: 'Main', location: 'A-03-03' });
    expect(line(f, 'overload', '+DS-FR1').proposal?.option?.part.id).toBe('generic-overload-relay-12a-18a');
    // 25 A is also offered, ranked after the 18 A because the warehouse has none free.
    expect(km.options.map((o) => [o.part.id, o.availability])).toEqual([['generic-contactor-18a', 'enough'], ['generic-contactor-25a', 'none'], ['generic-contactor-32a', 'none']]);
  });
  it('ranks by availability: a part that is short comes after one that is not', () => {
    const tight = newStockList(applyMapping([['Part code', 'On hand', 'Reserved'], ['GEN-CONTACTOR-18A', '1', '0'], ['GEN-CONTACTOR-25A', '9', '0']], { header: true, columns: { code: 'Part code', onHand: 'On hand', reserved: 'Reserved' } }), null, { stockDate: '2026-10-24', sourceName: 't' });
    const bom = computeBom({ ...p, settings: { ...p.settings, bom: { ...p.settings.bom, units: 3 } } }, lib);
    const [g] = sizeProject({ project: { ...p, settings: { ...p.settings, bom: { ...p.settings.bom, units: 3 } } }, lib, stock: tight, bom });
    // Three units need 3 contactors: the 18 A has 1 (short), the 25 A has 9 (enough).
    expect(line(g, 'contactor', '+DS-KM1').options.map((o) => [o.part.id, o.availability, o.needed])).toEqual([['generic-contactor-25a', 'enough', 3], ['generic-contactor-18a', 'short', 3], ['generic-contactor-32a', 'none', 3]]);
  });
  it('confirming a proposal is one undoable command: it assigns the part, keeps the other parts and sets the relay', () => {
    const h0 = createHistory(p);
    const km = line(f, 'contactor', '+DS-KM1');
    const cmd = lineCommands(c, km, undefined, f.ib)!;
    const h1 = exec(h0, cmd, { lib });
    expect(h1.past).toHaveLength(1);
    expect(h1.present.devices.find((d) => d.designation === '+DS-KM1')?.parts).toEqual([{ part: 'generic-aux-block-1no1nc', qty: 1 }, { part: 'generic-contactor-18a', qty: 1 }]);
    expect(h1.present.parts.some((x) => x.id === 'generic-contactor-18a')).toBe(true);
    const fr = lineCommands(c, line(f, 'overload', '+DS-FR1'), undefined, f.ib)!;
    const h2 = exec(h1, fr, { lib });
    expect(h2.present.devices.find((d) => d.designation === '+DS-FR1')).toMatchObject({ parts: [{ part: 'generic-overload-relay-12a-18a', qty: 1 }], fields: { setting: '14.6 A' } });
    expect(undo(undo(h2)).present).toBe(p);
    // The BOM follows: the contactor is the 18 A part and the stock columns show what is left.
    expect(computeBom(h2.present, lib).use.get('generic-contactor-18a')).toEqual({ qty: 1, metres: 0 });
  });
  it('"size the whole project" accepts every proposal as one undo step, and the result needs no further change', () => {
    const cmd = acceptAllCommand(c, [f])!;
    const h = exec(createHistory(p), cmd, { lib });
    expect(h.past).toHaveLength(1);
    const [after] = sizeProject(ctxOf(h.present));
    expect(after.lines.every((l) => l.status === 'ok')).toBe(true);
    expect(acceptAllCommand(ctxOf(h.present), [after])).toBeUndefined();
    expect(undo(h).present).toBe(p);
    expect(runChecks(h.present, lib).findings).toEqual([]);
  });
});

describe('conductors', () => {
  it('proposes a larger cable part when the installation conditions need it, and sets nothing without a method', () => {
    const p = open('conveyor');
    // 40 °C and 3 circuits: 2.5 mm² gives 21 * 0.87 * 0.7 = 12.79 A < 16 A: a 4 mm² cable is needed, the 4 x 6 mm² part is the smallest in the library.
    const hot: Project = { ...p, settings: { ...p.settings, supply: { ...p.settings.supply, ambient: 40, grouping: 3 } } };
    const [f] = sizeProject(ctxOf(hot));
    const cab = line(f, 'cable', '-W1');
    expect(cab.cable?.xs).toBe(4);
    expect(cab).toMatchObject({ status: 'change', current: { label: 'GEN-CABLE-POWER-4X2,5MM2' } });
    expect(cab.proposal?.option?.part.id).toBe('generic-cable-power-4x6mm2');
    // The cable is stocked in metres: 12 m x 1 unit needed of 120 free.
    expect(cab.proposal?.option).toMatchObject({ availability: 'enough', needed: 12 });
    const h = exec(createHistory(hot), lineCommands(ctxOf(hot), cab)!, { lib });
    expect(h.present.cables.find((x) => x.id === '-W1')?.part).toBe('generic-cable-power-4x6mm2');
    const w = line(f, 'wires');
    expect(w).toMatchObject({ status: 'change', proposal: { xs: 4 } });
    const h2 = exec(createHistory(hot), lineCommands(ctxOf(hot), w)!, { lib });
    expect(h2.present.wireTypes.some((x) => x.crossSection === '4')).toBe(true);
    const none: Project = { ...p, settings: { ...p.settings, installationMethod: '' } };
    const [g] = sizeProject(ctxOf(none));
    expect(line(g, 'cable', '-W1')).toMatchObject({ status: 'missing', missing: ['installationMethod'] });
  });
  it('a long cable is sized up for the voltage drop', () => {
    const p = open('conveyor');
    const long: Project = { ...p, cables: p.cables.map((c) => ({ ...c, length: '150 m' })) };
    const [f] = sizeProject(ctxOf(long));
    expect(line(f, 'cable', '-W1').cable).toMatchObject({ xs: 4, limitedBy: 'voltage-drop' });
  });
});
