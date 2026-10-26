// The ERP link in the main process (M8 part 1, docs/erp-link.md): connection settings in <dataDir>/erp.json, the
// password or token encrypted with safeStorage in <dataDir>/erp-secret.json (never stored without OS encryption,
// never sent to the renderer, scrubbed from every error), the pull of items and stock with paging and limits, and
// the reservation request sent by HTTP POST or written to an outbox folder. The renderer gets rows and receipts.

import { dialog, type BrowserWindow } from 'electron';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { ErpStatus, ErpReceipt, ErpTest, WarehouseFile } from '@shared/api';
import { checkUrl, DEFAULT_ERP_CONFIG, ERP_LIMITS, parseErpConfig, readPage, recordsToRows, reservationCsv, reservationFileBase, RESERVATION_FORMAT, scrubSecret, type ErpConfig, type ReservationDoc } from '@shared/erp';
import { t, getLanguage } from '@shared/i18n';
import { fail, ok, type Result } from '@shared/result';
import type { SafeStorageLike } from './ai/keys';
import { DemoErp } from './erpDemo';

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; headers: { get(name: string): string | null }; text(): Promise<string> }>;

interface Saved {
  config: ErpConfig;
  outbox: string | null;
}

const day = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

export interface ErpServiceOptions {
  dataDir: string;
  safeStorage: SafeStorageLike;
  window: () => BrowserWindow | null;
  /** The sample stock list the demo ERP serves. */
  sampleStock: string;
  fetch?: FetchLike;
  /** End-to-end tests: the outbox is this folder, no dialog. */
  e2eDir?: string;
}

export class ErpService {
  private readonly file: string;
  private readonly secretFile: string;
  private readonly fetch: FetchLike;
  readonly demo: DemoErp;

  constructor(private readonly o: ErpServiceOptions) {
    this.file = join(o.dataDir, 'erp.json');
    this.secretFile = join(o.dataDir, 'erp-secret.json');
    this.fetch = o.fetch ?? ((url, init) => fetch(url, init));
    this.demo = new DemoErp(o.sampleStock);
  }

