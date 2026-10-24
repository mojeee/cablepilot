// The warehouse (product rule 12, M6 part 1): the company's stock list imported from CSV or XLSX through a saved
// column mapping, linked to library parts (which carry the technical data sizing needs), and the arithmetic
// of availability for a project. Pure: the main process reads the files (app/main), this file works on rows.
//
// Available for this project = on hand - reserved - what this project already uses (BOM quantity, which is
// quantity per device times the units to build; cable in metres from its length times the units).

import type { Bom, BomRow, RowStock } from './bom';
import { dt } from './drawingText';
import type { Lang } from './i18n';
import type { PartDef } from './library/types';
import type { Match } from './sizing';

export const STOCK_FIELDS = ['code', 'manufacturer', 'description', 'onHand', 'reserved', 'location', 'warehouse', 'unit', 'width', 'height', 'depth'] as const;
export type StockField = (typeof STOCK_FIELDS)[number];
/** Fields that must be mapped for an import to make sense. */
export const REQUIRED_FIELDS: readonly StockField[] = ['code', 'onHand'];

/**
 * How the columns of a company's stock file map to our fields, saved per company. With a header row each
 * entry is the header text (so a reordered file still maps); without one it is "#n" (column n, from 1).
 */
export interface ColumnMapping {
  header: boolean;
  columns: Partial<Record<StockField, string>>;
}
export const EMPTY_MAPPING: ColumnMapping = { header: true, columns: {} };

export interface StockItem {
  code: string;
  manufacturer: string;
  description: string;
  onHand: number;
  reserved: number;
  location: string;
  warehouse: string;
  unit: string;
}
export interface StockList {
  items: StockItem[];
  /** ISO date (yyyy-mm-dd) the stock list is from: the file's date, editable. */
  stockDate: string;
  sourceName: string;
  /** Manual links: stock code to library part id. They survive a refresh. */
  links: Record<string, string>;
  /** Stock codes that had free stock in the previous list and have none now (set at import, for the message list). */
  lost: string[];
  /** Days after which the list counts as old. */
  staleDays: number;
}
export const DEFAULT_STALE_DAYS = 7;

// ---- import ------------------------------------------------------------------------------------------

const norm = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const SYNONYMS: Record<StockField, string[]> = {
  code: ['part code', 'code', 'item', 'item code', 'item no', 'part number', 'part no', 'article', 'sku', 'codice', 'codice articolo', 'articolo', 'material'],
  manufacturer: ['manufacturer', 'make', 'brand', 'vendor', 'costruttore', 'produttore', 'marca', 'fornitore'],
  description: ['description', 'name', 'text', 'descrizione', 'denominazione', 'descrizione articolo'],
  onHand: ['on hand', 'qty on hand', 'quantity on hand', 'stock', 'quantity', 'qty', 'giacenza', 'quantita', 'disponibilita', 'q ta', 'esistenza'],
  reserved: ['reserved', 'allocated', 'committed', 'riservato', 'impegnato', 'prenotato'],
  location: ['location', 'bin', 'shelf', 'ubicazione', 'scaffale', 'posizione'],
  warehouse: ['warehouse', 'store', 'depot', 'site', 'magazzino', 'deposito'],
  unit: ['unit', 'uom', 'unit of measure', 'um', 'unita', 'unita di misura'],
  // The body size of an item master (cabinet layout, M6 part 3), in millimetres.
  width: ['width', 'w', 'width mm', 'larghezza', 'larghezza mm', 'breite'],
  height: ['height', 'h', 'height mm', 'altezza', 'altezza mm', 'hohe'],
  depth: ['depth', 'd', 'depth mm', 'profondita', 'profondita mm', 'tiefe'],
};

/** Guesses the mapping from the header row by common English and Italian column names; unmatched fields stay unmapped. */
export function guessMapping(rows: string[][]): ColumnMapping {
  const head = rows[0] ?? [];
  const columns: Partial<Record<StockField, string>> = {};
  const taken = new Set<number>();
  for (const f of STOCK_FIELDS) {
    const i = head.findIndex((h, k) => !taken.has(k) && SYNONYMS[f].includes(norm(h)));
    if (i >= 0) { columns[f] = head[i]; taken.add(i); }
  }
  return { header: true, columns };
}

