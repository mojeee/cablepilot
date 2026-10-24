// Terminals and terminal strips, cables and cores, and every live report (brief, M3).
import { describe, expect, it } from 'vitest';
import { apply } from '@shared/commands';
import { computeBom } from '@shared/bom';
import { netStats } from '@shared/connectivity';
import { scanStats } from '@shared/devices';
import { buildPage } from '@shared/draw/page';
import { reportCapacity, reportPageCommands, reportSyncCommands } from '@shared/draw/report';
import type { Pt, SymbolEl } from '@shared/model/types';
import { REPORT_IDS } from '@shared/model/types';
import { cableCores, nameplateLabels, reportTable, terminalStrips, usedSymbols } from '@shared/reports';
import { renumberWires } from '@shared/wires';
import { builder } from './support/builder';
import { loadLibrary } from './support/library';

const lib = loadLibrary();
const P = (x: number, y: number): Pt => ({ x, y });
const col = (t: ReturnType<typeof reportTable>, i: number) => t.rows.map((r) => r.cells[i]);

/** A fuse -F1 feeding a lamp -H1 through terminals -X1:1 and -X1:2 of a strip with a feed-through part and end plates. */
function field() {
  const b = builder(lib, 'r', 'Reports', { drawingLanguage: 'en' });
  const pg = b.addPage('control', { en: 'Control' }, { location: 'DS' });
  const f1 = b.place(pg, 'fuse', 50, 40, { designation: '-F1', functionText: { en: 'Control fuse' } });
  const h1 = b.place(pg, 'lamp', 50, 130, { designation: '-H1', functionText: { en: 'Run lamp\nconveyor' } });
  b.wire(pg, [P(50, 15), f1.pin('1')], { potential: '24VDC' });
  const t1 = b.place(pg, 'terminal', 50, 85, { designation: '-X1', functionText: { en: 'Lamp supply' } });
  b.wire(pg, [f1.pin('2'), t1.pin('1')]);
  b.wire(pg, [t1.pin('2'), h1.pin('1')]);
  const t2 = b.place(pg, 'terminal', 90, 85, { designation: '-X1', functionText: { en: 'Lamp return' } });
  b.wire(pg, [P(90, 60), t2.pin('1')]);
  b.parts(pg, '-X1', [['generic-terminal-feedthrough-2.5mm2', 1], ['generic-terminal-end-plate', 1], ['generic-terminal-end-stop', 2]]);
  b.run({ type: 'terminal/renumber' });
  b.run({ type: 'wire/renumber' });
  return { b, pg };
}

describe('terminals and terminal strips', () => {
  it('places a terminal into the strip of the last one and takes the next number (one command)', () => {
    const b = builder(lib, 'r', 'T');
    const pg = b.addPage('control', { en: 'C' });
    for (const x of [30, 60, 90]) b.run({ type: 'symbol/place', page: pg, autoNumber: true, element: { id: `t${x}`, kind: 'symbol', symbolId: 'terminal', x, y: 50, rot: 0, mirror: false, designation: '' } });
    const els = b.project.pages[0].elements as SymbolEl[];
    expect(els.map((e) => [e.designation, e.value])).toEqual([['-X1', '1'], ['-X1', '2'], ['-X1', '3']]);
  });
  it('numbers the terminals of a strip in reading order', () => {
    const { b } = field();
    const strips = terminalStrips(b.project, lib);
    expect(strips).toHaveLength(1);
    expect(strips[0].terminals.map((t) => t.no)).toEqual(['1', '2']);
  });
  it('generates the terminal diagram: destination, function text, part and strip length', () => {
    const { b } = field();
    const t = reportTable(b.project, lib, 'terminals');
    expect(t.rows[0]).toMatchObject({ heading: true });
    expect(t.rows[0].cells[0]).toBe('+DS-X1');
    expect(t.rows[0].cells[2]).toBe('2 terminals');
    // 2 terminals x 5.2 mm + end plate 2.2 mm + 2 end stops x 9.5 mm.
    expect(t.rows[0].cells[3]).toContain('31.6 mm');
    const [, r1, r2] = t.rows;
    expect(r1.cells[0]).toBe('-F1:2');
    expect(r1.cells[2]).toBe('1');
    expect(r1.cells[3]).toBe('Lamp supply');
    expect(r1.cells[4]).toBe('GEN-TERMINAL-FEEDTHROUGH-2,5MM2');
    expect(r1.cells[6]).toBe('-H1:1');
    expect(r2.cells[3]).toBe('Lamp return');
    expect(r1.cells[1]).toBeTruthy();
  });
  it('counts terminal parts once per terminal and end plates once in the BOM', () => {
    const { b } = field();
    const rows = computeBom(b.project, lib).rows.filter((r) => r.designation === '+DS-X1');
    expect(Object.fromEntries(rows.map((r) => [r.part, r.qty]))).toEqual({ 'generic-terminal-feedthrough-2.5mm2': 2, 'generic-terminal-end-plate': 1, 'generic-terminal-end-stop': 2 });
  });
  it('lists terminal markers and the torque table with its status', () => {
    const { b } = field();
    expect(reportTable(b.project, lib, 'terminalMarkers').rows.map((r) => r.cells.join('|'))).toEqual(['-X1|1|1', '-X1|2|1']);
    const q = reportTable(b.project, lib, 'torque');
    expect(q.rows).toHaveLength(1);
    expect(q.rows[0].cells[2]).toBe('0.5 Nm');
    expect(q.rows[0].cells[3]).toContain('generic part');
    expect(q.rows[0].cells[4]).toBe('to be verified');
  });
});

