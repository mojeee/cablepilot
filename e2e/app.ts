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
  // Quit the way a user does (the app closes its window and exits in a fraction of a second) and wait for the process;
  // Playwright's own app.close() sometimes waits 8-19 s, and leaves recordings with a long, varying tail. It stays as the fallback, and for recordings (their timing is anchored by a sync frame, e2e/recorder.ts).
  const close = async () => {
    const proc = app.process();
    if (proc.exitCode !== null) return;
    // A recording must be finished by Playwright itself, or the video file ends early.
    if (opts.recordVideo) return app.close();
    const exited = new Promise<void>((resolve) => proc.once('exit', () => resolve()));
    await app.evaluate(({ app: a }) => { setTimeout(() => a.quit(), 10); }).catch(() => undefined);
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 10_000))]);
    if (proc.exitCode === null) await app.close();
  };
  return { app, page, profile, out, close };
}

export { expect };

/** Opens a ribbon tab (home, insert, wires, reports, plc, layout, view): the tool buttons live on the active tab. */
export async function tab(page: Page, id: string): Promise<void> {
  await page.getByTestId(`tab-${id}`).click();
}
