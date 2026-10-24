// Electron main process entry. Owns the window, settings and files; the renderer is sandboxed and
// talks to it only through the typed API in shared/api.ts (CLAUDE.md, Security).

import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { FileService } from './files';
import { registerIpc } from './ipc';
import { SettingsStore } from './settings';
import { WarehouseService } from './warehouse';
import { FakeProvider } from './ai/fake';

// CP_PROFILE=<dir>: use this folder as the app's data. End-to-end tests start from a clean profile,
// so nothing remembered by an earlier run changes what they see.
if (process.env.CP_PROFILE) app.setPath('userData', process.env.CP_PROFILE);
const settings = new SettingsStore(join(app.getPath('userData'), 'settings.json'));
let mainWindow: BrowserWindow | null = null;
// Sample projects ship in /samples next to the app (packaging copies them in M8).
const files = new FileService(app.getPath('userData'), join(app.getAppPath(), 'samples'), () => mainWindow);
const warehouse = new WarehouseService(app.getPath('userData'), join(app.getAppPath(), 'samples'), () => mainWindow);

function createWindow(): void {
  const dark = settings.get().theme !== 'light';
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: dark ? '#15191e' : '#f3f5f7',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 14, y: 14 } } : { autoHideMenuBar: true }),
    title: 'CablePilot',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow = win;
  win.on('closed', () => {
    mainWindow = null;
  });
  win.once('ready-to-show', () => win.show());
  // Links open in the system browser, https only; the app never opens a second window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(join(__dirname, '../renderer/index.html'));
}

void app.whenReady().then(() => {
  registerIpc({ settings, files, warehouse, ai: new FakeProvider() });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
