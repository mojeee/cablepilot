// The trial and the licence key (LICENSE.md, sections 2 and 3) in the built app.
import { test } from '@playwright/test';
import { expect, launch } from './app';

test('a fresh start shows the 30-day trial in the top bar, and the dialog explains the licence', async () => {
  const { page, close } = await launch();
  try {
    const chip = page.getByTestId('license-chip');
    await expect(chip).toHaveAccessibleName('Trial: 30 days left');
    await chip.click();
    const dialog = page.getByRole('dialog', { name: 'Licence' });
    await expect(dialog).toContainText('You are using the free trial: 30 of 30 days left.');
    await expect(page.getByTestId('license-activate')).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('trial-ended')).toHaveCount(0);
  } finally {
    await close();
  }
});

test('when the trial has ended the app asks for a key, and a wrong key gets a plain message', async () => {
  const { page, close } = await launch({ env: { CP_TRIAL_DAYS: '0' } });
  try {
    const screen = page.getByTestId('trial-ended');
    await expect(screen).toContainText('Your free trial has ended');
    await expect(screen).toContainText('Your projects are safe');
    await expect(page.getByTestId('license-chip')).toHaveAccessibleName('Trial ended');
    await page.getByTestId('license-key').fill('CP1-not-a-real-key.abc');
    await page.getByTestId('license-activate').click();
    await expect(page.getByTestId('license-error')).toContainText('This licence key is not valid.');
    await expect(screen).toBeVisible();
  } finally {
    await close();
  }
});
