// The warehouse in the main process (product rule 12): reads the company's stock file (CSV or XLSX) from a file
// or a watched folder, keeps the saved column mapping and the stock list in the app's data folder, and tells the
// renderer when a watched file changes. The renderer never sees a path and never reads the file system; it gets
// rows and asks for a refresh. With CP_E2E_DIR set it reads stock-import.csv or .xlsx from that folder instead of
// asking, so the end-to-end tests run unattended.

import { dialog, type BrowserWindow } from 'electron';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, watch, writeFileSync, type FSWatcher } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import type { WarehouseFile } from '@shared/api';
import { parseCsv } from '@shared/export/csv';
import { readXlsxRows } from '@shared/export/xlsxRead';
import { fail, ok, type Result } from '@shared/result';
import { parseWarehouse, type WarehouseData } from '@shared/stock';

type Source = { kind: 'file' | 'folder'; path: string };
const isStockFile = (name: string): boolean => /\.(csv|txt|xlsx)$/i.test(name) && !name.startsWith('~$') && !name.startsWith('.');
const day = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Decodes text as UTF-8, or as Windows-1252 when it is not valid UTF-8 (many ERP exports are). */
function decodeText(buf: Buffer): string {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(buf) : utf8;
}

export class WarehouseService {
  private readonly file: string;
  private source: Source | null = null;
  private watcher: FSWatcher | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly e2eDir = process.env.CP_E2E_DIR;

  constructor(dataDir: string, private readonly samplesDir: string, private readonly window: () => BrowserWindow | null) {
    this.file = join(dataDir, 'warehouse.json');
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as { source?: Source };
      if (raw.source && (raw.source.kind === 'file' || raw.source.kind === 'folder') && typeof raw.source.path === 'string') this.source = raw.source;
    } catch {
      // No saved warehouse yet.
    }
  }

  private data(): WarehouseData {
    try {
      return parseWarehouse(JSON.parse(readFileSync(this.file, 'utf8')));
    } catch {
      return { mapping: null, stock: null };
    }
  }
  private write(data: WarehouseData): void {
    mkdirSync(join(this.file, '..'), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, `${JSON.stringify({ ...data, source: this.source }, null, 2)}\n`);
    renameSync(tmp, this.file);
  }

  load(): Result<WarehouseData & { source: { kind: 'file' | 'folder'; name: string } | null; watching: boolean }> {
    return ok({ ...this.data(), source: this.source ? { kind: this.source.kind, name: basename(this.source.path) } : null, watching: !!this.watcher });
  }
  save(raw: unknown): Result<null> {
    try {
      this.write(parseWarehouse(raw));
      return ok(null);
    } catch (e) {
      return fail('warehouse.save', `The stock list could not be saved: ${(e as Error).message}`, 'Check that the app\'s data folder is writable.');
    }
  }

  private read(path: string): Result<WarehouseFile> {
    try {
      const buf = readFileSync(path);
      const ext = extname(path).toLowerCase();
      const rows = ext === '.xlsx' ? readXlsxRows(new Uint8Array(buf), (b) => new Uint8Array(inflateRawSync(b))) : parseCsv(decodeText(buf));
      return ok({ name: basename(path), rows, modified: day(statSync(path).mtime) });
    } catch (e) {
      return fail('warehouse.read', `The stock file could not be read: ${(e as Error).message}`, 'Check that it is a CSV or XLSX file that is not open and locked in another program.');
    }
  }
  private newest(folder: string): string | null {
    try {
      const files = readdirSync(folder).filter(isStockFile).map((f) => ({ f: join(folder, f), t: statSync(join(folder, f)).mtimeMs })).sort((a, b) => b.t - a.t);
      return files[0]?.f ?? null;
    } catch {
      return null;
    }
  }
  private resolve(s: Source): string | null {
    return s.kind === 'folder' ? this.newest(s.path) : existsSync(s.path) ? s.path : null;
  }
  private remember(s: Source): void {
    const was = !!this.watcher;
    this.stopWatching();
    this.source = s;
    this.write(this.data());
    if (was) this.startWatching();
  }

  /** Asks for a stock file (CSV or XLSX), remembers it as the source and reads it; null when the user cancels. */
  async pickFile(): Promise<Result<WarehouseFile | null>> {
    let path: string;
    if (this.e2eDir) {
      const p = ['stock-import.csv', 'stock-import.xlsx'].map((n) => join(this.e2eDir as string, n)).find(existsSync);
      if (!p) return fail('warehouse.read', 'No stock file in the test folder.', 'Write stock-import.csv there first.');
      path = p;
    } else {
      const win = this.window();
      const opts = { title: 'Stock list', properties: ['openFile' as const], filters: [{ name: 'Stock list (CSV, XLSX)', extensions: ['csv', 'txt', 'xlsx'] }] };
      const r = await (win ? dialog.showOpenDialog(win, opts) : dialog.showOpenDialog(opts));
      if (r.canceled || !r.filePaths[0]) return ok(null);
      path = r.filePaths[0];
    }
    this.remember({ kind: 'file', path });
    return this.read(path);
  }
  /** Asks for a folder to watch: the newest CSV or XLSX file in it is the stock list. */
  async pickFolder(): Promise<Result<WarehouseFile | null>> {
    let folder: string;
    if (this.e2eDir) folder = this.e2eDir;
    else {
      const win = this.window();
      const opts = { title: 'Folder with the stock list', properties: ['openDirectory' as const] };
      const r = await (win ? dialog.showOpenDialog(win, opts) : dialog.showOpenDialog(opts));
      if (r.canceled || !r.filePaths[0]) return ok(null);
      folder = r.filePaths[0];
    }
    const path = this.newest(folder);
    if (!path) return fail('warehouse.empty', 'The folder has no CSV or XLSX file.', 'Export the stock list from your warehouse system into this folder.');
    this.remember({ kind: 'folder', path: folder });
    return this.read(path);
  }
  /** Reads the remembered source again (for a folder: its newest file); null when there is none. */
  refresh(): Result<WarehouseFile | null> {
    if (!this.source) return ok(null);
    const path = this.resolve(this.source);
    if (!path) return fail('warehouse.gone', 'The stock file is not there any more.', 'Choose the file or folder again.');
    return this.read(path);
  }
  /** The generic sample stock list that ships with the app (fictional quantities, generic part codes). */
  sample(): Result<WarehouseFile> {
    const r = this.read(join(this.samplesDir, 'stock-sample.csv'));
    if (!r.ok) return r;
    const t = new Date();
    return ok({ ...r.value, modified: day(t) });
  }

  private stopWatching(): void {
    this.watcher?.close();
    this.watcher = null;
    clearTimeout(this.timer);
  }
  private startWatching(): boolean {
    if (!this.source) return false;
    try {
      this.watcher = watch(this.source.path, () => {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.window()?.webContents.send('warehouse:changed'), 600);
      });
      return true;
    } catch {
      this.watcher = null;
      return false;
    }
  }
  /** Starts or stops watching the source; returns whether it is watching now. */
  watch(on: boolean): Result<boolean> {
    this.stopWatching();
    return ok(on ? this.startWatching() : false);
  }
}