describe('cables', () => {
  it('lists the cores of a multicore cable from the wires that name it, then the spare cores', () => {
    const { b, pg } = field();
    const [w1, w2] = b.project.pages[0].elements.filter((e) => e.kind === 'wire').slice(1, 3);
    b.run({ type: 'part/embed', def: lib.parts.get('generic-cable-sensor-4x0.34mm2')! });
    b.run({ type: 'cable/set', cable: { id: '-W1', kind: 'multicore', part: 'generic-cable-sensor-4x0.34mm2' } });
    b.run({ type: 'el/update', page: pg, id: w1.id, patch: { cable: '-W1', core: 'WH' } });
    b.run({ type: 'el/update', page: pg, id: w2.id, patch: { cable: '-W1', core: 'YE' } });
    const cores = cableCores(b.project, lib, b.project.cables[0]);
    expect(cores.map((c) => [c.core, c.spare ? 'spare' : c.wire ? 'used' : ''])).toEqual([['WH', 'used'], ['YE', 'used'], ['GN', 'spare'], ['BN', 'spare']]);
    const t = reportTable(b.project, lib, 'cables');
    expect(t.rows[0].cells[0]).toBe('-W1');
    expect(col(t, 2).slice(1)).toEqual(['WH', 'YE', 'GN', 'BN']);
    // The wire list shows the core colour and the cable's cross-section.
    const wl = reportTable(b.project, lib, 'wires');
    expect(wl.rows.some((r) => r.cells[6] === '-W1:WH' && r.cells[4] === 'WH' && r.cells[3] === '0.34')).toBe(true);
  });
  it('runs a flat ribbon cable pin to pin between two connectors and a patch cable between named pins', () => {
    const b = builder(lib, 'c', 'Cables');
    const pg = b.addPage('plc', { en: 'PLC' });
    b.box(pg, { variant: 'connector', x: 30, y: 30, designation: '-X20', pins: [['1', 'right'], ['2', 'right'], ['3', 'right']] });
    b.box(pg, { variant: 'connector', x: 100, y: 30, designation: '-X21', pins: [['1', 'left'], ['2', 'left']] });
    b.box(pg, { variant: 'blackbox', x: 30, y: 100, designation: '-A3', pins: [['ETH', 'right']] });
    b.box(pg, { variant: 'blackbox', x: 100, y: 100, designation: '-A4', pins: [['P1', 'left']] });
    b.run({ type: 'cable/set', cable: { id: '-W1', kind: 'ribbon', part: 'generic-cable-ribbon-flat-10pole', from: '-X20', to: '-X21' } });
    b.run({ type: 'cable/set', cable: { id: '-W2', kind: 'patch', part: 'generic-cable-patch-rj45-cat5e', from: '-A3:ETH', to: '-A4:P1' } });
    expect(cableCores(b.project, lib, b.project.cables[0]).map((c) => `${c.from}>${c.to}`)).toEqual(['-X20:1>-X21:1', '-X20:2>-X21:2']);
    expect(cableCores(b.project, lib, b.project.cables[1])).toEqual([{ core: '1-8', colour: '', wire: '', from: '-A3:ETH', to: '-A4:P1' }]);
    expect(reportTable(b.project, lib, 'cables').rows.filter((r) => r.heading).map((r) => r.cells[0])).toEqual(['-W1', '-W2']);
  });
  it('adds cables with a part to the BOM', () => {
    const { b } = field();
    b.run({ type: 'part/embed', def: lib.parts.get('generic-cable-power-4x2.5mm2')! });
    b.run({ type: 'cable/set', cable: { id: '-W1', kind: 'multicore', part: 'generic-cable-power-4x2.5mm2' } });
    expect(computeBom(b.project, lib).rows.some((r) => r.designation === '-W1' && r.qty === 1)).toBe(true);
    b.run({ type: 'cable/remove', id: '-W1' });
    expect(b.project.cables).toEqual([]);
  });
});

