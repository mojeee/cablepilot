// File services of the main process: project files, PDF export, samples, autosave and the company
// library. The renderer never touches the file system; it asks through shared/api.ts.

import { dialog, type BrowserWindow } from 'electron';
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { AutosaveInfo, CompanyKind, OpenedFile, SampleInfo, SavedFile } from '@shared/api';
import { fail, ok, type Result } from '@shared/result';
import { validateLibraryFile } from '../../scripts/library-validate.mjs';

/** Writes through a temporary file, so a crash never leaves a half-written project. */
function writeAtomic(path: string, data: string | Uint8Array): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

const safeId = (id: string): boolean => /^[A-Za-z0-9._-]{1,120}$/.test(id) && !id.includes('..');

export class FileService {
  /**
   * CP_E2E_DIR: when set, save and export write into that folder without a dialog, so the end-to-end
   * tests can run unattended. Never set in normal use.
   */
  private readonly e2eDir = process.env.CP_E2E_DIR;

  constructor(
    private readonly dataDir: string,
    private readonly samplesDir: string,
    private readonly window: () => BrowserWindow | null,
  ) {
    for (const d of ['autosave', 'company-library/symbols', 'company-library/templates', 'company-library/macros', 'company-library/parts']) mkdirSync(join(dataDir, d), { recursive: true });
  }

  async open(): Promise<Result<OpenedFile | null>> {
    const win = this.window();
    const r = await (win ? dialog.showOpenDialog(win, this.openOpts()) : dialog.showOpenDialog(this.openOpts()));
    const path = r.filePaths[0];
    if (r.canceled || !path) return ok(null);
    return this.readProject(path);
  }
  private openOpts() {
    return { title: 'Open project', properties: ['openFile' as const], filters: [{ name: 'CablePilot project', extensions: ['json'] }] };
  }
  private readProject(path: string): Result<OpenedFile> {
    try {
      return ok({ text: readFileSync(path, 'utf8'), path, name: basename(path) });
    } catch (e) {
      return fail('file.read', `The file could not be read: ${(e as Error).message}`, 'Check that the file still exists and that you may read it.');
    }
  }

  async save(text: string, path: string | null, suggestedName: string): Promise<Result<SavedFile | null>> {
    let target = path;
    if (this.e2eDir) target = join(this.e2eDir, basename(path ?? suggestedName));
    else if (!target) {
      const win = this.window();
      const opts = { title: 'Save project', defaultPath: suggestedName, filters: [{ name: 'CablePilot project', extensions: ['json'] }] };
      const r = await (win ? dialog.showSaveDialog(win, opts) : dialog.showSaveDialog(opts));
      if (r.canceled || !r.filePath) return ok(null);
      target = r.filePath;
    }
    return this.write(target, text);
  }

  async exportText(text: string, suggestedName: string): Promise<Result<SavedFile | null>> {
    let target: string;
    if (this.e2eDir) target = join(this.e2eDir, basename(suggestedName));
    else {
      const win = this.window();
      const opts = { title: 'Export', defaultPath: suggestedName, filters: [{ name: 'CSV', extensions: ['csv'] }] };
      const r = await (win ? dialog.showSaveDialog(win, opts) : dialog.showSaveDialog(opts));
      if (r.canceled || !r.filePath) return ok(null);
      target = r.filePath;
    }
    return this.write(target, text);
  }

  async exportPdf(bytes: Uint8Array, suggestedName: string): Promise<Result<SavedFile | null>> {
    let target: string;
    if (this.e2eDir) target = join(this.e2eDir, basename(suggestedName));
    else {
      const win = this.window();
      const opts = { title: 'Export PDF', defaultPath: suggestedName, filters: [{ name: 'PDF', extensions: ['pdf'] }] };
      const r = await (win ? dialog.showSaveDialog(win, opts) : dialog.showSaveDialog(opts));
      if (r.canceled || !r.filePath) return ok(null);
      target = r.filePath;
    }
    return this.write(target, bytes);
  }

  private write(path: string, data: string | Uint8Array): Result<SavedFile> {
    try {
      writeAtomic(path, data);
      return ok({ path, name: basename(path) });
    } catch (e) {
      return fail('file.write', `The file could not be saved: ${(e as Error).message}`, 'Check that the folder exists and that you may write to it, or choose another place.');
    }
  }

