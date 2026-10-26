// The ERP link (M8 part 1): JSON and OData records as stock rows, paging, settings validation, the reservation
// request, and the main-process service (credentials encrypted and kept out of errors, limits, the outbox folder),
// ending with a round trip against the demo ERP on 127.0.0.1.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeBom } from '@shared/bom';
import { checkUrl, flatten, parseErpConfig, partFromStockItem, readPage, recordsToRows, reservation, reservationCsv, reservationFileBase, scrubSecret, valueAt } from '@shared/erp';
import type { PartDef } from '@shared/library/types';
import { applyMapping, guessMapping, newStockList, type StockList } from '@shared/stock';
import type { SafeStorageLike } from '../app/main/ai/keys';
import { builder } from './support/builder';
import { loadLibrary } from './support/library';

vi.mock('electron', () => ({ dialog: {} }));
const { ErpService } = await import('../app/main/erp');
const { DemoErp, demoItems, DEMO_PAGE_SIZE } = await import('../app/main/erpDemo');
type FetchLike = import('../app/main/erp').FetchLike;

const lib = loadLibrary();
const parts = [...lib.parts.values()];
const part = (id: string) => lib.parts.get(id) as PartDef;
const SAMPLE_STOCK = join(__dirname, '..', 'samples', 'stock-sample.csv');

describe('settings', () => {
  it('fills defaults and cleans what it cannot use', () => {
    expect(parseErpConfig(null)).toMatchObject({ itemsUrl: '', rowsPath: 'value', nextPath: '@odata.nextLink', auth: 'none', sendTo: 'none', autoMinutes: 0 });
    const c = parseErpConfig({ itemsUrl: ' https://erp.example.com/odata/Items ', auth: 'magic', headerName: 'X Key: 1', sendTo: 'folder', autoMinutes: 2, rowsPath: '' });
    expect(c).toMatchObject({ itemsUrl: 'https://erp.example.com/odata/Items', auth: 'none', headerName: 'X-API-Key', sendTo: 'folder', autoMinutes: 5, rowsPath: '' });
    expect(parseErpConfig({ autoMinutes: -3 }).autoMinutes).toBe(0);
  });
  it('accepts https anywhere and plain http only as a warning for another computer', () => {
    expect(checkUrl('https://erp.example.com/a')).toBe('ok');
    expect(checkUrl('http://127.0.0.1:8080/a')).toBe('ok');
    expect(checkUrl('http://localhost/a')).toBe('ok');
    expect(checkUrl('http://erp.local/a')).toBe('insecure');
    expect(checkUrl('ftp://erp.example.com')).toBe('bad');
    expect(checkUrl('erp.example.com')).toBe('bad');
  });
});

