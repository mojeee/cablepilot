// End-to-end tests of the AI assistant (M7) with the scripted stand-in (CP_AI_FAKE=1: no network, no model): enter a
// key in the settings, ask through the chat and the command line, preview, accept, undo; a request that cannot be built
// changes nothing; the key never reaches the renderer; the Italian UI.
/// <reference lib="dom" />
import { test } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, launch } from './app';

interface El { kind: string; designation?: string; number?: string }
interface Saved { pages: { type: string; elements: El[] }[] }
const saved = (out: string): Saved => JSON.parse(readFileSync(join(out, readdirSync(out).find((f) => f.endsWith('.cablepilot.json'))!), 'utf8'));
const symbols = (s: Saved): string[] => s.pages.flatMap((p) => p.elements).filter((e) => e.kind === 'symbol' && e.designation).map((e) => e.designation as string);
const FAKE_KEY = 'sk-test-fake-key-0123456789abcdef';

async function cmd(page: Page, text: string): Promise<void> {
  const input = page.getByTestId('cmd-input');
  await input.click();
  await input.fill(text);
  await input.press('Enter');
}

test('settings: a key is entered, tested and removed; it never comes back to the renderer', async () => {
  const { page, close } = await launch({ env: { CP_AI_FAKE: '1' } });
  try {
    await expect(page.getByTestId('chat-note')).toContainText('Built-in');
    await page.getByTestId('ai-settings-open').click();
    const dlg = page.getByRole('dialog', { name: 'AI settings' });
    await expect(dlg.getByTestId('ai-provider')).toHaveValue('anthropic');
    await expect(dlg.getByTestId('ai-model')).toHaveValue('claude-sonnet-5-5');
    await expect(dlg.getByTestId('ai-key-state')).toContainText('No key is stored for Claude');
    await expect(dlg.getByTestId('ai-key-test')).toBeDisabled();
    await dlg.getByTestId('ai-provider').selectOption('openai');
    await expect(dlg.getByTestId('ai-model')).toHaveValue('gpt-5.1');
    await dlg.getByTestId('ai-model').selectOption('gpt-5.1-mini');
    await dlg.getByTestId('ai-key').fill(FAKE_KEY);
    await dlg.getByTestId('ai-key-save').click();
    await expect(dlg.getByTestId('ai-msg')).toContainText('Key saved');
    await expect(dlg.getByTestId('ai-key')).toHaveValue('');
    await expect(dlg.getByTestId('ai-key-state')).toContainText('A key is stored');
    await dlg.getByTestId('ai-key-test').click();
    await expect(dlg.getByTestId('ai-msg')).toContainText('The key works with gpt-5.1-mini');
    // Nothing on the renderer side holds the key: the API has no way to read it, and no page text shows it.
    expect(await page.evaluate(() => Object.keys((window as unknown as { cablepilot: { ai: object } }).cablepilot.ai).sort())).toEqual(['ask', 'cancel', 'clearKey', 'onProgress', 'setKey', 'setSettings', 'status', 'testKey']);
    expect(JSON.stringify(await page.evaluate(() => (window as unknown as { cablepilot: { ai: { status(): Promise<unknown> } } }).cablepilot.ai.status()))).not.toContain(FAKE_KEY);
    expect(await page.evaluate(() => document.body.innerText)).not.toContain(FAKE_KEY);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('chat-note')).toContainText('Assistant: OpenAI, model gpt-5.1-mini');
    await expect(page.getByTestId('ai-status')).toContainText('OpenAI');
    // The choice survives a reload of the status; removing the key goes back to the built-in assistant.
    await page.getByTestId('ai-settings-open').click();
    await page.getByTestId('ai-key-remove').click();
    await expect(page.getByTestId('ai-key-state')).toContainText('No key is stored for OpenAI');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('chat-note')).toContainText('Built-in assistant');
  } finally {
    await close();
  }
});

