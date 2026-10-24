// Warehouse: import mapping, quantity parsing, XLSX reading, links, availability arithmetic (units to build,
// cable metres, reserved stock), ranking, stale and lost stock, the picking list.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { join } from 'node:path';
import { computeBom } from '@shared/bom';
import { parseCsv } from '@shared/export/csv';
import { readXlsxRows } from '@shared/export/xlsxRead';
import { xlsxBytes } from '@shared/export/xlsx';
import type { PartDef } from '@shared/library/types';
import type { Match } from '@shared/sizing';
import { applyMapping, daysBetween, guessMapping, isStale, newStockList, parseQuantity, parseWarehouse, pickingList, rankOptions, stockIssues, stockOfPart, withStock, type StockList } from '@shared/stock';
import { builder } from './support/builder';
import { loadLibrary } from './support/library';

const lib = loadLibrary();
const parts = [...lib.parts.values()];
const part = (id: string) => lib.parts.get(id) as PartDef;
const stockFrom = (rows: string[][], prev: StockList | null = null) => newStockList(applyMapping(rows, guessMapping(rows)), prev, { stockDate: '2026-10-24', sourceName: 't.csv' });

describe('import mapping', () => {
  const rows = [
    ['Codice articolo', 'Descrizione', 'Giacenza', 'Impegnato', 'Ubicazione', 'Magazzino', 'UM'],
    ['GEN-CONTACTOR-18A', 'Contattore', '18', '4', 'A-03-03', 'Centrale', 'pz'],
    ['GEN-CABLE-POWER-4X6MM2', 'Cavo', '120,5', '', '', '', 'm'],
    ['', 'no code', '1', '', '', '', ''],
    ['GEN-X', 'bad quantity', 'many', '', '', '', ''],
    ['', '', '', '', '', '', ''],
  ];
  it('guesses Italian and English headers', () => {
    expect(guessMapping(rows).columns).toEqual({ code: 'Codice articolo', description: 'Descrizione', onHand: 'Giacenza', reserved: 'Impegnato', location: 'Ubicazione', warehouse: 'Magazzino', unit: 'UM' });
    expect(guessMapping([['Part code', 'Manufacturer', 'On hand', 'Reserved']]).columns).toMatchObject({ code: 'Part code', manufacturer: 'Manufacturer', onHand: 'On hand', reserved: 'Reserved' });
  });
  it('applies a mapping, reads decimal commas and reports skipped rows', () => {
    const r = applyMapping(rows, guessMapping(rows));
    expect(r.items).toHaveLength(2);
    expect(r.items[0]).toMatchObject({ code: 'GEN-CONTACTOR-18A', onHand: 18, reserved: 4, location: 'A-03-03', warehouse: 'Centrale', unit: 'pz' });
    expect(r.items[1]).toMatchObject({ onHand: 120.5, reserved: 0 });
    expect(r.skipped).toEqual([{ row: 4, reason: 'no-code' }, { row: 5, reason: 'bad-quantity' }]);
  });
  it('maps by column number when there is no header row', () => {
    const r = applyMapping([['A1', 'x', '7']], { header: false, columns: { code: '#1', onHand: '#3' } });
    expect(r.items).toMatchObject([{ code: 'A1', onHand: 7, unit: 'pcs' }]);
  });
  it('reads quantities as ERPs write them', () => {
    expect(['12', '12,5', '1.234,5', '1,234.5', '1.234.567', '-3', ' 7 '].map(parseQuantity)).toEqual([12, 12.5, 1234.5, 1234.5, 1234567, -3, 7]);
    expect(parseQuantity('abc')).toBeNaN();
  });
  it('imports the sample stock file with the guessed mapping', () => {
    const r = applyMapping(parseCsv(readFileSync(join(__dirname, '..', 'samples', 'stock-sample.csv'), 'utf8')), guessMapping(parseCsv(readFileSync(join(__dirname, '..', 'samples', 'stock-sample.csv'), 'utf8'))));
    expect(r.skipped).toEqual([]);
    expect(r.items.length).toBeGreaterThan(15);
    expect(r.items.find((i) => i.code === 'GEN-CABLE-POWER-4X2,5MM2')).toMatchObject({ unit: 'm', onHand: 250, reserved: 50 });
  });
});

