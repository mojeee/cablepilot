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
};

contextBridge.exposeInMainWorld('cablepilot', api);