describe('reports', () => {
  it('generates the wire list with from, to, cross-section, colour and type', () => {
    const { b } = field();
    const t = reportTable(b.project, lib, 'wires');
    expect(t.headers).toEqual(['Number', 'From', 'To', 'Cross-section', 'Colour', 'Type', 'Cable', 'Length (m)']);
    const row = t.rows.find((r) => r.cells[1] === '-F1:2');
    expect(row?.cells.slice(1, 6)).toEqual(['-F1:2', '-X1:1', '1.5', 'BK', 'H07V-K']);
    expect(t.rows.length).toBeGreaterThanOrEqual(2);
  });
  it('lists connector pins with what each is connected to', () => {
    const b = builder(lib, 'p', 'Pins');
    const pg = b.addPage('plc', { en: 'PLC' });
    const x = b.box(pg, { variant: 'connector', x: 30, y: 30, designation: '-X10', gender: 'socket', mate: '-X11', pins: [['1', 'right', 'K1'], ['2', 'right', 'K2']] });
    const l = b.place(pg, 'lamp', 90, 40, { designation: '-H1' });
    b.wire(pg, [x.pin('1'), P(70, x.pin('1').y), P(70, 30), l.pin('1')]);
    const t = reportTable(apply(b.project, { type: 'wire/renumber' }, { lib }), lib, 'pins');
    expect(t.rows[0]).toMatchObject({ heading: true, cells: ['-X10', '', '-> -X11'] });
    expect(t.rows[1].cells.slice(0, 3)).toEqual(['1', 'K1', '-H1:1']);
    expect(t.rows[2].cells.slice(0, 3)).toEqual(['2', 'K2', '']);
  });
  it('shows only the symbols the project uses in the legend', () => {
    const { b } = field();
    const ids = usedSymbols(b.project, lib).map((u) => u.id);
    expect(ids.sort()).toEqual(['fuse', 'lamp', 'terminal']);
    expect(reportTable(b.project, lib, 'legend').rows.every((r) => r.cells[2].includes('IEC'))).toBe(true);
  });
  it('writes the colour table, the suffix table with an example, contents and the BOM', () => {
    const { b } = field();
    const colours = reportTable(b.project, lib, 'colours');
    expect(colours.rows.find((r) => r.cells[0] === 'PE')?.cells.slice(1, 3)).toEqual(['GNYE', 'green-and-yellow']);
    const suf = reportTable(b.project, lib, 'suffixes');
    expect(suf.rows.find((r) => r.cells[0] === 'L1')?.cells.slice(1)).toEqual(['L1', '001L1']);
    expect(reportTable(b.project, lib, 'contents').rows).toEqual([{ cells: ['01', 'Control', 'Control'] }]);
    const bom = reportTable(b.project, lib, 'bom');
    expect(bom.headers[0]).toBe('Designation');
    expect(bom.rows.length).toBe(computeBom(b.project, lib).rows.length);
  });
  it('writes nameplate labels from function texts, with a field override, without terminals', () => {
    const { b, pg } = field();
    expect(nameplateLabels(b.project, lib)).toEqual([{ key: '+DS-F1', lines: ['-F1', 'Control fuse'] }, { key: '+DS-H1', lines: ['-H1', 'Run lamp', 'conveyor'] }]);
    b.fields(pg, '-F1', { nameplate: 'Lamp circuit\n24 V DC' });
    expect(reportTable(b.project, lib, 'nameplates').rows[0].cells).toEqual(['-F1', '-F1 / Lamp circuit / 24 V DC']);
  });
  it('lists wire markers (two per connection) and every report is a table with matching columns', () => {
    const { b } = field();
    const m = reportTable(b.project, lib, 'wireMarkers');
    expect(m.rows.every((r) => Number(r.cells[1]) % 2 === 0)).toBe(true);
    for (const id of REPORT_IDS) {
      const t = reportTable(b.project, lib, id);
      expect(t.widths.length, id).toBe(t.headers.length);
      for (const r of t.rows) expect(r.cells.length, id).toBeLessThanOrEqual(t.headers.length);
    }
  });
  it('prints in the drawing language of the project', () => {
    const { b } = field();
    const it = apply(b.project, { type: 'project/settings', settings: { drawingLanguage: 'it' } }, { lib });
    expect(reportTable(it, lib, 'terminals').title).toBe('Schema morsettiere');
    expect(reportTable(it, lib, 'wires').headers[0]).toBe('Numero');
  });
});