describe('XLSX reading', () => {
  it('reads a deflated workbook with shared strings and sparse rows (a file as an ERP writes it)', () => {
    const rows = readXlsxRows(new Uint8Array(readFileSync(join(__dirname, 'fixtures', 'stock-erp.xlsx'))), (b) => new Uint8Array(inflateRawSync(b)));
    expect(rows[0]).toEqual(['Codice articolo', 'Descrizione', 'Giacenza', 'Impegnato', 'Ubicazione', 'Magazzino', 'UM']);
    expect(rows[1]).toEqual(['GEN-CONTACTOR-18A', 'Contattore 3 poli, 18 A AC-3', '18', '4', 'A-03-03', 'Centrale', 'pz']);
    expect(rows[2]).toEqual([]);
    expect(rows[3]).toEqual(['GEN-CABLE-POWER-4X6MM2', 'Cavo 4 x 6 mm² & PE', '120.5', '', '', 'Centrale']);
    const r = applyMapping(rows, guessMapping(rows));
    expect(r.items.map((i) => [i.code, i.onHand, i.reserved, i.warehouse])).toEqual([['GEN-CONTACTOR-18A', 18, 4, 'Centrale'], ['GEN-CABLE-POWER-4X6MM2', 120.5, 0, 'Centrale']]);
  });
  it('reads the workbooks we write ourselves', () => {
    const bytes = xlsxBytes([{ name: 'Stock', rows: [['Part code', 'On hand'], ['A', '5']] }]);
    expect(readXlsxRows(bytes, () => { throw new Error('stored entries need no inflate'); })).toEqual([['Part code', 'On hand'], ['A', '5']]);
  });
});

