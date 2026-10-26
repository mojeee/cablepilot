// The ERP link (M8 part 1, docs/erp-link.md): the pure half. Records pulled from the company's ERP over HTTP (REST
// or OData v4 JSON) become the same rows a stock file gives, so the column mapping, availability and sizing work
// unchanged; the project's needs go back as a documented, versioned reservation request. The main process does the
// network and the credentials (app/main/erp.ts); nothing here touches either.

import type { Bom } from './bom';
import { toCsv } from './export/csv';
import type { Lang } from './i18n';
import type { PartDef } from './library/types';
import type { Project } from './model/types';
import { stockOfPart } from './stock';
import type { StockList } from './stock';

export type ErpAuth = 'none' | 'basic' | 'bearer' | 'header';
export type ErpSendTo = 'none' | 'http' | 'folder';

/** Connection settings without the secret (the password or token stays encrypted in the main process). */
export interface ErpConfig {
  /** The URL that lists items with their stock: an OData entity set or a REST endpoint returning JSON. */
  itemsUrl: string;
  /** Where the array of records is in the response, dotted ("value" for OData; empty: the response is the array). */
  rowsPath: string;
  /** Where the next page's URL is ("@odata.nextLink" for OData; empty: no paging). */
  nextPath: string;
  auth: ErpAuth;
  /** User name for basic authentication. */
  user: string;
  /** Header name for an API key ("X-API-Key"). */
  headerName: string;
  /** Where a reservation request goes: nowhere, an HTTP POST, or files in an outbox folder. */
  sendTo: ErpSendTo;
  reservationUrl: string;
  /** Automatic pull every so many minutes (0: off; otherwise at least MIN_AUTO_MINUTES). */
  autoMinutes: number;
}
export const DEFAULT_ERP_CONFIG: ErpConfig = { itemsUrl: '', rowsPath: 'value', nextPath: '@odata.nextLink', auth: 'none', user: '', headerName: 'X-API-Key', sendTo: 'none', reservationUrl: '', autoMinutes: 0 };
export const MIN_AUTO_MINUTES = 5;
/** Limits of one pull: requests time out, and a runaway paging loop or a huge response stops with a plain error. */
export const ERP_LIMITS = { timeoutMs: 30_000, pages: 50, records: 100_000, bytes: 50 * 1024 * 1024 } as const;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 2000): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Reads untrusted JSON (the saved settings file or the renderer's request) into valid settings. */
export function parseErpConfig(raw: unknown): ErpConfig {
  const o = isObj(raw) ? raw : {};
  const auth = (['none', 'basic', 'bearer', 'header'] as const).find((a) => a === o.auth) ?? 'none';
  const sendTo = (['none', 'http', 'folder'] as const).find((a) => a === o.sendTo) ?? 'none';
  const header = str(o.headerName, 100);
  const minutes = typeof o.autoMinutes === 'number' && Number.isFinite(o.autoMinutes) && o.autoMinutes > 0 ? Math.max(MIN_AUTO_MINUTES, Math.round(o.autoMinutes)) : 0;
  return {
    itemsUrl: str(o.itemsUrl),
    rowsPath: typeof o.rowsPath === 'string' ? str(o.rowsPath, 200) : DEFAULT_ERP_CONFIG.rowsPath,
    nextPath: typeof o.nextPath === 'string' ? str(o.nextPath, 200) : DEFAULT_ERP_CONFIG.nextPath,
    auth,
    user: str(o.user, 200),
    // A header name is a token (RFC 9110, 5.1); anything else would break the request.
    headerName: /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(header) ? header : DEFAULT_ERP_CONFIG.headerName,
    sendTo,
    reservationUrl: str(o.reservationUrl),
    autoMinutes: minutes,
  };
}

/** Whether a URL can be used: http(s) only; "insecure" when it is plain http to a host other than this computer. */
export function checkUrl(url: string): 'ok' | 'bad' | 'insecure' {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return 'bad';
  }
  if (u.protocol === 'https:') return 'ok';
  if (u.protocol !== 'http:') return 'bad';
  return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) ? 'ok' : 'insecure';
}

