// M2: devices and their representations, cross-references, contact images, interruption points,
// connector pins, nested assemblies, the BOM, macros and the device commands.
import { describe, expect, it } from 'vitest';
import { apply } from '@shared/commands';
import { createHistory, exec, undo } from '@shared/commands/history';
import { netGroups, pageNets, projectNets } from '@shared/connectivity';
import { deviceFunctions, deviceIndex, formatPosition, keyOf, refsOf, scanStats, zoneAt } from '@shared/devices';
import { buildPage } from '@shared/draw/page';
import { bomToCsv, computeBom } from '@shared/bom';
import { macroFromSelection, placeMacro } from '@shared/macros';
import { zoneRange } from '@shared/model/zones';
import type { BoxEl, Project, SymbolEl } from '@shared/model/types';
import { duplicateDesignations, renumber } from '@shared/numbering';
import { builder } from './support/builder';
import { loadLibrary } from './support/library';

const lib = loadLibrary();
const ctx = { lib };
const P = (x: number, y: number) => ({ x, y });
const texts = (p: Project, pageIdx: number) => buildPage(p, p.pages[pageIdx], lib, pageIdx).prims.filter((q) => q.k === 'text').map((q) => (q as { text: string }).text);

/** A contactor -KM1: single-line symbol on page 1, power part on page 2, coil and two contacts on page 3. */
function starter() {
  const b = builder(lib, 'p', 'T');
  const sl = b.addPage('singleLine', { en: 'SL' }, { location: 'DS' });
  const pw = b.addPage('power', { en: 'Power' }, { location: 'DS' });
  const ct = b.addPage('control', { en: 'Control' }, { location: 'DS' });
  b.place(sl, 'contactor-1p', 50, 50, { designation: '-KM1' });
  b.place(pw, 'contactor-3p', 50, 50, { designation: '-KM1' });
  const coil = b.place(ct, 'coil', 50, 150, { designation: '-KM1', stateNote: { en: 'Contacts shown de-energised' } });
  b.place(ct, 'contact-no', 150, 30, { designation: '-KM1' });
  b.place(ct, 'contact-nc', 200, 100, { designation: '-KM1' });
  return { b, sl, pw, ct, coil };
}