describe('availability: on hand - reserved - this project\'s use', () => {
  // A project with 2 devices using the 18 A contactor (1 each) and a 12 m cable; built for 3 units.
  const b = builder(lib, 't', 'T');
  const pg = b.addPage('power', { en: 'Power' });
  b.place(pg, 'contactor-3p', 50, 50, { designation: '-KM1' });
  b.place(pg, 'contactor-3p', 100, 50, { designation: '-KM2' });
  b.parts(pg, '-KM1', [['generic-contactor-18a', 1]]);
  b.parts(pg, '-KM2', [['generic-contactor-18a', 2]]);
  b.run({ type: 'part/embed', def: part('generic-cable-power-4x2.5mm2') });
  b.run({ type: 'cable/set', cable: { id: '-W1', kind: 'multicore', part: 'generic-cable-power-4x2.5mm2', length: '12 m' } });
  b.run({ type: 'project/settings', settings: { bom: { ...b.project.settings.bom, units: 3 } } });
  const bom = computeBom(b.project, lib);
  const stock = stockFrom([
    ['Part code', 'On hand', 'Reserved', 'Location', 'Warehouse', 'Unit'],
    ['GEN-CONTACTOR-18A', '10', '2', 'A-1', 'Main', 'pcs'],
    ['GEN-CONTACTOR-18A', '4', '0', 'B-1', 'Branch', 'pcs'],
    ['GEN-CABLE-POWER-4X2,5MM2', '100', '10', 'C-1', 'Main', 'm'],
  ]);
  it('counts quantity per device times the units to build, and cable in metres', () => {
    expect(bom.use.get('generic-contactor-18a')).toEqual({ qty: 9, metres: 0 }); // (1 + 2) x 3 units
    expect(bom.use.get('generic-cable-power-4x2.5mm2')).toEqual({ qty: 3, metres: 36 }); // 12 m x 3 units
  });
  it('subtracts reserved stock and the project\'s use, row by row', () => {
    const s = stockOfPart(stock, parts, 'generic-contactor-18a', bom)!;
    expect(s).toMatchObject({ onHand: 14, reserved: 2, free: 12, use: 9, available: 3, unit: 'pcs' });
    // 9 are taken from the larger row first (free 8), then 1 from the second (free 4).
    expect(s.rows.map((r) => [r.item.warehouse, r.free, r.available])).toEqual([['Main', 8, 0], ['Branch', 4, 3]]);
    const c = stockOfPart(stock, parts, 'generic-cable-power-4x2.5mm2', bom)!;
    expect(c).toMatchObject({ free: 90, use: 36, available: 54, unit: 'm' });
  });
  it('shows a negative available when the project needs more than the warehouse can give', () => {
    const small = stockFrom([['Part code', 'On hand', 'Reserved'], ['GEN-CONTACTOR-18A', '5', '1']]);
    const s = stockOfPart(small, parts, 'generic-contactor-18a', bom)!;
    expect(s.available).toBe(-5);
    expect(s.rows[0].available).toBe(-5);
    expect(stockIssues(bom, small, parts).shortages).toMatchObject([{ short: 5, unit: 'pcs' }]);
  });
  it('fills the BOM stock columns: on hand, available, short, location', () => {
    const rows = withStock(bom, stock, parts).rows.filter((r) => r.part === 'generic-contactor-18a');
    expect(rows[0].stock).toEqual({ onHand: 14, available: 3, short: 0, location: 'A-1, B-1', unit: 'pcs' });
    const small = stockFrom([['Part code', 'On hand', 'Reserved', 'Location'], ['GEN-CONTACTOR-18A', '5', '1', 'A-1']]);
    expect(withStock(bom, small, parts).rows.find((r) => r.part === 'generic-contactor-18a')?.stock).toMatchObject({ available: -5, short: 5 });
  });
  it('ranks in stock and enough, then in stock but short, then not in stock; ignores parts that fail or lack data', () => {
    const ok = { status: 'ok' as const, reasons: [] };
    const stk = stockFrom([['Part code', 'On hand', 'Reserved'], ['GEN-CONTACTOR-9A', '2', '0'], ['GEN-CONTACTOR-12A', '50', '0'], ['GEN-CONTACTOR-25A', '0', '0']]);
    const cand: { part: PartDef; match: Match }[] = ['generic-contactor-9a', 'generic-contactor-12a', 'generic-contactor-18a', 'generic-contactor-25a', 'generic-contactor-32a'].map((id) => ({ part: part(id), match: ok }));
    cand.push({ part: part('generic-contactor-9a'), match: { status: 'fails', reasons: ['x'] } }, { part: part('generic-contactor-9a'), match: { status: 'data-missing', reasons: ['y'] } });
    const r = rankOptions(cand, stk, parts, { use: new Map() }, () => 3); // 3 needed
    expect(r.map((o) => [o.part.id, o.availability])).toEqual([['generic-contactor-12a', 'enough'], ['generic-contactor-9a', 'short'], ['generic-contactor-18a', 'none'], ['generic-contactor-25a', 'none'], ['generic-contactor-32a', 'none']]);
  });
});

