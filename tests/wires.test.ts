// Wire numbering (schemes, patterns, locked numbers, nets across pages), wire classes and the
// colour and label drawing of wires (brief, M3).
import { describe, expect, it } from 'vitest';
import { apply } from '@shared/commands';
import { createHistory, exec, undo } from '@shared/commands/history';
import { buildPage } from '@shared/draw/page';
import type { Pt, WireEl } from '@shared/model/types';
import { DEFAULT_WIRE_CLASSES, NUMBERING_PRESETS, WIRE_COLOURS, bundleLabel, formatWireNumber, renumberWires, wireSpec } from '@shared/wires';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { builder } from './support/builder';
import { loadLibrary } from './support/library';

const lib = loadLibrary();
const P = (x: number, y: number): Pt => ({ x, y });
const wires = (p: { pages: { elements: { kind: string }[] }[] }, i = 0) => p.pages[i].elements.filter((e): e is WireEl => e.kind === 'wire');

/** Three nets: two on L1 (left, middle) and one on L2, plus a net without a potential. */
function circuit() {
  const b = builder(lib, 'w', 'Wires');
  const pg = b.addPage('power', { en: 'Power' });
  const f1 = b.place(pg, 'fuse', 50, 60), f2 = b.place(pg, 'fuse', 90, 60), f3 = b.place(pg, 'fuse', 130, 60);
  b.wire(pg, [P(50, 30), f1.pin('1')], { potential: 'L1' });
  b.wire(pg, [P(90, 30), f2.pin('1')], { potential: 'L1' });
  b.wire(pg, [P(130, 30), f3.pin('1')], { potential: 'L2' });
  b.wire(pg, [f1.pin('2'), P(50, 100)]);
  return { b, pg };
}
const numbers = (p: Parameters<typeof wires>[0]) => wires(p).map((w) => w.number);
const withScheme = (b: ReturnType<typeof circuit>['b'], scheme: 'potential' | 'page-column' | 'sequential', pattern = NUMBERING_PRESETS[scheme]) => b.run({ type: 'project/settings', settings: { numbering: { scheme, pattern, start: 1, step: 1 } } });

describe('wire number patterns', () => {
  const ctx = { n: 20, page: 8, col: 'E', row: '3', potential: 'L+', suffix: 'L+' };
  it('builds counter plus potential suffix like 020L+, 005U and 030FL', () => {
    expect(formatWireNumber('{n:3}{suffix}', ctx)).toBe('020L+');
    expect(formatWireNumber('{n:3}{suffix}', { ...ctx, n: 5, suffix: 'U' })).toBe('005U');
    expect(formatWireNumber('{n:3}FL', { ...ctx, n: 30 })).toBe('030FL');
  });
  it('fills page, column, row and potential tokens and leaves unknown ones alone', () => {
    expect(formatWireNumber('{page:2}.{col}.{n}', ctx)).toBe('08.E.20');
    expect(formatWireNumber('{potential}-{row}-{x}', ctx)).toBe('L+-3-{x}');
  });
});