describe('records as rows', () => {
  it('finds values by dotted path, a dotted key whole first', () => {
    const j = { value: [1], '@odata.nextLink': 'n', d: { results: [2] } };
    expect(valueAt(j, '@odata.nextLink')).toBe('n');
    expect(valueAt(j, 'd.results')).toEqual([2]);
    expect(valueAt([3], '')).toEqual([3]);
    expect(valueAt(j, 'missing.path')).toBeUndefined();
  });
  it('reads a page and resolves a relative next link against the request', () => {
    const p = readPage({ value: [{ a: 1 }], '@odata.nextLink': 'Items?$skip=25' }, { rowsPath: 'value', nextPath: '@odata.nextLink' }, 'http://127.0.0.1:9/odata/Items');
    expect(p).toEqual({ records: [{ a: 1 }], next: 'http://127.0.0.1:9/odata/Items?$skip=25' });
    expect(readPage({ value: 'x' }, { rowsPath: 'value', nextPath: '' }, 'http://h/')).toBeNull();
    expect(readPage([{ a: 1 }], { rowsPath: '', nextPath: '' }, 'http://h/')).toEqual({ records: [{ a: 1 }], next: null });
  });
  it('flattens nested fields, keeps numbers and booleans as text and drops annotations and arrays', () => {
    expect(flatten({ no: 'A1', inv: { onHand: 4, ok: true }, '@odata.etag': 'W/1', 'pic@odata.mediaReadLink': 'x', tags: ['a'], gone: null })).toEqual({ no: 'A1', 'inv.onHand': '4', 'inv.ok': 'true', gone: '' });
  });
  it('makes a header of every field in first-seen order, so a later field still gets a column', () => {
    expect(recordsToRows([{ a: 1, b: 2 }, { b: 3, c: 'x' }])).toEqual([['a', 'b', 'c'], ['1', '2', ''], ['', '3', 'x']]);
  });
  it('maps the camelCase and nested fields of an ERP API automatically', () => {
    const rows = recordsToRows(demoItems(readFileSync(SAMPLE_STOCK, 'utf8')));
    expect(guessMapping(rows).columns).toEqual({ code: 'itemNo', manufacturer: 'manufacturer', description: 'displayName', onHand: 'inventory.onHand', reserved: 'inventory.reserved', location: 'location', warehouse: 'warehouse', unit: 'unitOfMeasure' });
    // Business Central's item fields: number, displayName, inventory, baseUnitOfMeasureCode.
    expect(guessMapping([['number', 'displayName', 'inventory', 'baseUnitOfMeasureCode']]).columns).toEqual({ code: 'number', description: 'displayName', onHand: 'inventory', unit: 'baseUnitOfMeasureCode' });
  });
  it('scrubs a secret and its URL-encoded form from text', () => {
    expect(scrubSecret('bad p@ss/1 and p%40ss%2F1', ['p@ss/1'])).toBe('bad [secret] and [secret]');
    expect(scrubSecret('ab', ['a'])).toBe('ab');
  });
});

describe('reservation request', () => {
  // The same project as the availability tests: 2 contactors using 1 and 2 pieces, a 12 m cable, 3 units to build.
  const b = builder(lib, 't', 'T');
  const pg = b.addPage('power', { en: 'Power' });
  b.place(pg, 'contactor-3p', 50, 50, { designation: '-KM1' });
  b.place(pg, 'contactor-3p', 100, 50, { designation: '-KM2' });
  b.parts(pg, '-KM1', [['generic-contactor-18a', 1]]);
  b.parts(pg, '-KM2', [['generic-contactor-18a', 2]]);
  b.run({ type: 'part/embed', def: part('generic-cable-power-4x2.5mm2') });
  b.run({ type: 'cable/set', cable: { id: '-W1', kind: 'multicore', part: 'generic-cable-power-4x2.5mm2', length: '12 m' } });
  b.run({ type: 'project/settings', settings: { bom: { ...b.project.settings.bom, units: 3 } } });
  const project = { ...b.project, properties: { ...b.project.properties, orderNo: 'ORD 42/A', client: 'Client' } };
  const bom = computeBom(project, lib);
  const rows = [
    ['Part code', 'On hand', 'Reserved', 'Location', 'Warehouse', 'Unit'],
    ['GEN-CONTACTOR-18A', '10', '2', 'A-1', 'Main', 'pcs'],
    ['GEN-CONTACTOR-18A', '4', '0', 'B-1', 'Branch', 'pcs'],
  ];
  const stock: StockList = newStockList(applyMapping(rows, guessMapping(rows)), null, { stockDate: '2026-10-26', sourceName: 'ERP' });
  const doc = reservation(project, bom, stock, parts, '2026-10-26T10:20:30.000Z');

  it('asks for quantity × units, from the rows with most free stock first, and names the devices', () => {
    expect(doc).toMatchObject({ format: 'cablepilot-reservation', version: 1, units: 3, stockDate: '2026-10-26', project: { orderNo: 'ORD 42/A', client: 'Client', name: 'T' } });
    const k = doc.lines.find((l) => l.code === 'GEN-CONTACTOR-18A')!;
    expect(k).toMatchObject({ qty: 9, unit: 'pcs', short: 0, inStock: true, devices: ['-KM1', '-KM2'] });
    expect(k.from).toEqual([{ warehouse: 'Main', location: 'A-1', qty: 8 }, { warehouse: 'Branch', location: 'B-1', qty: 1 }]);
  });
  it('lists a part with no stock item as short by all of it, in metres for a cable', () => {
    const c = doc.lines.find((l) => l.code === part('generic-cable-power-4x2.5mm2').code)!;
    expect(c).toMatchObject({ qty: 36, unit: 'm', short: 36, inStock: false, from: [] });
  });
  it('says what is short when the warehouse cannot give enough, and sorts lines by code', () => {
    const few = { ...stock, items: stock.items.map((i) => ({ ...i, onHand: 3, reserved: 0 })) };
    const k = reservation(project, bom, few, parts, '2026-10-26T10:20:30.000Z').lines.find((l) => l.code === 'GEN-CONTACTOR-18A')!;
    expect(k.from.reduce((a, f) => a + f.qty, 0)).toBe(6);
    expect(k.short).toBe(3);
    expect(doc.lines.map((l) => l.code)).toEqual([...doc.lines.map((l) => l.code)].sort((a, z) => a.localeCompare(z, 'en', { numeric: true })));
  });
  it('writes a CSV with one row per source warehouse and a file-safe name', () => {
    const csv = reservationCsv(doc, 'en').replace(/^﻿/, '').trim().split('\r\n');
    expect(csv[0]).toBe('project,order_no,code,description,manufacturer,qty,unit,warehouse,location,take,short,devices');
    expect(csv.filter((l) => l.includes('GEN-CONTACTOR-18A'))).toHaveLength(2);
    expect(reservationFileBase(doc)).toBe('reservation-ORD-42-A-20261026102030');
  });
  it('a stock item picked without a library part carries no technical data, so sizing never proposes it', () => {
    const p = partFromStockItem({ code: 'ERP-123', manufacturer: 'M', description: 'Relay' }, 'cp-x');
    expect(p).toMatchObject({ code: 'ERP-123', data: {}, source: 'ERP item', verification: 'secondary' });
  });
});