describe('stale stock, refresh and the picking list', () => {
  it('flags a list older than the configured days', () => {
    const s = stockFrom([['Part code', 'On hand'], ['A', '1']]);
    expect(daysBetween('2026-10-24', '2026-11-01')).toBe(8);
    expect(isStale(s, '2026-10-31')).toBe(false);
    expect(isStale(s, '2026-11-01')).toBe(true);
    expect(isStale({ ...s, staleDays: 30 }, '2026-11-01')).toBe(false);
  });
  it('keeps manual links on refresh and records parts that are no longer available', () => {
    const before = { ...stockFrom([['Part code', 'On hand', 'Reserved'], ['ERP-17', '5', '0'], ['GEN-CONTACTOR-12A', '3', '0'], ['GEN-CONTACTOR-9A', '2', '2']]), links: { 'ERP-17': 'generic-contactor-18a' } };
    const after = stockFrom([['Part code', 'On hand', 'Reserved'], ['GEN-CONTACTOR-12A', '3', '0'], ['GEN-CONTACTOR-9A', '2', '0']], before);
    expect(after.links).toEqual({ 'ERP-17': 'generic-contactor-18a' });
    expect(after.lost).toEqual(['ERP-17']); // ERP-17 had free stock and is gone; the 9 A relay had none before
    const b = builder(lib, 't2', 'T');
    const pg = b.addPage('power', { en: 'Power' });
    b.place(pg, 'contactor-3p', 50, 50, { designation: '-KM1' });
    b.parts(pg, '-KM1', [['generic-contactor-18a', 1]]);
    expect(stockIssues(computeBom(b.project, lib), after, parts).lost.map((p) => p.id)).toEqual(['generic-contactor-18a']);
  });
  it('lists what to pick from which warehouse and location, the shortage, and parts missing from the list', () => {
    const b = builder(lib, 't3', 'T');
    const pg = b.addPage('power', { en: 'Power' });
    b.place(pg, 'contactor-3p', 50, 50, { designation: '-KM1' });
    b.place(pg, 'mcb-3p', 100, 50, { designation: '-QF1' });
    b.parts(pg, '-KM1', [['generic-contactor-18a', 6]]);
    b.parts(pg, '-QF1', [['generic-mcb-3p-c16a', 1]]);
    const bom = computeBom(b.project, lib);
    const stock = stockFrom([['Part code', 'On hand', 'Reserved', 'Location', 'Warehouse'], ['GEN-CONTACTOR-18A', '4', '0', 'A-1', 'Main'], ['GEN-CONTACTOR-18A', '3', '1', 'B-1', 'Branch']]);
    const rows = pickingList(bom, stock, parts, 'en');
    expect(rows[0]).toEqual(['Part code', 'Description', 'Manufacturer', 'To pick', 'Unit', 'Warehouse', 'Location', 'On hand', 'Available', 'Remark']);
    expect(rows.slice(1).map((r) => [r[0], r[3], r[5], r[6], r[9]])).toEqual([
      ['GEN-CONTACTOR-18A', '4', 'Main', 'A-1', ''],
      ['GEN-CONTACTOR-18A', '2', 'Branch', 'B-1', ''],
      ['GEN-MCB-3P-C16A', '1', '', '', 'Not in the stock list'],
    ]);
    const less = stockFrom([['Part code', 'On hand', 'Reserved', 'Location', 'Warehouse'], ['GEN-CONTACTOR-18A', '4', '0', 'A-1', 'Main']]);
    expect(pickingList(bom, less, parts, 'en').map((r) => [r[0], r[3], r[9]]).slice(1, 3)).toEqual([['GEN-CONTACTOR-18A', '4', ''], ['GEN-CONTACTOR-18A', '2', 'Short']]);
    expect(pickingList(bom, stock, parts, 'it')[0][3]).toBe('Da prelevare');
  });
});

describe('saved warehouse data', () => {
  it('reads damaged or hand-edited JSON into valid data', () => {
    expect(parseWarehouse(null)).toEqual({ mapping: null, stock: null });
    const w = parseWarehouse({ mapping: { header: true, columns: { code: 'Item', bogus: 'x', onHand: 3 } }, stock: { items: [{ code: 'A', onHand: 'x' }, { code: '' }, 7], stockDate: 'yesterday', links: { A: 'p', B: 4 }, lost: ['A', 1], staleDays: 0 } });
    expect(w.mapping).toEqual({ header: true, columns: { code: 'Item' } });
    expect(w.stock).toMatchObject({ items: [{ code: 'A', onHand: 0, reserved: 0, unit: 'pcs' }], stockDate: '1970-01-01', links: { A: 'p' }, lost: ['A'], staleDays: 7 });
  });
});