  private saved(): Saved {
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as { config?: unknown; outbox?: unknown };
      return { config: parseErpConfig(raw.config), outbox: typeof raw.outbox === 'string' && raw.outbox ? raw.outbox : null };
    } catch {
      return { config: { ...DEFAULT_ERP_CONFIG }, outbox: null };
    }
  }
  private save(s: Saved): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(s, null, 2)}\n`);
    renameSync(tmp, this.file);
  }

  /** The stored password or token, decrypted; null when none or when it cannot be decrypted. */
  private secret(): string | null {
    try {
      if (!existsSync(this.secretFile) || !this.o.safeStorage.isEncryptionAvailable()) return null;
      const b64 = (JSON.parse(readFileSync(this.secretFile, 'utf8')) as { secret?: unknown }).secret;
      return typeof b64 === 'string' && b64 ? this.o.safeStorage.decryptString(Buffer.from(b64, 'base64')) || null : null;
    } catch {
      return null;
    }
  }

  status(): Result<ErpStatus> {
    const s = this.saved();
    return ok({ config: s.config, hasSecret: this.secret() !== null, secureStorage: this.o.safeStorage.isEncryptionAvailable(), outbox: s.outbox ? basename(s.outbox) : null, demo: this.demo.url !== null && s.config.itemsUrl.startsWith(this.demo.url) });
  }

  setConfig(raw: unknown): Result<ErpStatus> {
    const config = parseErpConfig(raw);
    for (const u of [config.itemsUrl, config.reservationUrl]) if (u && checkUrl(u) === 'bad') return fail('erp.url', t('{url} is not a web address CablePilot can use.', { url: u }), t('Write a full address starting with https:// (or http:// on your own network).'));
    this.save({ ...this.saved(), config });
    return this.status();
  }

  setSecret(secret: string): Result<ErpStatus> {
    const s = secret.trim();
    if (!s) return fail('erp.secret', t('The password or token is empty.'), t('Paste it from your ERP account.'));
    if (s.length > 4000 || /[\r\n]/.test(s)) return fail('erp.secret', t('That does not look like a password or token.'), t('Paste it on one line.'));
    if (!this.o.safeStorage.isEncryptionAvailable()) return fail('erp.unsafe', t('This computer offers no secure storage for the password, so CablePilot did not save it.'), t('On Linux, install and unlock a keyring (GNOME Keyring or KWallet), then try again.'));
    try {
      const enc = this.o.safeStorage.encryptString(s).toString('base64');
      mkdirSync(dirname(this.secretFile), { recursive: true });
      writeFileSync(this.secretFile, `${JSON.stringify({ version: 1, secret: enc })}\n`, { mode: 0o600 });
    } catch {
      return fail('erp.unsafe', t('The password could not be saved securely, so CablePilot did not save it.'), t('Try again; if it repeats, restart the computer to unlock the system keychain.'));
    }
    return this.status();
  }

  clearSecret(): Result<ErpStatus> {
    rmSync(this.secretFile, { force: true });
    return this.status();
  }

  /** Asks for the outbox folder reservation files are written to; null when the user cancels. */
  async pickOutbox(): Promise<Result<ErpStatus | null>> {
    let folder: string;
    if (this.o.e2eDir) {
      folder = join(this.o.e2eDir, 'erp-outbox');
      mkdirSync(folder, { recursive: true });
    } else {
      const win = this.o.window();
      const opts = { title: t('Outbox folder for the ERP'), properties: ['openDirectory' as const, 'createDirectory' as const] };
      const r = await (win ? dialog.showOpenDialog(win, opts) : dialog.showOpenDialog(opts));
      if (r.canceled || !r.filePaths[0]) return ok(null);
      folder = r.filePaths[0];
    }
    this.save({ ...this.saved(), outbox: folder });
    return this.status();
  }

  /** Starts the demo ERP and points the settings at it (no credentials, reservations by HTTP). */
  async useDemo(): Promise<Result<ErpStatus>> {
    const url = await this.demo.start();
    this.save({ ...this.saved(), config: { ...DEFAULT_ERP_CONFIG, itemsUrl: `${url}/odata/Items`, sendTo: 'http', reservationUrl: `${url}/odata/Reservations` } });
    rmSync(this.secretFile, { force: true });
    return this.status();
  }

  private headers(cfg: ErpConfig, secret: string | null): Record<string, string> | null {
    const h: Record<string, string> = { accept: 'application/json' };
    if (cfg.auth === 'none') return h;
    if (!secret) return null;
    if (cfg.auth === 'basic') h.authorization = `Basic ${Buffer.from(`${cfg.user}:${secret}`).toString('base64')}`;
    else if (cfg.auth === 'bearer') h.authorization = `Bearer ${secret}`;
    else h[cfg.headerName] = secret;
    return h;
  }

  /** One request with the time limit, the size limit and plain-language errors; the secret never reaches a message. */
  private async request(url: string, init: { method: string; headers: Record<string, string>; body?: string }, secret: string | null): Promise<Result<{ status: number; text: string }>> {
    const secrets = secret ? [secret, Buffer.from(secret).toString('base64')] : [];
    const host = hostOf(url);
    try {
      const res = await this.fetch(url, { ...init, signal: AbortSignal.timeout(ERP_LIMITS.timeoutMs) });
      const len = Number(res.headers.get('content-length') ?? 0);
      if (len > ERP_LIMITS.bytes) return fail('erp.size', t('The ERP sent more data than CablePilot reads at once (50 MB).'), t('Ask the ERP for fewer fields or filter the items in the URL.'));
      const text = await res.text();
      if (text.length > ERP_LIMITS.bytes) return fail('erp.size', t('The ERP sent more data than CablePilot reads at once (50 MB).'), t('Ask the ERP for fewer fields or filter the items in the URL.'));
      if (res.status === 401 || res.status === 403) return fail('erp.auth', t('The ERP at {host} refused the credentials (HTTP {status}).', { host, status: res.status }), t('Check the authentication, the user name and the password or token in the ERP settings.'));
      if (!res.ok) return fail('erp.http', t('The ERP at {host} answered with an error (HTTP {status}).', { host, status: res.status }), scrubSecret(text.slice(0, 200), secrets) || t('Check the address in the ERP settings.'));
      return ok({ status: res.status, text });
    } catch (e) {
      const name = e instanceof Error ? e.name : '';
      if (name === 'TimeoutError' || name === 'AbortError') return fail('erp.timeout', t('The ERP at {host} did not answer within 30 seconds.', { host }), t('Check that the ERP is running and reachable from this computer.'));
      const detail = scrubSecret(e instanceof Error ? (e.cause instanceof Error ? e.cause.message : e.message) : String(e), secrets);
      return fail('erp.network', t('The ERP at {host} could not be reached: {detail}', { host, detail }), t('Check the address, the network and any proxy or firewall.'));
    }
  }

  /** Pulls items and stock, following the next-page links; `firstPageOnly` for Test connection. */
  private async pullRecords(firstPageOnly: boolean): Promise<Result<{ records: unknown[]; pages: number; cfg: ErpConfig }>> {
    const { config: cfg } = this.saved();
    if (!cfg.itemsUrl) return fail('erp.none', t('No ERP is set up yet.'), t('Write the items address in the ERP settings, or try the demo ERP.'));
    const secret = this.secret();
    const headers = this.headers(cfg, secret);
    if (!headers) return fail('erp.secret', t('The ERP settings ask for a password or token, but none is saved.'), t('Enter it in the ERP settings.'));
    const origin = new URL(cfg.itemsUrl).origin;
    const records: unknown[] = [];
    let url: string | null = cfg.itemsUrl;
    let pages = 0;
    while (url) {
      // Credentials only go to the server they were entered for.
      if (new URL(url).origin !== origin) return fail('erp.origin', t('The ERP sent a next page on another server ({host}).', { host: hostOf(url) }), t('CablePilot only sends your credentials to the server in the settings. Check the ERP\'s paging settings.'));
      const r = await this.request(url, { method: 'GET', headers }, secret);
      if (!r.ok) return r;
      let json: unknown;
      try {
        json = JSON.parse(r.value.text);
      } catch {
        return fail('erp.json', t('The ERP answer is not JSON.'), t('Check that the items address returns JSON (for OData, add $format=json if needed).'));
      }
      const page = readPage(json, cfg, url);
      if (!page) return fail('erp.rows', t('No list of items was found at "{path}" in the ERP answer.', { path: cfg.rowsPath || t('(the whole answer)') }), t('Set "Rows path" in the ERP settings: "value" for OData, empty when the answer is a list.'));
      records.push(...page.records);
      pages++;
      if (records.length > ERP_LIMITS.records) return fail('erp.limit', t('The ERP returned more than 100,000 items.'), t('Filter the items in the address (for OData, a $filter).'));
      if (firstPageOnly) break;
      if (page.next && pages >= ERP_LIMITS.pages) return fail('erp.limit', t('The ERP has more than 50 pages of items.'), t('Ask for bigger pages or filter the items in the address.'));
      url = page.next;
    }
    return ok({ records, pages, cfg });
  }

  async test(): Promise<Result<ErpTest>> {
    const r = await this.pullRecords(true);
    if (!r.ok) return r;
    return ok({ records: r.value.records.length, fields: recordsToRows(r.value.records)[0] });
  }

  /** Items and stock as rows, like a stock file (the renderer maps the columns as for a file). */
  async pull(): Promise<Result<WarehouseFile>> {
    const r = await this.pullRecords(false);
    if (!r.ok) return r;
    return ok({ name: `ERP ${hostOf(r.value.cfg.itemsUrl)}`, rows: recordsToRows(r.value.records), modified: day(new Date()) });
  }

  /** Sends a reservation request the user has seen and confirmed: an HTTP POST of the JSON, or files in the outbox. */
  async send(raw: unknown): Promise<Result<ErpReceipt>> {
    const doc = raw as ReservationDoc;
    if (!doc || typeof doc !== 'object' || doc.format !== RESERVATION_FORMAT || !Array.isArray(doc.lines)) return fail('erp.doc', t('The reservation request is not valid.'), t('Report this on GitHub.'));
    const { config: cfg, outbox } = this.saved();
    const json = `${JSON.stringify(doc, null, 2)}\n`;
    if (cfg.sendTo === 'folder') {
      if (!outbox) return fail('erp.outbox', t('No outbox folder is chosen.'), t('Choose the folder your ERP imports from in the ERP settings.'));
      const base = reservationFileBase(doc);
      try {
        mkdirSync(outbox, { recursive: true });
        // Written under a temporary name and renamed, so an ERP watching the folder never reads half a file.
        for (const [ext, text] of [['csv', reservationCsv(doc, getLanguage())], ['json', json]] as const) {
          writeFileSync(join(outbox, `${base}.${ext}.tmp`), text);
          renameSync(join(outbox, `${base}.${ext}.tmp`), join(outbox, `${base}.${ext}`));
        }
      } catch (e) {
        return fail('erp.outbox', t('The reservation could not be written to the outbox folder: {detail}', { detail: (e as Error).message }), t('Check that the folder exists and is writable.'));
      }
      return ok({ to: 'folder', reference: `${base}.json` });
    }
    if (cfg.sendTo !== 'http' || !cfg.reservationUrl) return fail('erp.sendTo', t('The ERP settings do not say where reservations go.'), t('Choose an HTTP address or an outbox folder under "Send reservations to".'));
    const secret = this.secret();
    const headers = this.headers(cfg, secret);
    if (!headers) return fail('erp.secret', t('The ERP settings ask for a password or token, but none is saved.'), t('Enter it in the ERP settings.'));
    const r = await this.request(cfg.reservationUrl, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: json }, secret);
    if (!r.ok) return r;
    let reference = '';
    try {
      const a = JSON.parse(r.value.text) as Record<string, unknown>;
      const id = a.id ?? a.Id ?? a.number ?? a.reference;
      if (typeof id === 'string' || typeof id === 'number') reference = String(id).slice(0, 100);
    } catch {
      // An answer without JSON is fine: the status said it was accepted.
    }
    return ok({ to: 'http', reference: reference || `HTTP ${r.value.status}` });
  }
}