describe('devices and representations', () => {
  it('one designation is one device with several representations, counted once', () => {
    const { b } = starter();
    const idx = deviceIndex(b.project, lib);
    expect(idx.devices.map((d) => d.key)).toEqual(['+DS-KM1']);
    const d = idx.devices[0];
    expect(d.reps).toHaveLength(5);
    expect(deviceFunctions(d)).toEqual({ coils: 1, main: 2, aux: 2 });
    b.parts(b.project.pages[1].id, '-KM1', [['generic-contactor-12a', 1]]);
    expect(computeBom(b.project, lib).rows.filter((r) => r.designation === '+DS-KM1')).toHaveLength(1);
  });
  it('aspects keep -K1 in +DS and -K1 in +MO apart', () => {
    const b = builder(lib, 'p', 'T');
    const a = b.addPage('control', { en: 'A' }, { location: 'DS' });
    const c = b.addPage('control', { en: 'B' }, { location: 'MO' });
    b.place(a, 'coil', 10, 10, { designation: '-K1' });
    b.place(c, 'coil', 10, 10, { designation: '-K1' });
    expect(deviceIndex(b.project, lib).devices.map((d) => d.key)).toEqual(['+DS-K1', '+MO-K1']);
    expect(keyOf(b.project.pages[0], '-K1')).toBe('+DS-K1');
  });
  it('renaming a symbol renames the whole device and moves its data; relinking changes one symbol only', () => {
    const { b, pw, ct, coil } = starter();
    b.parts(pw, '-KM1', [['generic-contactor-9a', 1]]);
    const renamed = apply(b.project, { type: 'el/update', page: ct, id: coil.id, patch: { designation: '-KM7' } }, ctx);
    const idx = deviceIndex(renamed, lib);
    expect(idx.devices.map((d) => d.key)).toEqual(['+DS-KM7']);
    expect(idx.devices[0].reps).toHaveLength(5);
    expect(renamed.devices.map((r) => r.designation)).toEqual(['+DS-KM7']);
    const one = b.project.pages[2].elements.find((e) => e.kind === 'symbol' && e.symbolId === 'contact-nc') as SymbolEl;
    const relinked = apply(b.project, { type: 'device/relink', page: ct, id: one.id, designation: '-KM9' }, ctx);
    expect(deviceIndex(relinked, lib).devices.map((d) => d.key)).toEqual(['+DS-KM1', '+DS-KM9']);
  });
  it('renumbering keeps the representations of a device together and moves its data and parent', () => {
    const { b, sl, pw, ct } = starter();
    b.place(sl, 'coil', 20, 150, { designation: '-KM5' });
    b.parts(pw, '-KM1', [['generic-contactor-9a', 1]]);
    b.assembly(ct, '-A9', { x: 0, y: 0, w: 10, h: 10 }, ['-KM1']);
    const after = renumber(b.project, lib);
    const idx = deviceIndex(after, lib);
    // KM5 (x=20 on the first page) is read before KM1 (x=50): it becomes KM1, the old KM1 becomes KM2 on all five symbols.
    expect(idx.byKey.get('+DS-KM2')?.reps).toHaveLength(5);
    expect(after.devices.find((r) => r.designation === '+DS-KM2')?.parts).toHaveLength(1);
    expect(after.devices.find((r) => r.designation === '+DS-KM2')?.parent).toBe('+DS-A9');
  });
  it('finds real duplicates, not representations', () => {
    const { b, ct } = starter();
    expect(duplicateDesignations(b.project, lib)).toEqual([]);
    b.place(ct, 'coil', 100, 150, { designation: '-KM1' });
    expect(duplicateDesignations(b.project, lib)).toEqual(['+DS-KM1']);
  });
  it('device updates drop empty records and ignore a device being its own parent', () => {
    const { b } = starter();
    let p = apply(b.project, { type: 'device/update', key: '+DS-KM1', patch: { fields: { make: 'Buy' }, parent: '+DS-KM1' } }, ctx);
    expect(p.devices).toEqual([{ designation: '+DS-KM1', parts: [], fields: { make: 'Buy' } }]);
    p = apply(p, { type: 'device/update', key: '+DS-KM1', patch: { fields: { make: '' } } }, ctx);
    expect(p.devices).toEqual([]);
  });
});

describe('cross-references', () => {
  it('formats page.column and page-column-row, padded', () => {
    expect(formatPosition({ format: 'page.column', pageDigits: 0 }, 8, 'E', '3')).toBe('8.E');
    expect(formatPosition({ format: 'page-column-row', pageDigits: 2 }, 8, 'E', '3')).toBe('08-E3');
  });
  it('reads the zone from the template labels', () => {
    const { b } = starter();
    const pg = b.project.pages[0];
    // Default frame: columns 1 to 8 across 390 mm from x = 20, rows A to F down 277 mm from y = 10.
    expect(zoneAt(b.project, pg, 25, 12)).toEqual({ col: '1', row: 'A' });
    expect(zoneAt(b.project, pg, 400, 280)).toEqual({ col: '8', row: 'F' });
  });
  it('gives every representation the position of the others, in the configured format', () => {
    const { b, ct, coil } = starter();
    let p = b.project;
    const idx = deviceIndex(p, lib);
    const info = refsOf(idx, ct, coil.id)!;
    expect(info.contacts).toHaveLength(4);
    expect(info.contacts.find((r) => r.pageIndex === 0)?.position).toBe('1.1');
    p = apply(p, { type: 'template/upsert', template: { ...p.templates[0], frame: { ...p.templates[0].frame, columns: zoneRange('A', 'H'), rows: zoneRange('1', '6') } } }, ctx);
    p = apply(p, { type: 'project/settings', settings: { crossRef: { format: 'page-column-row', pageDigits: 2 } } }, ctx);
    const rep = deviceIndex(p, lib).devices[0].reps.find((r) => r.pageIndex === 2 && r.role === 'coil')!;
    expect(rep.position).toMatch(/^03-[A-H][1-6]$/);
  });
  it('draws the contact image under a coil with the note on the state shown, and the coil position at a contact', () => {
    const { b } = starter();
    const t = texts(b.project, 2);
    expect(t).toContain('Contacts shown de-energised');
    const coilPos = deviceIndex(b.project, lib).devices[0].reps.find((r) => r.role === 'coil')!.position;
    expect(t.filter((x) => /^\d+\.\d$/.test(x)).length).toBeGreaterThanOrEqual(4);
    expect(texts(b.project, 1).some((x) => x === `[${coilPos}]`)).toBe(true);
  });
  it('a breaker drawn on a single-line and a multi-line page refers to itself both ways', () => {
    const b = builder(lib, 'p', 'T');
    const sl = b.addPage('singleLine', { en: 'SL' });
    const ml = b.addPage('power', { en: 'ML' });
    b.place(sl, 'mcb-1p', 100, 100, { designation: '-QF1' });
    b.place(ml, 'mcb-3p', 100, 100, { designation: '-QF1' });
    const idx = deviceIndex(b.project, lib);
    const [a, c] = idx.devices[0].reps;
    expect(texts(b.project, 0)).toContain(`[${c.position}]`);
    expect(texts(b.project, 1)).toContain(`[${a.position}]`);
  });
});

