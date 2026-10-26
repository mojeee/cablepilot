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
  files: { open: call('files:open'), save: call('files:save'), exportPdf: call('files:exportPdf'), exportText: call('files:exportText'), exportBinary: call('files:exportBinary'), importDxf: call('files:importDxf'), importTags: call('files:importTags') },
  samples: { list: call('samples:list'), read: call('samples:read') },
  autosave: { write: call('autosave:write'), list: call('autosave:list'), read: call('autosave:read'), clear: call('autosave:clear') },
  history: { list: call('history:list'), backup: call('history:backup'), saveVersion: call('history:saveVersion'), read: call('history:read'), remove: call('history:remove') },
  warehouse: {
    load: call('warehouse:load'), save: call('warehouse:save'), pickFile: call('warehouse:pickFile'), pickFolder: call('warehouse:pickFolder'),
    refresh: call('warehouse:refresh'), sample: call('warehouse:sample'), watch: call('warehouse:watch'),
    onChanged: (cb) => {
      const fn = () => cb();
      ipcRenderer.on('warehouse:changed', fn);
      return () => void ipcRenderer.removeListener('warehouse:changed', fn);
    },
  },
  erp: {
    status: call('erp:status'), setConfig: call('erp:setConfig'), setSecret: call('erp:setSecret'), clearSecret: call('erp:clearSecret'),
    pickOutbox: call('erp:pickOutbox'), useDemo: call('erp:useDemo'), test: call('erp:test'), pull: call('erp:pull'), send: call('erp:send'),
  },
  layout: {
    pick: call('layout:pick'), pickFolder: call('layout:pickFolder'), refresh: call('layout:refresh'), folder: call('layout:folder'), watch: call('layout:watch'),
    onChanged: (cb) => {
      const fn = () => cb();
      ipcRenderer.on('layout:changed', fn);
      return () => void ipcRenderer.removeListener('layout:changed', fn);
    },
  },
  license: { status: call('license:status'), activate: call('license:activate'), open: call('license:open') },
  ai: {
    status: call('ai:status'), setSettings: call('ai:setSettings'), setKey: call('ai:setKey'), clearKey: call('ai:clearKey'), testKey: call('ai:testKey'), ask: call('ai:ask'), cancel: call('ai:cancel'),
    onProgress: (cb) => {
      const fn = (_e: unknown, p: unknown) => cb(p as Parameters<typeof cb>[0]);
      ipcRenderer.on('ai:progress', fn);
      return () => void ipcRenderer.removeListener('ai:progress', fn);
    },
  },
  company: { list: call('company:list'), save: call('company:save'), folder: call('company:folder') },
};

contextBridge.exposeInMainWorld('cablepilot', api);
