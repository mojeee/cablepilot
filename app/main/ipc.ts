// IPC handlers behind the preload API (shared/api.ts). Every handler returns a Result.

import { app, ipcMain } from 'electron';
import { fail, ok, type Result } from '@shared/result';
import type { AppInfo } from '@shared/api';
import type { Settings } from '@shared/settings';
import type { SettingsStore } from './settings';

function guard<T>(fn: () => T): Result<T> {
  try {
    return ok(fn());
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return fail('internal', `Something went wrong inside the app: ${detail}`, 'Try again. If it keeps happening, report it on GitHub.');
  }
}

export function registerIpc(deps: { settings: SettingsStore }): void {
  ipcMain.handle('app:info', (): Result<AppInfo> => guard(() => ({ name: app.getName(), version: app.getVersion(), platform: process.platform })));
  ipcMain.handle('settings:get', (): Result<Settings> => guard(() => deps.settings.get()));
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>): Result<Settings> => guard(() => deps.settings.set(patch ?? {})));
}
