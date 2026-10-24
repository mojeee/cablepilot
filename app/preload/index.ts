// Preload: exposes the typed API from shared/api.ts as window.cablepilot. No Node, file system or
// network access leaks to the renderer.

import { contextBridge, ipcRenderer } from 'electron';
import type { CablePilotApi } from '@shared/api';

const call =
  <T>(channel: string) =>
  (...args: unknown[]): Promise<T> =>
    ipcRenderer.invoke(channel, ...args) as Promise<T>;

const api: CablePilotApi = {
  app: { info: call('app:info') },
  settings: { get: call('settings:get'), set: call('settings:set') },
  files: { open: call('files:open'), save: call('files:save'), exportPdf: call('files:exportPdf') },
  samples: { list: call('samples:list'), read: call('samples:read') },
  autosave: { write: call('autosave:write'), list: call('autosave:list'), read: call('autosave:read'), clear: call('autosave:clear') },
  company: { list: call('company:list'), save: call('company:save'), folder: call('company:folder') },
};

contextBridge.exposeInMainWorld('cablepilot', api);