/** The column index a field maps to in these rows, or -1. */
export function columnIndex(rows: string[][], m: ColumnMapping, f: StockField): number {
  const ref = m.columns[f];
  if (!ref) return -1;
  if (!m.header) {
    const n = /^#(\d+)$/.exec(ref);
    return n ? Number(n[1]) - 1 : -1;
  }
  return (rows[0] ?? []).findIndex((h) => h.trim() === ref.trim());
}

/**
 * A quantity as written by an ERP: "12", "12,5", "1.234,5", "1,234.5". With both separators the last one is the
 * decimal mark; a single separator is a decimal mark ("1,234" is 1.234), unless it repeats ("1.234.567"). NaN when it is not a number.
 */
export function parseQuantity(s: string): number {
  const x = s.trim().replace(/\s/g, '');
  if (!/^-?\d[\d.,]*$/.test(x)) return NaN;
  const c = x.includes(','), d = x.includes('.');
  if (c && d) return Number(x.lastIndexOf(',') > x.lastIndexOf('.') ? x.replace(/\./g, '').replace(',', '.') : x.replace(/,/g, ''));
  const sep = c ? ',' : d ? '.' : '';
  if (!sep) return Number(x);
  return x.split(sep).length > 2 ? Number(x.split(sep).join('')) : Number(x.replace(',', '.'));
}

export interface ImportResult {
  items: StockItem[];
  /** Rows left out, with the row number in the file and why. */
  skipped: { row: number; reason: 'no-code' | 'bad-quantity' }[];
}
/** Applies the mapping to the rows of a file. Rows without a part code, or with an on-hand quantity that is not a number, are skipped and reported. */
export function applyMapping(rows: string[][], m: ColumnMapping): ImportResult {
  const idx = Object.fromEntries(STOCK_FIELDS.map((f) => [f, columnIndex(rows, m, f)])) as Record<StockField, number>;
  const items: StockItem[] = [];
  const skipped: ImportResult['skipped'] = [];
  const cell = (r: string[], f: StockField): string => (idx[f] >= 0 ? (r[idx[f]] ?? '').trim() : '');
  rows.forEach((r, i) => {
    if (m.header && i === 0) return;
    if (r.every((c) => !c.trim())) return;
    const code = cell(r, 'code');
    if (!code) return void skipped.push({ row: i + 1, reason: 'no-code' });
    const onHand = parseQuantity(cell(r, 'onHand'));
    const reservedText = cell(r, 'reserved');
    const reserved = reservedText ? parseQuantity(reservedText) : 0;
    if (!Number.isFinite(onHand) || !Number.isFinite(reserved)) return void skipped.push({ row: i + 1, reason: 'bad-quantity' });
    items.push({ code, manufacturer: cell(r, 'manufacturer'), description: cell(r, 'description'), onHand, reserved, location: cell(r, 'location'), warehouse: cell(r, 'warehouse'), unit: cell(r, 'unit') || 'pcs' });
  });
  return { items, skipped };
}

const key = (code: string): string => code.trim().toLowerCase().replace(/\s+/g, '');

/**
 * Body sizes from an ERP item master through the same column mapping as the stock list (M6 part 3): one entry per
 * row with a part code and a width, height and depth in millimetres. Rows without a code or with a size that is not a
 * positive number are reported, never guessed. The stock quantity is not needed.
 */
export function dimsFromRows(rows: string[][], m: ColumnMapping): { items: { code: string; dims: { w: number; h: number; d: number } }[]; skipped: { row: number; reason: 'no-code' | 'bad-size' }[]; mapped: boolean } {
  const idx = { code: columnIndex(rows, m, 'code'), w: columnIndex(rows, m, 'width'), h: columnIndex(rows, m, 'height'), d: columnIndex(rows, m, 'depth') };
  const items: { code: string; dims: { w: number; h: number; d: number } }[] = [];
  const skipped: { row: number; reason: 'no-code' | 'bad-size' }[] = [];
  if (idx.code < 0 || idx.w < 0 || idx.h < 0 || idx.d < 0) return { items, skipped, mapped: false };
  rows.forEach((r, i) => {
    if (m.header && i === 0) return;
    if (r.every((c) => !c.trim())) return;
    const code = (r[idx.code] ?? '').trim();
    if (!code) return void skipped.push({ row: i + 1, reason: 'no-code' });
    const w = parseQuantity(r[idx.w] ?? ''), h = parseQuantity(r[idx.h] ?? ''), d = parseQuantity(r[idx.d] ?? '');
    if (![w, h, d].every((v) => Number.isFinite(v) && v > 0)) return void skipped.push({ row: i + 1, reason: 'bad-size' });
    items.push({ code, dims: { w, h, d } });
  });
  return { items, skipped, mapped: true };
}
export const codeKey = key;