/** The value at a dotted path. A key that itself contains dots ("@odata.nextLink") is matched whole first. */
export function valueAt(json: unknown, path: string): unknown {
  if (!path) return json;
  if (!isObj(json)) return undefined;
  if (path in json) return json[path];
  const dot = path.indexOf('.');
  return dot < 0 ? undefined : valueAt(json[path.slice(0, dot)], path.slice(dot + 1));
}

/** One page of a pull: its records and the absolute URL of the next page (null on the last one). */
export function readPage(json: unknown, cfg: Pick<ErpConfig, 'rowsPath' | 'nextPath'>, pageUrl: string): { records: unknown[]; next: string | null } | null {
  const records = valueAt(json, cfg.rowsPath);
  if (!Array.isArray(records)) return null;
  const n = cfg.nextPath ? valueAt(json, cfg.nextPath) : undefined;
  let next: string | null = null;
  if (typeof n === 'string' && n) {
    try {
      // OData allows a next link relative to the request URL.
      next = new URL(n, pageUrl).toString();
    } catch {
      next = null;
    }
  }
  return { records, next };
}

/** A record as text cells by field name; nested objects are flattened with dots, arrays and OData annotations are left out. */
export function flatten(rec: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  if (!isObj(rec)) return out;
  for (const [k, v] of Object.entries(rec)) {
    if (k.startsWith('@') || k.includes('@odata.')) continue;
    const name = prefix ? `${prefix}.${k}` : k;
    if (isObj(v)) flatten(v, name, out);
    else if (typeof v === 'string') out[name] = v;
    else if (typeof v === 'number' && Number.isFinite(v)) out[name] = String(v);
    else if (typeof v === 'boolean') out[name] = v ? 'true' : 'false';
    else if (v === null) out[name] = '';
  }
  return out;
}

/** Records as rows with a header row: every field name in the order it is first met, so the column mapping applies. */
export function recordsToRows(records: readonly unknown[]): string[][] {
  const flat = records.map((r) => flatten(r));
  const header: string[] = [];
  const seen = new Set<string>();
  for (const f of flat) for (const k of Object.keys(f)) if (!seen.has(k)) { seen.add(k); header.push(k); }
  return [header, ...flat.map((f) => header.map((h) => f[h] ?? ''))];
}

/** Removes a secret (and its base64 forms, as in a basic-auth header) from text that may reach the user or a log. */
export function scrubSecret(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const s of secrets) {
    if (!s || s.length < 3) continue;
    for (const form of [s, encodeURIComponent(s)]) out = out.split(form).join('[secret]');
  }
  return out;
}

// ---- the reservation request -----------------------------------------------------------------------------------

export const RESERVATION_FORMAT = 'cablepilot-reservation';
export const RESERVATION_VERSION = 1;

export interface ReservationTake {
  warehouse: string;
  location: string;
  qty: number;
}
export interface ReservationLine {
  /** The ERP's item code: the stock item the part is linked to, else the part's own code. */
  code: string;
  description: string;
  manufacturer: string;
  /** What the project needs: quantity per device × units to build (cable in metres). */
  qty: number;
  unit: string;
  /** Full designations of the devices that use it ("project part" lines have none). */
  devices: string[];
  /** Where the quantity is taken from, largest free stock first. */
  from: ReservationTake[];
  /** What the warehouse cannot give (0 when there is enough); a line with no stock item is short by all of it. */
  short: number;
  inStock: boolean;
}
export interface ReservationDoc {
  format: typeof RESERVATION_FORMAT;
  version: typeof RESERVATION_VERSION;
  createdAt: string;
  project: { id: string; name: string; drawingNo: string; orderNo: string; client: string };
  units: number;
  stockDate: string | null;
  lines: ReservationLine[];
}

const round = (x: number): number => Math.round(x * 100) / 100;