// ---- the main-process service ----------------------------------------------------------------------------------

const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'cp-erp-')); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const SECRET = 'erp-s3cret-token-0123456789';
const enc: SafeStorageLike = { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from([...Buffer.from(s)].map((x) => x ^ 0x5a)), decryptString: (b) => Buffer.from([...b].map((x) => x ^ 0x5a)).toString() };
const none: SafeStorageLike = { ...enc, isEncryptionAvailable: () => false };

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };
function fakeFetch(answer: (c: Call) => { status?: number; json?: unknown; text?: string; throws?: Error }): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    const c = { url, method: init.method, headers: init.headers, body: init.body };
    calls.push(c);
    const a = answer(c);
    if (a.throws) throw a.throws;
    const text = a.text ?? JSON.stringify(a.json ?? {});
    const status = a.status ?? 200;
    return { ok: status < 400, status, headers: { get: () => null }, text: async () => text };
  };
  return { fetch, calls };
}
const service = (fetch: FetchLike, storage: SafeStorageLike = enc, dataDir = tmp()) => new ErpService({ dataDir, safeStorage: storage, window: () => null, sampleStock: SAMPLE_STOCK, fetch, e2eDir: dataDir });

describe('ERP service', () => {
  it('pulls every page with the credentials and returns rows like a stock file', async () => {
    const { fetch, calls } = fakeFetch((c) => (c.url.includes('skip') ? { json: { value: [{ no: 'B', qty: 2 }] } } : { json: { value: [{ no: 'A', qty: 1 }], '@odata.nextLink': 'Items?skip=1' } }));
    const s = service(fetch);
    expect(s.setConfig({ itemsUrl: 'https://erp.example.com/odata/Items', auth: 'bearer' }).ok).toBe(true);
    expect((await s.pull()).ok).toBe(false); // no token saved yet
    expect(s.setSecret(SECRET).ok).toBe(true);
    const r = await s.pull();
    expect(r.ok && r.value.rows).toEqual([['no', 'qty'], ['A', '1'], ['B', '2']]);
    expect(r.ok && r.value.name).toBe('ERP erp.example.com');
    expect(calls.map((c) => c.url)).toEqual(['https://erp.example.com/odata/Items', 'https://erp.example.com/odata/Items?skip=1']);
    expect(calls[0].headers.authorization).toBe(`Bearer ${SECRET}`);
    const st = s.status();
    expect(st.ok && st.value.hasSecret).toBe(true);
    expect(JSON.stringify(st)).not.toContain(SECRET);
  });
  it('signs in with basic or an API-key header', async () => {
    const { fetch, calls } = fakeFetch(() => ({ json: [] }));
    const s = service(fetch);
    s.setConfig({ itemsUrl: 'https://erp.example.com/i', rowsPath: '', auth: 'basic', user: 'cad' });
    s.setSecret(SECRET);
    await s.test();
    expect(calls[0].headers.authorization).toBe(`Basic ${Buffer.from(`cad:${SECRET}`).toString('base64')}`);
    s.setConfig({ itemsUrl: 'https://erp.example.com/i', rowsPath: '', auth: 'header', headerName: 'X-Api-Key' });
    await s.test();
    expect(calls[1].headers['X-Api-Key']).toBe(SECRET);
  });
  it('keeps the password encrypted on disk, and does not store it without OS encryption', () => {
    const dir = tmp();
    const s = service(fakeFetch(() => ({})).fetch, enc, dir);
    s.setConfig({ itemsUrl: 'https://erp.example.com/i', auth: 'bearer' });
    s.setSecret(SECRET);
    const file = readFileSync(join(dir, 'erp-secret.json'), 'utf8');
    expect(file).not.toContain(SECRET);
    expect(file).not.toContain(Buffer.from(SECRET).toString('base64'));
    expect(readFileSync(join(dir, 'erp.json'), 'utf8')).not.toContain(SECRET);
    const d2 = tmp();
    const r = service(fakeFetch(() => ({})).fetch, none, d2).setSecret(SECRET);
    expect(r.ok).toBe(false);
    expect(existsSync(join(d2, 'erp-secret.json'))).toBe(false);
  });
  it('explains refused credentials, errors and network failures in plain words without the secret', async () => {
    const s = (answer: Parameters<typeof fakeFetch>[0]) => {
      const x = service(fakeFetch(answer).fetch);
      x.setConfig({ itemsUrl: 'https://erp.example.com/i', auth: 'bearer' });
      x.setSecret(SECRET);
      return x;
    };
    const denied = await s(() => ({ status: 401, text: `token ${SECRET} rejected` })).pull();
    expect(!denied.ok && denied.error.code).toBe('erp.auth');
    const server = await s(() => ({ status: 500, text: `boom ${SECRET}` })).pull();
    expect(!server.ok && server.error.code).toBe('erp.http');
    const net = await s(() => ({ throws: new Error(`connect failed for ${SECRET}`) })).pull();
    expect(!net.ok && net.error.code).toBe('erp.network');
    const notJson = await s(() => ({ text: '<html>' })).pull();
    expect(!notJson.ok && notJson.error.code).toBe('erp.json');
    const noRows = await s(() => ({ json: { data: [] } })).pull();
    expect(!noRows.ok && noRows.error.code).toBe('erp.rows');
    for (const r of [denied, server, net]) expect(JSON.stringify(r)).not.toContain(SECRET);
  });
  it('never sends the credentials to another server named as the next page', async () => {
    const { fetch, calls } = fakeFetch(() => ({ json: { value: [], '@odata.nextLink': 'https://evil.example.net/steal' } }));
    const s = service(fetch);
    s.setConfig({ itemsUrl: 'https://erp.example.com/i', auth: 'bearer' });
    s.setSecret(SECRET);
    const r = await s.pull();
    expect(!r.ok && r.error.code).toBe('erp.origin');
    expect(calls).toHaveLength(1);
  });
  it('stops a paging loop at the page limit', async () => {
    const { fetch, calls } = fakeFetch((c) => ({ json: { value: [{ a: 1 }], '@odata.nextLink': `${c.url}x` } }));
    const s = service(fetch);
    s.setConfig({ itemsUrl: 'https://erp.example.com/i' });
    const r = await s.pull();
    expect(!r.ok && r.error.code).toBe('erp.limit');
    expect(calls).toHaveLength(50);
  });
  it('refuses an address that is not http(s)', () => {
    const r = service(fakeFetch(() => ({})).fetch).setConfig({ itemsUrl: 'file:///etc/passwd' });
    expect(!r.ok && r.error.code).toBe('erp.url');
  });
  it('writes the reservation as JSON and CSV into the outbox folder', async () => {
    const dir = tmp();
    const s = service(fakeFetch(() => ({})).fetch, enc, dir);
    s.setConfig({ sendTo: 'folder' });
    expect((await s.send({ format: 'cablepilot-reservation', lines: [] })).ok).toBe(false); // no folder yet
    await s.pickOutbox();
    const doc = { format: 'cablepilot-reservation', version: 1, createdAt: '2026-10-26T10:20:30Z', project: { id: 'p', name: 'Line 4', drawingNo: '', orderNo: '', client: '' }, units: 1, stockDate: null, lines: [{ code: 'A', description: 'a', manufacturer: '', qty: 2, unit: 'pcs', devices: ['-K1'], from: [], short: 2, inStock: false }] };
    const r = await s.send(doc);
    expect(r.ok && r.value).toEqual({ to: 'folder', reference: 'reservation-Line-4-20261026102030.json' });
    expect(readdirSync(join(dir, 'erp-outbox')).sort()).toEqual(['reservation-Line-4-20261026102030.csv', 'reservation-Line-4-20261026102030.json']);
    expect((await s.send({ format: 'something-else' })).ok).toBe(false);
  });
});

