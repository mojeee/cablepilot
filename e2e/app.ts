// Starts the built app (out/) with a fresh profile and an output folder for saved files.
import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = join(__dirname, '..');

export interface App {
  app: ElectronApplication;
  page: Page;
  /** The app's data folder (settings, autosave, company library). */
  profile: string;
  /** Where Save and Export PDF write (CP_E2E_DIR: no dialogs in tests). */
  out: string;
  close(): Promise<void>;
}

export async function launch(opts: { profile?: string; env?: Record<string, string>; recordVideo?: { dir: string; size: { width: number; height: number } } } = {}): Promise<App> {
  const profile = opts.profile ?? mkdtempSync(join(tmpdir(), 'cp-e2e-'));
  const out = mkdtempSync(join(tmpdir(), 'cp-e2e-out-'));
  const app = await electron.launch({
    args: ['.', '--no-sandbox'],
    cwd: root,
    env: { ...process.env, CP_PROFILE: profile, CP_E2E_DIR: out, ...opts.env },
    ...(opts.recordVideo ? { recordVideo: opts.recordVideo } : {}),
  });
  const page = await app.firstWindow();
  await page.waitForSelector('.topbar', { timeout: 60_000 });
  return { app, page, profile, out, close: () => app.close() };
}

export { expect };