/**
 * The reservation request of a project: one line per part the project uses, with the quantity it needs, where the
 * stock would come from and what is short. Lines are sorted by code so the document diffs well.
 */
export function reservation(project: Project, bom: Bom, stock: StockList | null, parts: readonly PartDef[], createdAt: string): ReservationDoc {
  const devices = new Map<string, Set<string>>();
  for (const r of bom.rows) if (r.part && r.designation) (devices.get(r.part) ?? devices.set(r.part, new Set()).get(r.part)!).add(r.designation);
  const lines: ReservationLine[] = [];
  for (const [partId, use] of bom.use) {
    const part = parts.find((p) => p.id === partId);
    if (!part) continue;
    const s = stockOfPart(stock, parts, partId, bom);
    const devs = [...(devices.get(partId) ?? [])].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    if (!s) {
      const qty = round(use.metres > 0 ? use.metres : use.qty);
      if (qty <= 0) continue;
      lines.push({ code: part.code, description: part.description.en, manufacturer: part.manufacturer, qty, unit: use.metres > 0 ? 'm' : 'pcs', devices: devs, from: [], short: qty, inStock: false });
      continue;
    }
    if (s.use <= 0) continue;
    let left = s.use;
    const from: ReservationTake[] = [];
    for (const r of s.rows) {
      const take = round(Math.min(r.free, left));
      if (take <= 0) continue;
      from.push({ warehouse: r.item.warehouse, location: r.item.location, qty: take });
      left = round(left - take);
    }
    const first = s.rows[0].item;
    lines.push({ code: first.code, description: first.description || part.description.en, manufacturer: first.manufacturer || part.manufacturer, qty: round(s.use), unit: s.unit, devices: devs, from, short: round(Math.max(0, left)), inStock: true });
  }
  lines.sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));
  const p = project.properties;
  return {
    format: RESERVATION_FORMAT,
    version: RESERVATION_VERSION,
    createdAt,
    project: { id: project.id, name: project.name, drawingNo: p.drawingNo ?? '', orderNo: p.orderNo ?? '', client: p.client ?? '' },
    units: bom.units,
    stockDate: stock?.stockDate ?? null,
    lines,
  };
}

/** The same request as a CSV table, one row per line and source warehouse (for ERPs that import files). */
export function reservationCsv(doc: ReservationDoc, lang: Lang): string {
  const head = ['project', 'order_no', 'code', 'description', 'manufacturer', 'qty', 'unit', 'warehouse', 'location', 'take', 'short', 'devices'];
  const rows: string[][] = [head];
  for (const l of doc.lines) {
    const takes = l.from.length ? l.from : [{ warehouse: '', location: '', qty: 0 }];
    takes.forEach((f, i) => rows.push([doc.project.name, doc.project.orderNo, l.code, l.description, l.manufacturer, i === 0 ? String(l.qty) : '', l.unit, f.warehouse, f.location, String(f.qty), i === 0 ? String(l.short) : '', l.devices.join(' ')]));
  }
  return toCsv(rows, lang);
}

/** File names of a reservation in an outbox folder: the project and a timestamp, file-system safe. */
export function reservationFileBase(doc: ReservationDoc): string {
  const name = (doc.project.orderNo || doc.project.name || 'project').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'project';
  return `reservation-${name}-${doc.createdAt.replace(/[^0-9]/g, '').slice(0, 14)}`;
}

/** A stock item picked from the warehouse as a project part, when no library part is linked to it (no technical data). */
export function partFromStockItem(item: { code: string; manufacturer: string; description: string }, id: string): PartDef {
  const text = item.description || item.code;
  return {
    id,
    kind: 'part',
    title: { en: text, it: text },
    category: 'accessories',
    code: item.code,
    manufacturer: item.manufacturer,
    description: { en: text, it: text },
    data: {},
    source: 'ERP item',
    verification: 'secondary',
    verifiedFrom: 'Picked from the company warehouse; no technical data',
  };
}