describe('interruption points and connector pins', () => {
  it('joins nets of two pages by the signal name and carries a potential name', () => {
    const b = builder(lib, 'p', 'T');
    const a = b.addPage('control', { en: 'A' });
    const c = b.addPage('control', { en: 'B' });
    b.wire(a, [P(40, 40), P(70, 40)], { potential: '24VDC' });
    b.place(a, 'interruption-point', 70, 40, { value: 'SIG' });
    b.wire(c, [P(40, 40), P(70, 40)]);
    b.place(c, 'interruption-point', 40, 40, { value: 'SIG', mirror: true });
    b.wire(c, [P(100, 40), P(130, 40)]);
    b.place(c, 'interruption-point', 130, 40, { value: 'OTHER' });
    const nets = projectNets(b.project, lib);
    const groups = netGroups(b.project, lib, nets);
    const g = groups.find((x) => x.signals.includes('SIG'))!;
    expect(g.pages.sort()).toEqual([a, c].sort());
    expect(g.potentials).toEqual(['24VDC']);
    expect(groups.find((x) => x.signals.includes('OTHER'))?.pages).toEqual([c]);
    const idx = deviceIndex(b.project, lib);
    expect(idx.signals.get('SIG')).toHaveLength(2);
  });
  it('a signal named like a potential carries that potential', () => {
    const b = builder(lib, 'p', 'T');
    const a = b.addPage('control', { en: 'A' });
    b.wire(a, [P(40, 40), P(70, 40)]);
    b.place(a, 'interruption-point', 70, 40, { value: 'L+' });
    expect(pageNets(b.project, b.project.pages[0], lib)[0].potential).toBe('L+');
  });
  it('box and connector pins are connection points of wires', () => {
    const b = builder(lib, 'p', 'T');
    const pg = b.addPage('plc', { en: 'P' });
    const x = b.box(pg, { variant: 'connector', x: 60, y: 40, w: 15, designation: '-X1', pins: [['1', 'right', 'K1'], ['2', 'right', 'K2']] });
    const lamp = b.place(pg, 'lamp', 100, 45, { designation: '-H1' });
    b.wire(pg, [x.pin('1'), P(100, 45 - 5 + 0)].slice(0, 1).concat(lamp.pin('1')));
    const nets = pageNets(b.project, b.project.pages[0], lib);
    expect(nets).toHaveLength(1);
    expect(nets[0].pins.map((p) => p.pin).sort()).toEqual(['1', '1']);
    expect(x.pin('2')).toEqual({ x: 75, y: 50 });
  });
  it('mated connectors join pins with the same number across pages', () => {
    const b = builder(lib, 'p', 'T');
    const a = b.addPage('control', { en: 'A' });
    const c = b.addPage('plc', { en: 'B' });
    const plug = b.box(a, { variant: 'connector', x: 100, y: 40, w: 15, designation: '-X11', gender: 'plug', mate: '-X10', pins: [['1', 'left'], ['2', 'left']] });
    const sock = b.box(c, { variant: 'connector', x: 60, y: 40, w: 15, designation: '-X10', gender: 'socket', mate: '-X11', pins: [['1', 'right'], ['2', 'right']] });
    b.wire(a, [plug.pin('1'), P(80, 45)], { potential: '24VDC' });
    b.wire(a, [plug.pin('2'), P(80, 50)]);
    b.wire(c, [sock.pin('1'), P(90, 45)]);
    b.wire(c, [sock.pin('2'), P(90, 50)], { potential: '0V' });
    const groups = netGroups(b.project, lib);
    expect(groups).toHaveLength(4 - 2);
    expect(groups.map((g) => g.potentials.sort().join())).toEqual(['24VDC', '0V']);
  });
  it('moving a box drags the wires on its pins', () => {
    const b = builder(lib, 'p', 'T');
    const pg = b.addPage('plc', { en: 'P' });
    const x = b.box(pg, { variant: 'blackbox', x: 60, y: 40, w: 30, designation: '-A1', pins: [['1', 'right']] });
    b.wire(pg, [x.pin('1'), P(120, 45)]);
    const moved = apply(b.project, { type: 'el/move', page: pg, ids: [x.id], dx: 0, dy: 10 }, ctx);
    const w = moved.pages[0].elements.find((e) => e.kind === 'wire');
    expect(w?.kind === 'wire' && w.points[0]).toEqual({ x: 90, y: 55 });
    expect(moved.pages[0].elements.find((e) => e.kind === 'box')).toMatchObject({ y: 50 });
  });
});

