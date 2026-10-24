// Smoke test of the built app: the window opens with the main layout, the language and theme
// switches work, and the renderer has no Node access. Run: npm run test:e2e (builds first).
/// <reference lib="dom" />
import { test } from '@playwright/test';
import { expect, launch } from './app';

test('the built app opens with the main layout and switches language and theme', async () => {
  const { page, close } = await launch();
  try {
    await expect(page.locator('.topbar')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Page navigator' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Symbols and devices' })).toBeVisible();
    await expect(page.getByRole('main', { name: 'Canvas' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Properties' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Messages' })).toBeVisible();
    await expect(page.getByTestId('page-canvas')).toBeVisible();

    // contextIsolation on, nodeIntegration off: only the typed API is exposed.
    const isolated = await page.evaluate(() => ({
      require: typeof (window as unknown as { require?: unknown }).require,
      api: typeof (window as unknown as { cablepilot?: unknown }).cablepilot,
    }));
    expect(isolated).toEqual({ require: 'undefined', api: 'object' });

    await page.getByLabel('Language').selectOption('it');
    await expect(page.getByRole('navigation', { name: 'Navigatore pagine' })).toBeVisible();
    await page.getByLabel('Tema').selectOption('light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  } finally {
    await close();
  }
});