/**
 * Builds the stock list after an import: manual links carry over from the previous list, and the codes that had free
 * stock before and have none now are recorded as lost (the message list flags the ones the project uses).
 */
export function newStockList(result: ImportResult, prev: StockList | null, o: { stockDate: string; sourceName: string }): StockList {
  const freeNow = new Map<string, number>();
  for (const it of result.items) freeNow.set(key(it.code), (freeNow.get(key(it.code)) ?? 0) + it.onHand - it.reserved);
  const before = new Map<string, string>();
  for (const it of prev?.items ?? []) if (it.onHand - it.reserved > 0 && !before.has(key(it.code))) before.set(key(it.code), it.code);
  const lost = [...before].filter(([k]) => (freeNow.get(k) ?? 0) <= 0).map(([, code]) => code);
  return { items: result.items, stockDate: o.stockDate, sourceName: o.sourceName, links: { ...(prev?.links ?? {}) }, lost, staleDays: prev?.staleDays ?? DEFAULT_STALE_DAYS };
}

// ---- links between stock items and library parts ---------------------------------------------------------

/** The part a stock code stands for: the manual link first, then the same part code. */
export function linkedPart(code: string, parts: readonly PartDef[], links: Record<string, string>): PartDef | undefined {
  const manual = links[code];
  if (manual) return parts.find((p) => p.id === manual);
  const k = key(code);
  return parts.find((p) => key(p.code) === k);
}

const indexMemo = new WeakMap<StockList, { parts: readonly PartDef[]; byPart: Map<string, StockItem[]> }>();
/** Stock items grouped by the library part they are linked to (cached per list and part set). */
export function itemsByPart(stock: StockList, parts: readonly PartDef[]): Map<string, StockItem[]> {
  const hit = indexMemo.get(stock);
  if (hit && hit.parts === parts) return hit.byPart;
  const byPart = new Map<string, StockItem[]>();
  for (const it of stock.items) {
    const p = linkedPart(it.code, parts, stock.links);
    if (p) (byPart.get(p.id) ?? byPart.set(p.id, []).get(p.id)!).push(it);
  }
  indexMemo.set(stock, { parts, byPart });
  return byPart;
}

/** Stock items with no technical data: not linked to a part, or linked to one the sizing engine cannot read. */
export function dataMissing(item: StockItem, parts: readonly PartDef[], links: Record<string, string>): boolean {
  const p = linkedPart(item.code, parts, links);
  return !p || !p.data.Type;
}

export const isMetres = (unit: string): boolean => /^(m|mt|mtr|meter|meters|metre|metres|metri)$/i.test(unit.trim());

// ---- availability ------------------------------------------------------------------------------------

export interface StockRowOf {
  item: StockItem;
  /** On hand minus reserved, at least 0. */
  free: number;
  /** What is left of this row after the project's use is taken from the rows in order of free stock. */
  available: number;
}
export interface PartStock {
  rows: StockRowOf[];
  onHand: number;
  reserved: number;
  free: number;
  /** What this project uses of the part, in the stock unit. */
  use: number;
  /** free minus use: negative when the project needs more than the warehouse can give. */
  available: number;
  unit: string;
}

/** What the project uses of a part in the unit the stock counts it in: metres for cable stocked in metres, else pieces. */
export function useIn(bom: Pick<Bom, 'use'>, partId: string, unit: string): number {
  const u = bom.use.get(partId);
  return !u ? 0 : isMetres(unit) ? u.metres : u.qty;
}

const round = (x: number): number => Math.round(x * 100) / 100;

/**
 * Stock of one part for a project: every linked item with its free quantity, and the project's use taken from the
 * rows in turn (largest free stock first), so each row shows what remains of it. undefined: no stock item is linked.
 */
