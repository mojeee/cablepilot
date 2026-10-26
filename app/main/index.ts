// Electron main process entry. Owns the window, settings and files; the renderer is sandboxed and
// talks to it only through the typed API in shared/api.ts (CLAUDE.md, Security).

import { app, BrowserWindow, safeStorage, shell } from 'electron';
import { join } from 'node:path';
import { FileService } from './files';
import { registerIpc } from './ipc';
import { SettingsStore } from './settings';
import { WarehouseService } from './warehouse';
import { ErpService } from './erp';
import { HistoryService } from './history';
import { LayoutService } from './layoutFiles';
import { registerAiIpc } from './ai/ipc';
import { KeyStore, type SafeStorageLike } from './ai/keys';
import { useFake } from './ai/providers';
import { LicenseService } from './license/license';
import { TRIAL_DAYS } from '@shared/brand';

// CP_PROFILE=<dir>: use this folder as the app's data. End-to-end tests start from a clean profile,
// so nothing remembered by an earlier run changes what they see.
if (process.env.CP_PROFILE) app.setPath('userData', process.env.CP_PROFILE);
const settings = new SettingsStore(join(app.getPath('userData'), 'settings.json'));
let mainWindow: BrowserWindow | null = null;
// Sample projects ship in /samples next to the app (packaging copies them in M8).
const files = new FileService(app.getPath('userData'), join(app.getAppPath(), 'samples'), () => mainWindow);
const warehouse = new WarehouseService(app.getPath('userData'), join(app.getAppPath(), 'samples'), () => mainWindow);
const layout = new LayoutService(app.getPath('userData'), () => mainWindow);
const history = new HistoryService(app.getPath('userData'));
// The trial length can be changed for tests (CP_TRIAL_DAYS=0 shows the end of the trial), never in an installed app.
const trialDays = !app.isPackaged && process.env.CP_TRIAL_DAYS !== undefined ? Number(process.env.CP_TRIAL_DAYS) : TRIAL_DAYS;
const license = new LicenseService(app.getPath('userData'), trialDays);

// Keys: encrypted with the OS (safeStorage) and never sent to the renderer. With CP_AI_FAKE=1 (tests, the demo) the
// answers come from a scripted stand-in and the keys are only base64-encoded, so no OS keychain is needed; a real
// provider is never called in that mode.
const fakeStorage: SafeStorageLike = { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from(s, 'utf8'), decryptString: (b) => b.toString('utf8') };
const keys = new KeyStore({ dataDir: app.getPath('userData'), safeStorage: useFake() ? fakeStorage : safeStorage, ...(app.isPackaged ? {} : { env: process.env, devEnvFile: join(app.getAppPath(), '.env.local') }) });

// The ERP link (M8 part 1): its password or token is encrypted the same way as the AI keys.
const erp = new ErpService({ dataDir: app.getPath('userData'), safeStorage: useFake() ? fakeStorage : safeStorage, window: () => mainWindow, sampleStock: join(app.getAppPath(), 'samples', 'stock-sample.csv'), ...(process.env.CP_E2E_DIR ? { e2eDir: process.env.CP_E2E_DIR } : {}) });

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
  registerIpc({ settings, files, warehouse, layout, erp, history, license });
  registerAiIpc({ settings, keys, warehouse });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => erp.demo.stop());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
