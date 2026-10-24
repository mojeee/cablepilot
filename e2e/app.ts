// Starts the built app (out/) with a fresh profile.
import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = join(__dirname, '..');

export interface App {
  app: ElectronApplication;
  page: Page;
  close(): Promise<void>;
}

export async function launch(opts: { env?: Record<string, string> } = {}): Promise<App> {
  const profile = mkdtempSync(join(tmpdir(), 'cp-e2e-'));
  const app = await electron.launch({
    args: ['.', '--no-sandbox'],
    cwd: root,
    env: { ...process.env, CP_PROFILE: profile, ...opts.env },
  });
  const page = await app.firstWindow();
  await page.waitForSelector('.topbar', { timeout: 60_000 });
  return { app, page, close: () => app.close() };
}

export { expect };