export function stockOfPart(stock: StockList | null, parts: readonly PartDef[], partId: string, bom: Pick<Bom, 'use'>): PartStock | undefined {
  if (!stock) return undefined;
  const items = itemsByPart(stock, parts).get(partId);
  if (!items?.length) return undefined;
  const unit = items[0].unit;
  const use = useIn(bom, partId, unit);
  const sorted = items.map((item) => ({ item, free: Math.max(0, item.onHand - item.reserved) })).sort((a, b) => b.free - a.free);
  let left = use;
  const rows: StockRowOf[] = sorted.map((r) => {
    const take = Math.min(r.free, left);
    left -= take;
    return { ...r, available: round(r.free - take) };
  });
  if (left > 0) rows[rows.length - 1].available = round(rows[rows.length - 1].available - left);
  const free = sorted.reduce((a, r) => a + r.free, 0);
  return { rows, onHand: items.reduce((a, i) => a + i.onHand, 0), reserved: items.reduce((a, i) => a + i.reserved, 0), free, use, available: round(free - use), unit };
}

/** The BOM rows with their stock columns filled (part level: the same figures on every row of a part). */
export function withStock(bom: Bom, stock: StockList | null, parts: readonly PartDef[]): Bom {
  if (!stock) return bom;
  const rows = bom.rows.map((r): BomRow => {
    if (!r.part) return r;
    const s = stockOfPart(stock, parts, r.part, bom);
    if (!s) return r;
    const rs: RowStock = { onHand: round(s.onHand), available: s.available, short: round(Math.max(0, -s.available)), location: [...new Set(s.rows.map((x) => x.item.location).filter(Boolean))].join(', '), unit: s.unit };
    return { ...r, stock: rs };
  });
  return { ...bom, rows };
}

// ---- suggestions -------------------------------------------------------------------------------------

export type Availability = 'enough' | 'short' | 'none';
export interface Option {
  part: PartDef;
  /** Only matches with status 'ok' are ever suggested. */
  match: Match;
  availability: Availability;
  /** The part's stock with this project's use taken off; undefined when no stock item is linked. */
  stock?: PartStock;
  /** The quantity this choice takes, in the stock unit (units to build, or cable metres). */
  needed: number;
}
const rank: Record<Availability, number> = { enough: 0, short: 1, none: 2 };

/**
 * Ranks parts that meet a requirement: in stock with enough quantity first, then in stock but short, then not in
 * stock. `needed(part, unit)` is the quantity this choice takes, in the stock unit (0 for the part the device already
 * has, which the BOM already counts). Within a rank the order of `candidates` is kept (callers sort by closeness to the
 * requirement). Parts that do not meet the requirement are not in the result.
 */
export function rankOptions(candidates: { part: PartDef; match: Match }[], stock: StockList | null, parts: readonly PartDef[], bom: Pick<Bom, 'use'>, needed: (p: PartDef, unit: string) => number): Option[] {
  const out: Option[] = [];
  for (const c of candidates) {
    if (c.match.status !== 'ok') continue;
    const s = stockOfPart(stock, parts, c.part.id, bom);
    const need = needed(c.part, s?.unit ?? 'pcs');
    const availability: Availability = !s || s.free <= 0 ? 'none' : s.available >= need ? 'enough' : 'short';
    out.push({ part: c.part, match: c.match, availability, ...(s ? { stock: s } : {}), needed: need });
  }
  return out.map((o, i) => ({ o, i })).sort((a, b) => rank[a.o.availability] - rank[b.o.availability] || a.i - b.i).map((x) => x.o);
}

// ---- messages and picking list -------------------------------------------------------------------------

/** Whole days between two ISO dates (b - a). */
export const daysBetween = (a: string, b: string): number => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
export const isStale = (stock: StockList, today: string): boolean => daysBetween(stock.stockDate, today) > stock.staleDays;

export interface StockIssues {
  /** Parts the project uses that have stock items but not enough free stock: how much is missing, in the stock unit. */
  shortages: { part: PartDef; short: number; unit: string }[];
  /** Parts the project uses whose stock was available before the last refresh and is not now. */
  lost: PartDef[];
  /** Parts the project uses that no stock item is linked to. */
  unlisted: number;
}
export function stockIssues(bom: Bom, stock: StockList, parts: readonly PartDef[]): StockIssues {
  const out: StockIssues = { shortages: [], lost: [], unlisted: 0 };
  const lostIds = new Set(stock.lost.map((code) => linkedPart(code, parts, stock.links)?.id));
  for (const id of bom.use.keys()) {
    const part = parts.find((p) => p.id === id);
    if (!part) continue;
    if (lostIds.has(id)) out.lost.push(part);
    const s = stockOfPart(stock, parts, id, bom);
    if (!s) { if (!lostIds.has(id)) out.unlisted++; continue; }
    if (s.available < 0) out.shortages.push({ part, short: round(-s.available), unit: s.unit });
  }
  return out;
}