describe('nested assemblies and the BOM', () => {
  function plant() {
    const b = builder(lib, 'p', 'T', { drawingLanguage: 'en' });
    const pg = b.addPage('power', { en: 'P' }, { location: 'DS' });
    b.place(pg, 'contactor-3p', 50, 50, { designation: '-KM1', functionText: { en: 'Main contactor' } });
    b.place(pg, 'fuse', 90, 50, { designation: '-F1' });
    b.place(pg, 'lamp', 130, 50, { designation: '-H1', functionText: { en: 'Run lamp' } });
    b.assembly(pg, '-A1', { x: 30, y: 30, w: 90, h: 40, label: 'Switching block' }, ['-KM1', '-F1']);
    b.parts(pg, '-KM1', [['generic-contactor-12a', 1], ['generic-aux-block-1no1nc', 2]]);
    b.parts(pg, '-F1', [['generic-fuse-holder-10x38', 1]]);
    b.parts(pg, '-A1', [['generic-din-rail-35mm-1m', 1]]);
    b.fields(pg, '-KM1', { make: 'Buy' });
    b.projectPart('generic-wiring-kit', 1);
    return { b, pg };
  }
  it('groups the devices of an assembly under it, with quantity times units', () => {
    const { b } = plant();
    let p = apply(b.project, { type: 'project/settings', settings: { bom: { ...b.project.settings.bom, units: 3 } } }, ctx);
    const bom = computeBom(p, lib);
    expect(bom.units).toBe(3);
    expect(bom.rows.map((r) => `${r.level}:${r.designation}:${r.code}:${r.qty}`)).toEqual([
      '0:+DS-A1:GEN-DIN-RAIL-35MM-1M:3',
      '1:+DS-F1:GEN-FUSE-HOLDER-10X38:3',
      '1:+DS-KM1:GEN-CONTACTOR-12A:3',
      '1:+DS-KM1:GEN-AUX-BLOCK-1NO1NC:6',
      '0:+DS-H1::0',
      '0::GEN-WIRING-KIT:3',
    ]);
    expect(bom.missing).toBe(1);
    expect(bom.rows.find((r) => r.designation === '+DS-H1')).toMatchObject({ missing: true, description: 'Run lamp' });
    p = apply(p, { type: 'project/settings', settings: { bom: { ...p.settings.bom, group: 'part' } } }, ctx);
    expect(computeBom(p, lib).rows.some((r) => r.level > 0 || r.assembly)).toBe(false);
  });
  it('an assembly outline is a device with a dashed outline and its children get the parent', () => {
    const { b } = plant();
    const rect = b.project.pages[0].elements.find((e) => e.kind === 'rect');
    expect(rect).toMatchObject({ dashed: true, assembly: '-A1' });
    expect(b.project.devices.filter((r) => r.parent === '+DS-A1').map((r) => r.designation)).toEqual(['+DS-F1', '+DS-KM1']);
    expect(texts(b.project, 0)).toContain('-A1');
  });
  it('survives a parent cycle without looping', () => {
    const { b } = plant();
    let p = apply(b.project, { type: 'device/update', key: '+DS-A1', patch: { parent: '+DS-KM1' } }, ctx);
    p = apply(p, { type: 'device/update', key: '+DS-KM1', patch: { parent: '+DS-A1' } }, ctx);
    expect(() => computeBom(p, lib)).not.toThrow();
  });
  it('lists the configured columns and user fields in the CSV, in the drawing language', () => {
    const { b } = plant();
    let p = apply(b.project, { type: 'project/settings', settings: { drawingLanguage: 'it', bom: { ...b.project.settings.bom, columns: ['designation', 'qty', 'description', 'field:make'] } } }, ctx);
    const csv = bomToCsv(p, computeBom(p, lib));
    const lines = csv.replace('﻿', '').trim().split('\r\n');
    expect(lines[0]).toBe('Designazione;Q.tà;Descrizione;Produzione o acquisto');
    expect(lines.some((l) => l.startsWith('+DS-KM1;1;') && l.endsWith('Buy'))).toBe(true);
    p = apply(p, { type: 'project/settings', settings: { drawingLanguage: 'en' } }, ctx);
    expect(bomToCsv(p, computeBom(p, lib)).split('\r\n')[0]).toContain('Designation,Qty,Description,Make or buy');
  });
  it('rescans only the pages that changed (incremental)', () => {
    const b = builder(lib, 'p', 'T');
    const pages = Array.from({ length: 30 }, (_, i) => b.addPage('control', { en: `P${i}` }));
    pages.forEach((pg, i) => b.place(pg, 'coil', 50, 50, { designation: `-K${i + 1}` }));
    computeBom(b.project, lib);
    const before = scanStats.pages;
    computeBom(b.project, lib);
    expect(scanStats.pages).toBe(before);
    const p2 = apply(b.project, { type: 'el/add', page: pages[7], elements: [{ id: 'extra', kind: 'text', x: 1, y: 1, rot: 0, text: 'x', size: 3, align: 'left' }] }, ctx);
    computeBom(p2, lib);
    expect(scanStats.pages - before).toBe(1);
  });
});

