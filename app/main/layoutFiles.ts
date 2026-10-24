// Layout exchange files in the main process (M6 part 3): reads a layout file (JSON or CSV), an ERP item
// master (CSV or XLSX) or the newest layout file of a watched folder, and tells the renderer when the
// folder changes. The renderer never sees a path and never reads the file system. With CP_E2E_DIR set it
// reads layout-import.json/.csv and item-master.csv/.xlsx from that folder instead of asking.

import { dialog, type BrowserWindow } from 'electron';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, watch, writeFileSync, type FSWatcher } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import type { LayoutFileData } from '@shared/api';
import { parseCsv } from '@shared/export/csv';
import { readXlsxRows } from '@shared/export/xlsxRead';
import { fail, ok, type Result } from '@shared/result';

const isLayoutFile = (name: string): boolean => /\.(json|csv)$/i.test(name) && !name.startsWith('.') && !name.startsWith('~$');
const decode = (buf: Buffer): string => {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(buf) : utf8;
};

export class LayoutService {
  private readonly file: string;
  private folderPath: string | null = null;
  private watcher: FSWatcher | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly e2eDir = process.env.CP_E2E_DIR;

  constructor(dataDir: string, private readonly window: () => BrowserWindow | null) {
    this.file = join(dataDir, 'layout-exchange.json');
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as { folder?: unknown };
      if (typeof raw.folder === 'string') this.folderPath = raw.folder;
    } catch {
      // No saved folder yet.
    }
  }

  private remember(folder: string | null): void {
    this.folderPath = folder;
    try {
      mkdirSync(join(this.file, '..'), { recursive: true });
      writeFileSync(`${this.file}.tmp`, `${JSON.stringify({ folder })}\n`);
      renameSync(`${this.file}.tmp`, this.file);
    } catch {
      // Not remembering the folder is not fatal.
    }
  }

  private read(path: string): Result<LayoutFileData> {
    try {
      const buf = readFileSync(path);
      const e = extname(path).toLowerCase();
      if (e === '.xlsx') return ok({ name: basename(path), ext: 'xlsx', text: '', rows: readXlsxRows(new Uint8Array(buf), (b) => new Uint8Array(inflateRawSync(b))) });
      const text = decode(buf);
      return ok({ name: basename(path), ext: e === '.json' ? 'json' : 'csv', text, rows: e === '.json' ? [] : parseCsv(text) });
    } catch (err) {
      return fail('layout.read', `The file could not be read: ${(err as Error).message}`, 'Check that it is a JSON, CSV or XLSX file that is not locked by another program.');
    }
  }

  async pick(kind: 'layout' | 'itemMaster'): Promise<Result<LayoutFileData | null>> {
    let path: string;
    if (this.e2eDir) {
      const names = kind === 'layout' ? ['layout-import.json', 'layout-import.csv'] : ['item-master.csv', 'item-master.xlsx'];
      const p = names.map((n) => join(this.e2eDir as string, n)).find(existsSync);
      if (!p) return fail('layout.read', 'No file in the test folder.', `Write ${names[0]} there first.`);
      path = p;
    } else {
      const win = this.window();
      const opts = kind === 'layout'
        ? { title: 'Layout file', properties: ['openFile' as const], filters: [{ name: 'Layout (JSON, CSV)', extensions: ['json', 'csv'] }] }
        : { title: 'ERP item master', properties: ['openFile' as const], filters: [{ name: 'Item master (CSV, XLSX)', extensions: ['csv', 'txt', 'xlsx'] }] };
      const r = await (win ? dialog.showOpenDialog(win, opts) : dialog.showOpenDialog(opts));
      if (r.canceled || !r.filePaths[0]) return ok(null);
      path = r.filePaths[0];
    }
    return this.read(path);
  }

  private newest(folder: string): string | null {
    try {
      const files = readdirSync(folder).filter(isLayoutFile).map((f) => ({ f: join(folder, f), t: statSync(join(folder, f)).mtimeMs })).sort((a, b) => b.t - a.t);
      return files[0]?.f ?? null;
    } catch {
      return null;
    }
  }
  async pickFolder(): Promise<Result<LayoutFileData | null>> {
    let folder: string;
    if (this.e2eDir) folder = this.e2eDir;
    else {
      const win = this.window();
      const opts = { title: 'Folder with layout files', properties: ['openDirectory' as const] };
      const r = await (win ? dialog.showOpenDialog(win, opts) : dialog.showOpenDialog(opts));
      if (r.canceled || !r.filePaths[0]) return ok(null);
      folder = r.filePaths[0];
    }
    const was = !!this.watcher;
    this.stop();
    this.remember(folder);
    if (was) this.start();
    const path = this.newest(folder);
    return path ? this.read(path) : fail('layout.empty', 'The folder has no JSON or CSV layout file.', 'Export the layout from your system into this folder.');
  }
  refresh(): Result<LayoutFileData | null> {
    if (!this.folderPath) return ok(null);
    const path = this.newest(this.folderPath);
    return path ? this.read(path) : fail('layout.empty', 'The folder has no JSON or CSV layout file.', 'Export the layout from your system into this folder.');
  }
  folder(): Result<{ name: string; watching: boolean } | null> {
    return ok(this.folderPath ? { name: basename(this.folderPath), watching: !!this.watcher } : null);
  }
  private stop(): void {
    this.watcher?.close();
    this.watcher = null;
    clearTimeout(this.timer);
  }
  private start(): boolean {
    if (!this.folderPath) return false;
    try {
      this.watcher = watch(this.folderPath, () => {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.window()?.webContents.send('layout:changed'), 600);
      });
      return true;
    } catch {
      this.watcher = null;
      return false;
    }
  }
  watch(on: boolean): Result<boolean> {
    this.stop();
    return ok(on ? this.start() : false);
  }
}