/**
 * The picking list for the warehouse: every part the project uses with the stock rows it is taken from (largest free
 * stock first), the quantity to pick from each, and a shortage line when the stock does not cover it. Parts that are not
 * in the stock list are listed with that remark. Headers follow the drawing language.
 */
export function pickingList(bom: Bom, stock: StockList | null, parts: readonly PartDef[], lang: Lang): string[][] {
  const rows: string[][] = [[dt(lang, 'bom.code'), dt(lang, 'bom.description'), dt(lang, 'bom.manufacturer'), dt(lang, 'stock.pick'), dt(lang, 'stock.unit'), dt(lang, 'stock.warehouse'), dt(lang, 'bom.location'), dt(lang, 'bom.onHand'), dt(lang, 'bom.available'), dt(lang, 'stock.remark')]];
  const used = [...bom.use.keys()].map((id) => parts.find((p) => p.id === id)).filter((p): p is PartDef => !!p).sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));
  for (const part of used) {
    const s = stockOfPart(stock, parts, part.id, bom);
    const desc = part.description[lang];
    if (!s) {
      rows.push([part.code, desc, part.manufacturer, String(bom.use.get(part.id)!.qty), 'pcs', '', '', '', '', dt(lang, 'stock.notListed')]);
      continue;
    }
    let left = s.use;
    for (const r of s.rows) {
      const take = Math.min(r.free, left);
      left -= take;
      if (take > 0) rows.push([part.code, desc, part.manufacturer, String(round(take)), s.unit, r.item.warehouse, r.item.location, String(round(r.item.onHand)), String(r.available), '']);
    }
    if (left > 0) rows.push([part.code, desc, part.manufacturer, String(round(left)), s.unit, '', '', String(round(s.onHand)), String(s.available), dt(lang, 'stock.short')]);
  }
  return rows;
}

// ---- what the main process keeps per company ----------------------------------------------------------------

/** The company's warehouse state: the saved column mapping and the current stock list (the source path stays in the main process). */
export interface WarehouseData {
  mapping: ColumnMapping | null;
  stock: StockList | null;
}
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Reads untrusted JSON (a hand-edited or damaged file, or the renderer's request) into valid warehouse data. */
export function parseWarehouse(raw: unknown): WarehouseData {
  const o = isObj(raw) ? raw : {};
  const m = isObj(o.mapping) && isObj(o.mapping.columns) ? o.mapping : undefined;
  const mapping: ColumnMapping | null = m ? { header: m.header !== false, columns: Object.fromEntries(STOCK_FIELDS.filter((f) => typeof (m.columns as Record<string, unknown>)[f] === 'string').map((f) => [f, str((m.columns as Record<string, unknown>)[f])])) } : null;
  const s = isObj(o.stock) && Array.isArray(o.stock.items) ? o.stock : undefined;
  const stock: StockList | null = s
    ? {
        items: (s.items as unknown[]).filter(isObj).map((i) => ({ code: str(i.code), manufacturer: str(i.manufacturer), description: str(i.description), onHand: num(i.onHand), reserved: num(i.reserved), location: str(i.location), warehouse: str(i.warehouse), unit: str(i.unit) || 'pcs' })).filter((i) => i.code),
        stockDate: /^\d{4}-\d{2}-\d{2}$/.test(str(s.stockDate)) ? str(s.stockDate) : '1970-01-01',
        sourceName: str(s.sourceName),
        links: isObj(s.links) ? Object.fromEntries(Object.entries(s.links).filter(([, v]) => typeof v === 'string')) as Record<string, string> : {},
        lost: Array.isArray(s.lost) ? s.lost.filter((x): x is string => typeof x === 'string') : [],
        staleDays: typeof s.staleDays === 'number' && s.staleDays >= 1 ? Math.round(s.staleDays) : DEFAULT_STALE_DAYS,
      }
    : null;
  return { mapping, stock };
}