describe('automatic numbering', () => {
  it('by potential: one counter per potential, suffix from the wire class', () => {
    const { b } = circuit();
    withScheme(b, 'potential');
    expect(numbers(renumberWires(b.project, lib))).toEqual(['001L1', '002L1', '001L2', '001']);
  });
  it('sequential: one counter, start and step', () => {
    const { b } = circuit();
    b.run({ type: 'project/settings', settings: { numbering: { scheme: 'sequential', pattern: '{n}', start: 10, step: 5 } } });
    expect(numbers(renumberWires(b.project, lib))).toEqual(['10', '20', '25', '15']);
  });
  it('by page and column: the counter restarts in every column of every page', () => {
    const { b } = circuit();
    withScheme(b, 'page-column');
    const out = numbers(renumberWires(b.project, lib));
    expect(out.every((n) => /^01\.[0-9A-Z]\.\d+$/.test(n ?? ''))).toBe(true);
    expect(new Set(out).size).toBe(4);
  });
  it('keeps numbers typed by hand and never gives a number twice', () => {
    const { b, pg } = circuit();
    const first = wires(b.project)[0];
    b.run({ type: 'el/update', page: pg, id: first.id, patch: { number: '001L1', numberLocked: true } });
    withScheme(b, 'potential');
    const out = renumberWires(b.project, lib);
    const n = numbers(out);
    expect(n[0]).toBe('001L1');
    expect(new Set(n).size).toBe(n.length);
    expect(n[1]).toBe('002L1');
  });
  it('gives the nets joined by an interruption point one number', () => {
    const b = builder(lib, 'w', 'Wires');
    const a = b.addPage('control', { en: 'A' });
    const c = b.addPage('control', { en: 'B' });
    const ip1 = b.place(a, 'interruption-point', 100, 50, { value: 'SIG' });
    b.wire(a, [P(60, 50), ip1.pin('1')]);
    const ip2 = b.place(c, 'interruption-point', 40, 80, { value: 'SIG', mirror: true });
    b.wire(c, [ip2.pin('1'), P(90, 80)]);
    const out = renumberWires(b.project, lib);
    expect(wires(out, 0)[0].number).toBeDefined();
    expect(wires(out, 0)[0].number).toBe(wires(out, 1)[0].number);
  });
  it('does not number single-line pages or bundles, and a page renumber leaves other pages alone', () => {
    const b = builder(lib, 'w', 'Wires');
    const sl = b.addPage('singleLine', { en: 'SL' });
    const p1 = b.addPage('power', { en: 'P1' });
    const p2 = b.addPage('power', { en: 'P2' });
    b.wire(sl, [P(10, 10), P(10, 40)]);
    b.wire(p1, [P(10, 10), P(10, 40)]);
    b.wire(p1, [P(30, 10), P(30, 40)], { bundle: true });
    b.wire(p2, [P(10, 10), P(10, 40)]);
    const one = renumberWires(b.project, lib, p1);
    expect(wires(one, 0)[0].number).toBeUndefined();
    expect(wires(one, 1).map((w) => w.number)).toEqual(['001', undefined]);
    expect(wires(one, 2)[0].number).toBeUndefined();
  });
  it('is one undoable command', () => {
    const { b } = circuit();
    let h = createHistory(b.project);
    h = exec(h, { type: 'wire/renumber' }, { lib });
    expect(numbers(h.present).every(Boolean)).toBe(true);
    h = undo(h);
    expect(h.present).toBe(b.project);
    // Running it again on a numbered project changes nothing (no empty undo step).
    const done = apply(b.project, { type: 'wire/renumber' }, { lib });
    expect(apply(done, { type: 'wire/renumber' }, { lib })).toBe(done);
  });
});

describe('wire classes, colours and labels', () => {
  it('has a class for every default potential and the library colour codes', () => {
    const { b } = circuit();
    for (const p of b.project.potentials) expect(b.project.wireClasses.some((c) => c.id === p.id), p.id).toBe(true);
    const lib60757 = JSON.parse(readFileSync(join(__dirname, '..', 'library/colours/iec-60757.json'), 'utf8')) as { colours: { code: string; name: { en: string; it: string } }[] };
    expect(WIRE_COLOURS.map((c) => ({ code: c.code, name: c.name }))).toEqual(lib60757.colours);
    for (const c of DEFAULT_WIRE_CLASSES) expect(WIRE_COLOURS.some((x) => x.code === c.colour)).toBe(true);
  });
  it('picks the wire type over the class of the potential and labels a bundle "10 mm² BK"', () => {
    const { b } = circuit();
    b.run({ type: 'project/wires', wireTypes: [{ id: 'T10', type: 'H07V-K', crossSection: '10', colour: 'BK' }] });
    const spec = wireSpec(b.project, { wireType: 'T10', potential: 'L1' });
    expect(spec).toMatchObject({ colour: 'BK', crossSection: '10', suffix: 'L1' });
    expect(bundleLabel(spec)).toBe('10 mm² BK');
    expect(wireSpec(b.project, { potential: 'PE' }).colour).toBe('GNYE');
  });
  it('draws conductors in their colour when the option is on, GNYE with a yellow stripe', () => {
    const b = builder(lib, 'w', 'Wires');
    const pg = b.addPage('power', { en: 'P' });
    b.wire(pg, [P(20, 20), P(20, 60)], { potential: 'PE' });
    b.wire(pg, [P(40, 20), P(40, 60)], { potential: 'N' });
    const stroke = (opt: boolean) => {
      const p = opt ? apply(b.project, { type: 'project/settings', settings: { wireColours: true } }, { lib }) : b.project;
      return buildPage(p, p.pages[0], lib, 0).prims.filter((x) => x.k === 'poly' && x.id).map((x) => (x.k === 'poly' ? `${x.c}${x.dash ? '-dash' : ''}` : ''));
    };
    expect(stroke(false)).toEqual(['#000000', '#000000']);
    expect(stroke(true)).toEqual(['#1a8f1a', '#e6c800-dash', '#1b4fd8']);
  });
  it('rotates the number of a vertical wire and keeps a horizontal one level', () => {
    const b = builder(lib, 'w', 'Wires');
    const pg = b.addPage('power', { en: 'P' });
    b.wire(pg, [P(20, 20), P(20, 60)], { number: '001' });
    b.wire(pg, [P(40, 20), P(80, 20)], { number: '002' });
    const texts = buildPage(b.project, b.project.pages[0], lib, 0).prims.filter((p) => p.k === 'text' && ['001', '002'].includes(p.text));
    expect(texts.map((p) => (p.k === 'text' ? p.rot : 0))).toEqual([-90, 0]);
  });
});