describe('macros and undo', () => {
  it('saves a selection and places it again with fresh designations, contacts following their coil', () => {
    const { b, ct } = starter();
    const page = b.project.pages[2];
    const m = macroFromSelection(page, page.elements.map((e) => e.id), { id: 'm', title: { en: 'M', it: 'M' } })!;
    expect(m.elements.every((e) => 'x' in e && e.x >= 0)).toBe(true);
    const placed = placeMacro(b.project, page, m, { x: 10, y: 10 }, 'z');
    const des = placed.filter((e): e is SymbolEl => e.kind === 'symbol').map((e) => e.designation);
    expect(des).toEqual(['-KM2', '-KM2', '-KM2'].map((x) => x));
    expect(new Set(placed.map((e) => e.id)).size).toBe(placed.length);
    const p = apply(b.project, { type: 'macro/place', page: ct, macro: m, x: 10, y: 10, prefix: 'z' }, ctx);
    expect(deviceIndex(p, lib).devices.map((d) => d.key)).toEqual(['+DS-KM1', '+DS-KM2']);
  });
  it('every device command is one undo step', () => {
    const { b, ct, coil } = starter();
    let h = createHistory(b.project);
    h = exec(h, { type: 'el/update', page: ct, id: coil.id, patch: { designation: '-KM3' } }, ctx);
    h = exec(h, { type: 'device/update', key: '+DS-KM3', patch: { fields: { make: 'Buy' } } }, ctx);
    h = exec(h, { type: 'projectPart/set', part: { id: 'pp1', part: 'generic-wiring-kit', qty: 1, fields: {} } }, ctx);
    h = exec(h, { type: 'box/place', page: ct, autoNumber: true, element: { id: 'bx', kind: 'box', variant: 'blackbox', x: 10, y: 10, w: 20, h: 20, designation: '', pins: [] } as BoxEl }, ctx);
    expect(h.past).toHaveLength(4);
    expect(h.present.pages[2].elements.find((e) => e.id === 'bx')).toMatchObject({ designation: '-A1' });
    h = undo(undo(undo(undo(h))));
    expect(h.present).toBe(b.project);
  });
});