  // ---- samples ----
  listSamples(): Result<SampleInfo[]> {
    try {
      const out: SampleInfo[] = [];
      for (const f of readdirSync(this.samplesDir).sort()) {
        if (!f.endsWith('.cablepilot.json')) continue;
        const d = JSON.parse(readFileSync(join(this.samplesDir, f), 'utf8')) as { name?: string };
        out.push({ id: f.replace(/\.cablepilot\.json$/, ''), name: d.name ?? f });
      }
      return ok(out);
    } catch (e) {
      return fail('samples.list', `The sample projects could not be listed: ${(e as Error).message}`, 'Reinstall CablePilot.');
    }
  }
  readSample(id: string): Result<string> {
    if (!safeId(id)) return fail('samples.id', 'Unknown sample project.', 'Pick one from the list.');
    try {
      return ok(readFileSync(join(this.samplesDir, `${id}.cablepilot.json`), 'utf8'));
    } catch (e) {
      return fail('samples.read', `The sample could not be read: ${(e as Error).message}`, 'Reinstall CablePilot.');
    }
  }

  // ---- autosave and crash recovery ----
  private autosavePath(id: string): string {
    return join(this.dataDir, 'autosave', `${id}.json`);
  }
  writeAutosave(id: string, name: string, path: string | null, text: string): Result<null> {
    if (!safeId(id)) return fail('autosave.id', 'Invalid project id.', 'Save the project to a file.');
    try {
      writeAtomic(this.autosavePath(id), JSON.stringify({ id, name, path, savedAt: new Date().toISOString(), text }));
      return ok(null);
    } catch (e) {
      return fail('autosave.write', `Autosave failed: ${(e as Error).message}`, 'Save the project to a file yourself.');
    }
  }
  listAutosaves(): Result<AutosaveInfo[]> {
    const dir = join(this.dataDir, 'autosave');
    const out: AutosaveInfo[] = [];
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const d = JSON.parse(readFileSync(join(dir, f), 'utf8')) as AutosaveInfo;
        out.push({ id: d.id, name: d.name, path: d.path ?? null, savedAt: d.savedAt });
      } catch {
        // A damaged autosave is skipped, never fatal.
      }
    }
    return ok(out.sort((a, b) => b.savedAt.localeCompare(a.savedAt)));
  }
  readAutosave(id: string): Result<string> {
    if (!safeId(id)) return fail('autosave.id', 'Invalid project id.', '');
    try {
      return ok((JSON.parse(readFileSync(this.autosavePath(id), 'utf8')) as { text: string }).text);
    } catch (e) {
      return fail('autosave.read', `The autosaved copy could not be read: ${(e as Error).message}`, 'Discard it and open the project file.');
    }
  }
  clearAutosave(id: string): Result<null> {
    if (safeId(id)) rmSync(this.autosavePath(id), { force: true });
    return ok(null);
  }

  // ---- company library ----
  private companyDir(kind: CompanyKind): string {
    return join(this.dataDir, 'company-library', kind);
  }
  listCompany(kind: CompanyKind): Result<{ id: string; text: string }[]> {
    const dir = this.companyDir(kind);
    if (!existsSync(dir)) return ok([]);
    return ok(readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => ({ id: f.replace(/\.json$/, ''), text: readFileSync(join(dir, f), 'utf8') })));
  }
  saveCompany(kind: CompanyKind, id: string, text: string): Result<SavedFile> {
    if (!safeId(id)) return fail('company.id', 'The id may only contain letters, digits, dots, dashes and underscores.', 'Rename the symbol and try again.');
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return fail('company.json', 'The library file is not valid JSON.', 'Report this on GitHub.');
    }
    const problems = validateLibraryFile(data, id);
    if (problems.length) return fail('company.invalid', `The library file is not valid: ${problems.slice(0, 3).join('; ')}.`, 'Fix the listed fields and save again.');
    return this.write(join(this.companyDir(kind), `${id}.json`), text);
  }
  companyFolder(): string {
    return join(this.dataDir, 'company-library');
  }
}