describe('report pages and incremental regeneration', () => {
  it('draws a window of the rows on a report page, repeating the header', () => {
    const { b } = field();
    const cmd = reportPageCommands(b.project, lib, ['wires'])[0];
    if (cmd.type !== 'page/add') throw new Error('page');
    const el = cmd.page.elements[0];
    if (el.kind !== 'report') throw new Error('report');
    const p = apply(b.project, cmd, { lib });
    const texts = (offset: number, rows: number) => {
      const pg = { ...p.pages[1], elements: [{ ...el, offset, rows }] };
      return buildPage({ ...p, pages: [p.pages[0], pg] }, pg, lib, 1).prims.filter((x) => x.k === 'text').map((x) => (x.k === 'text' ? x.text : ''));
    };
    expect(texts(0, 1)).toContain('Number');
    const second = texts(1, 1);
    expect(second).toContain('Number');
    expect(second).not.toContain(reportTable(p, lib, 'wires').rows[0].cells[1] + 'x');
  });
  it('adds as many pages as the rows need and completes them when the report grows', () => {
    const { b } = field();
    const cap = reportCapacity(b.project, { ...b.project.pages[0], type: 'report' }, 'wires', 18);
    expect(cap).toBeGreaterThan(10);
    // Make the wire list longer than one page by adding many wires on a second page.
    const pg2 = b.addPage('power', { en: 'More' });
    for (let i = 0; i < cap + 5; i++) {
      const x = 40 + (i % 15) * 22, y = 40 + Math.floor(i / 15) * 70;
      const f1 = b.place(pg2, 'fuse', x, y, { designation: `-F${i + 10}` });
      const h = b.place(pg2, 'lamp', x, y + 35, { designation: `-H${i + 10}` });
      b.wire(pg2, [f1.pin('2'), h.pin('1')]);
    }
    const cmds = reportPageCommands(b.project, lib, ['wires']);
    expect(cmds.length).toBeGreaterThan(1);
    // Start with only the first page, then complete.
    let p = apply(b.project, cmds[0], { lib });
    const sync = reportSyncCommands(p, lib);
    expect(sync.length).toBe(cmds.length - 1);
    for (const c of sync) p = apply(p, c, { lib });
    expect(reportSyncCommands(p, lib)).toEqual([]);
  });
  it('recomputes the nets and scans of the page that changed, not of the others', () => {
    const b = builder(lib, 'i', 'Incremental');
    const pages = [0, 1, 2, 3].map((i) => b.addPage('control', { en: `P${i}` }));
    pages.forEach((pg, i) => {
      const l = b.place(pg, 'lamp', 50, 60, { designation: `-H${i + 1}`, functionText: { en: `Lamp ${i}` } });
      b.wire(pg, [P(50, 20), l.pin('1')]);
    });
    renumberWires(b.project, lib);
    reportTable(b.project, lib, 'wires');
    reportTable(b.project, lib, 'nameplates');
    const n0 = netStats.pages, s0 = scanStats.pages;
    // Edit one page: add a wire.
    const next = apply(b.project, { type: 'el/add', page: pages[2], elements: [{ id: 'extra', kind: 'wire', points: [P(80, 20), P(80, 50)] }] }, { lib });
    reportTable(next, lib, 'wires');
    reportTable(next, lib, 'nameplates');
    expect(netStats.pages - n0).toBe(1);
    expect(scanStats.pages - s0).toBeLessThanOrEqual(1);
  });
});
