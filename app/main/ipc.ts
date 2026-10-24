// IPC handlers behind the preload API (shared/api.ts). Every handler returns a Result.

import { app, ipcMain } from 'electron';
import { fail, ok, type Result } from '@shared/result';
import type { AppInfo, CompanyKind } from '@shared/api';
import type { Settings } from '@shared/settings';
import type { FileService } from './files';
import type { SettingsStore } from './settings';

function guard<T>(fn: () => T): Result<T> {
  try {
    return ok(fn());
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return fail('internal', `Something went wrong inside the app: ${detail}`, 'Try again. If it keeps happening, report it on GitHub.');
  }
}
async function guardAsync<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await fn();
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return fail('internal', `Something went wrong inside the app: ${detail}`, 'Try again. If it keeps happening, report it on GitHub.');
  }
}

const isKind = (k: unknown): k is CompanyKind => k === 'symbols' || k === 'templates';

export function registerIpc(deps: { settings: SettingsStore; files: FileService }): void {
  const { files } = deps;
  ipcMain.handle('app:info', (): Result<AppInfo> => guard(() => ({ name: app.getName(), version: app.getVersion(), platform: process.platform })));
  ipcMain.handle('settings:get', (): Result<Settings> => guard(() => deps.settings.get()));
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>): Result<Settings> => guard(() => deps.settings.set(patch ?? {})));
  ipcMain.handle('files:open', () => guardAsync(() => files.open()));
  ipcMain.handle('files:save', (_e, text: string, path: string | null, name: string) => guardAsync(() => files.save(String(text), typeof path === 'string' ? path : null, String(name))));
  ipcMain.handle('files:exportPdf', (_e, bytes: Uint8Array, name: string) => guardAsync(() => files.exportPdf(bytes, String(name))));
  const safe = <T>(fn: () => Result<T>): Result<T> => {
    try {
      return fn();
    } catch (e) {
      return fail('internal', `Something went wrong inside the app: ${e instanceof Error ? e.message : String(e)}`, 'Try again. If it keeps happening, report it on GitHub.');
    }
  };
  ipcMain.handle('samples:list', () => safe(() => files.listSamples()));
  ipcMain.handle('samples:read', (_e, id: string) => safe(() => files.readSample(String(id))));
  ipcMain.handle('autosave:write', (_e, id: string, name: string, path: string | null, text: string) => safe(() => files.writeAutosave(String(id), String(name), typeof path === 'string' ? path : null, String(text))));
  ipcMain.handle('autosave:list', () => safe(() => files.listAutosaves()));
  ipcMain.handle('autosave:read', (_e, id: string) => safe(() => files.readAutosave(String(id))));
  ipcMain.handle('autosave:clear', (_e, id: string) => safe(() => files.clearAutosave(String(id))));
  ipcMain.handle('company:list', (_e, kind: unknown) => safe(() => (isKind(kind) ? files.listCompany(kind) : fail('company.kind', 'Unknown library kind.', 'Report this on GitHub.'))));
  ipcMain.handle('company:save', (_e, kind: unknown, id: string, text: string) => safe(() => (isKind(kind) ? files.saveCompany(kind, String(id), String(text)) : fail('company.kind', 'Unknown library kind.', 'Report this on GitHub.'))));
  ipcMain.handle('company:folder', () => ok(files.companyFolder()));
}