test('the assistant uses its tools through the chat and the command line; proposals are previews, accepted as one undo step', async () => {
  const { page, out, close } = await launch({ env: { CP_AI_FAKE: '1' } });
  try {
    const chat = page.getByTestId('panel-chat');
    await page.getByTestId('ai-settings-open').click();
    await page.getByTestId('ai-key').fill(FAKE_KEY);
    await page.getByTestId('ai-key-save').click();
    await expect(page.getByTestId('ai-key-state')).toContainText('A key is stored');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('chat-note')).toContainText('Assistant: Claude');
    await expect(page.getByTestId('chat-note')).toContainText('scripted');

    // The star-delta starter, in the chat: tool calls, sourced claims, a preview with ratings from the sizing engine.
    await chat.getByTestId('chat-input').fill('add a star-delta starter for a 7.5 kW motor on page 1');
    await chat.getByTestId('chat-send').click();
    await expect(chat.getByTestId('chat-proposal')).toBeVisible();
    await expect(chat.getByTestId('chat-assistant').last()).toContainText('suggestions to confirm');
    await expect(chat.getByTestId('chat-toollog')).toContainText('What the assistant looked at (3)');
    await expect(chat.getByTestId('chat-proposal')).toContainText('7.5 kW');
    await expect(chat.getByTestId('source-library').first()).toBeVisible();
    await expect(chat.getByTestId('source-standard').first()).toBeVisible();
    await expect(chat.getByTestId('source-suggestion').first()).toBeVisible();
    // Still a preview: the saved file has no devices yet.
    await page.getByTestId('save').click();
    expect(symbols(saved(out))).toEqual([]);
    await chat.getByTestId('chat-accept').click();
    await expect(chat.getByTestId('chat-outcome')).toContainText('Accepted');
    await page.getByTestId('save').click();
    expect(symbols(saved(out)).length).toBe(6);
    // One undo step takes the whole starter away again.
    await page.keyboard.press('Control+z');
    await page.getByTestId('save').click();
    expect(symbols(saved(out))).toEqual([]);

    // The command line: anything that is not a command goes to the assistant; reject changes nothing.
    await cmd(page, 'add a star-delta starter for a 7.5 kW motor on page 1');
    await expect(chat.getByTestId('chat-proposal').last()).toBeVisible();
    await chat.getByTestId('chat-reject').click();
    await expect(chat.getByTestId('chat-outcome').last()).toContainText('Rejected');
    await page.getByTestId('save').click();
    expect(symbols(saved(out))).toEqual([]);

    // A question: it runs the check and quotes what it found, with no proposal.
    await cmd(page, 'why does the check say Q3 is too small?');
    await expect(chat.getByTestId('chat-assistant').last()).toContainText('no finding');
    await expect(chat.getByTestId('chat-assistant').last().getByTestId('chat-proposal')).toHaveCount(0);

    // A request that cannot be built is answered in plain words and changes nothing.
    await chat.getByTestId('chat-input').fill('make me a PCB layout');
    await chat.getByTestId('chat-send').click();
    await expect(chat.getByTestId('chat-assistant').last()).toContainText('I cannot do that');
    await page.getByTestId('save').click();
    expect(symbols(saved(out))).toEqual([]);

    // A provider failure is explained in plain words, and the app stays usable.
    await chat.getByTestId('chat-input').fill('simulate a failure');
    await chat.getByTestId('chat-send').click();
    await expect(chat.getByTestId('chat-assistant').last()).toContainText('Claude returned an error');
    await expect(chat.getByTestId('chat-send')).toBeDisabled();
  } finally {
    await close();
  }
});

test('the assistant answers in Italian and its settings are translated', async () => {
  const { page, close } = await launch({ env: { CP_AI_FAKE: '1' } });
  try {
    await page.getByRole('combobox', { name: 'Language' }).selectOption('it');
    await page.getByTestId('ai-settings-open').click();
    await expect(page.getByRole('dialog', { name: 'Impostazioni IA' })).toBeVisible();
    await page.getByTestId('ai-key').fill(FAKE_KEY);
    await page.getByTestId('ai-key-save').click();
    await expect(page.getByTestId('ai-msg')).toContainText('Chiave salvata');
    await page.keyboard.press('Escape');
    const chat = page.getByTestId('panel-chat');
    await chat.getByTestId('chat-input').fill('aggiungi un avviatore stella-triangolo per un motore da 7,5 kW a pagina 1');
    await chat.getByTestId('chat-send').click();
    await expect(chat.getByTestId('chat-assistant').last()).toContainText('Propongo un avviatore stella-triangolo');
    await expect(chat.getByTestId('chat-proposal')).toContainText('Motore');
  } finally {
    await close();
  }
});