describe('demo ERP', () => {
  it('serves the sample stock in pages, takes a reservation and raises reserved', async () => {
    const dir = tmp();
    const s = new ErpService({ dataDir: dir, safeStorage: enc, window: () => null, sampleStock: SAMPLE_STOCK });
    try {
      const st = await s.useDemo();
      expect(st.ok && st.value.demo).toBe(true);
      const items = demoItems(readFileSync(SAMPLE_STOCK, 'utf8'));
      expect(items.length).toBeGreaterThan(DEMO_PAGE_SIZE / 2);
      const pulled = await s.pull();
      expect(pulled.ok && pulled.value.rows.length - 1).toBe(items.length);
      const rows = pulled.ok ? pulled.value.rows : [];
      const stock = newStockList(applyMapping(rows, guessMapping(rows)), null, { stockDate: '2026-10-26', sourceName: 'ERP' });
      const first = stock.items[0];
      const doc = { format: 'cablepilot-reservation', version: 1, createdAt: '2026-10-26T10:00:00Z', project: { id: 'p', name: 'P', drawingNo: '', orderNo: '', client: '' }, units: 1, stockDate: null, lines: [{ code: first.code, description: '', manufacturer: '', qty: 3, unit: 'pcs', devices: [], from: [{ warehouse: first.warehouse, location: first.location, qty: 3 }], short: 0, inStock: true }] };
      const sent = await s.send(doc);
      expect(sent.ok && sent.value).toEqual({ to: 'http', reference: 'RES-0001' });
      const again = await s.pull();
      const rows2 = again.ok ? again.value.rows : [];
      const after = applyMapping(rows2, guessMapping(rows2)).items.find((i) => i.code === first.code && i.location === first.location)!;
      expect(after.reserved).toBe(first.reserved + 3);
      expect(s.demo.received).toHaveLength(1);
    } finally {
      s.demo.stop();
    }
  });
  it('rejects a body that is not a reservation request', async () => {
    const demo = new DemoErp(SAMPLE_STOCK);
    try {
      const url = await demo.start();
      const r = await fetch(`${url}/odata/Reservations`, { method: 'POST', body: '{"lines":[]}' });
      expect(r.status).toBe(400);
      expect((await fetch(`${url}/nothing`)).status).toBe(404);
    } finally {
      demo.stop();
    }
  });
});
