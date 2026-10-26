// Project history (M8 part 2): a daily backup of every project and the named versions the user saves, in
// <dataDir>/history/<project id>/ as one JSON file each ({ kind, name, createdAt, text }). A backup is written the
// first time a project is autosaved or saved on a day; the newest 30 daily backups are kept. Named versions stay
// until the user removes them. The renderer gets the list and the text, never a path.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HistoryEntry } from '@shared/api';
import { t } from '@shared/i18n';
import { fail, ok, type Result } from '@shared/result';

export const KEEP_DAILY = 30;
const safeId = (id: string): boolean => /^[A-Za-z0-9._-]{1,120}$/.test(id) && !id.includes('..');
const ENTRY = /^(daily|version)-[A-Za-z0-9-]{1,80}\.json$/;
const day = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface Stored {
  kind: 'daily' | 'version';
  name: string;
  createdAt: string;
  text: string;
}

export class HistoryService {
  private readonly root: string;

  constructor(dataDir: string, private readonly now: () => Date = () => new Date()) {
    this.root = join(dataDir, 'history');
  }

  private dir(projectId: string): string | null {
    return safeId(projectId) ? join(this.root, projectId) : null;
  }
  private write(dir: string, file: string, s: Stored): void {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${file}.tmp`), JSON.stringify(s));
    renameSync(join(dir, `${file}.tmp`), join(dir, file));
  }

  /** Writes today's backup unless there is one already; prunes the oldest beyond KEEP_DAILY. True when it wrote one. */
  backup(projectId: string, name: string, text: string): Result<boolean> {
    const dir = this.dir(projectId);
    if (!dir) return fail('history.id', t('Invalid project id.'), t('Save the project to a file.'));
    const now = this.now();
    const file = `daily-${day(now)}.json`;
    try {
      if (existsSync(join(dir, file))) return ok(false);
      this.write(dir, file, { kind: 'daily', name, createdAt: now.toISOString(), text });
      const daily = readdirSync(dir).filter((f) => /^daily-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
      for (const old of daily.slice(0, Math.max(0, daily.length - KEEP_DAILY))) rmSync(join(dir, old), { force: true });
      return ok(true);
    } catch (e) {
      return fail('history.write', t('The daily backup could not be written: {detail}', { detail: (e as Error).message }), t('Check that the app\'s data folder is writable.'));
    }
  }

  /** Saves a named version of the project as it is now. */
  saveVersion(projectId: string, versionName: string, text: string): Result<HistoryEntry> {
    const dir = this.dir(projectId);
    if (!dir) return fail('history.id', t('Invalid project id.'), t('Save the project to a file.'));
    const name = versionName.trim().slice(0, 200);
    if (!name) return fail('history.name', t('The version needs a name.'), t('Write what this version is, for example "Sent to the customer".'));
    const now = this.now();
    const base = `version-${now.toISOString().replace(/[^0-9]/g, '').slice(0, 17)}`;
    let file = `${base}.json`;
    for (let n = 2; existsSync(join(dir, file)); n++) file = `${base}-${n}.json`;
    try {
      this.write(dir, file, { kind: 'version', name, createdAt: now.toISOString(), text });
    } catch (e) {
      return fail('history.write', t('The version could not be saved: {detail}', { detail: (e as Error).message }), t('Check that the app\'s data folder is writable.'));
    }
    return ok({ id: file, kind: 'version', name, createdAt: now.toISOString() });
  }

  /** Every backup and version of a project, newest first (a damaged file is skipped). */
  list(projectId: string): Result<HistoryEntry[]> {
    const dir = this.dir(projectId);
    if (!dir) return fail('history.id', t('Invalid project id.'), t('Save the project to a file.'));
    if (!existsSync(dir)) return ok([]);
    const out: HistoryEntry[] = [];
    for (const f of readdirSync(dir).filter((x) => ENTRY.test(x))) {
      try {
        const s = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Partial<Stored>;
        if ((s.kind === 'daily' || s.kind === 'version') && typeof s.createdAt === 'string') out.push({ id: f, kind: s.kind, name: typeof s.name === 'string' ? s.name : '', createdAt: s.createdAt });
      } catch {
        // A damaged history file is skipped, never fatal.
      }
    }
    return ok(out.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  /** The project text of one backup or version. */
  read(projectId: string, entryId: string): Result<string> {
    const dir = this.dir(projectId);
    if (!dir || !ENTRY.test(entryId)) return fail('history.id', t('Unknown version.'), t('Open the project history again.'));
    try {
      const s = JSON.parse(readFileSync(join(dir, entryId), 'utf8')) as Partial<Stored>;
      if (typeof s.text !== 'string') throw new Error('no project in the file');
      return ok(s.text);
    } catch (e) {
      return fail('history.read', t('This version could not be read: {detail}', { detail: (e as Error).message }), t('Choose another version or backup.'));
    }
  }

  /** Removes a named version; daily backups go by themselves after 30 days. */
  remove(projectId: string, entryId: string): Result<null> {
    const dir = this.dir(projectId);
    if (!dir || !ENTRY.test(entryId) || !entryId.startsWith('version-')) return fail('history.id', t('Only named versions can be removed.'), t('Daily backups are removed by themselves after 30 days.'));
    rmSync(join(dir, entryId), { force: true });
    return ok(null);
  }
}
