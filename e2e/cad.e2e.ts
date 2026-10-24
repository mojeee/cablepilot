// End-to-end tests of the CAD workspace (M6 part 2): command-line drawing, snaps, window and crossing
// selection, layers, the docked layout across a restart, and the AI chat with the built-in provider.
/// <reference lib="dom" />
import { test } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, launch, tab } from './app';

interface El { id: string; kind: string; points?: { x: number; y: number }[]; x?: number; y?: number; w?: number; h?: number; designation?: string; layer?: string }
interface Saved { pages: { elements: El[] }[]; layers?: { id: string; on: boolean; locked: boolean }[] }
const saved = (out: string): Saved => JSON.parse(readFileSync(join(out, readdirSync(out).find((f) => f.endsWith('.cablepilot.json'))!), 'utf8'));
const elements = (s: Saved): El[] => s.pages.flatMap((p) => p.elements);

/** Types into the command line and presses Enter. */
async function cmd(page: Page, text: string): Promise<void> {
  const input = page.getByTestId('cmd-input');
  await input.click();
  await input.fill(text);
  await input.press('Enter');
}

/** Maps page millimetres to screen pixels by reading the coordinate readout at two points (snap off, so the readout is exact). */
async function calibrate(page: Page) {
  const box = (await page.getByTestId('page-canvas').boundingBox())!;
  const read = async (x: number, y: number) => {
    await page.mouse.move(x, y);
    const m = (await page.getByTestId('readout').textContent())!.match(/(-?\d+\.\d), (-?\d+\.\d) mm/)!;
    return { x: Number(m[1]), y: Number(m[2]) };
  };
  await page.keyboard.press('F9');
  const a = await read(box.x + 200, box.y + 150), b = await read(box.x + 600, box.y + 400);
  await page.keyboard.press('F9');
  const sx = 400 / (b.x - a.x), sy = 250 / (b.y - a.y);
  return {
    at: (px: number, py: number) => ({ x: box.x + 200 + (px - a.x) * sx, y: box.y + 150 + (py - a.y) * sy }),
    box,
  };
}

test('draw lines with the command line: L, typed coordinates, relative and polar input, repeat, undo', async () => {
  const { page, out, close } = await launch();
  try {
    await cmd(page, 'L');
    await expect(page.getByTestId('cmd-prompt')).toContainText('Specify first point');
    await cmd(page, '50,50');
    await expect(page.getByTestId('cmd-prompt')).toContainText('Specify next point or [Undo]');
    await cmd(page, '@100,0');
    await cmd(page, '@0,40');
    await cmd(page, '@20<90'); // 20 mm up the page
    await page.getByTestId('cmd-input').press('Enter'); // an empty Enter finishes the command
    await expect(page.getByTestId('cmd-prompt')).toContainText('Command');

    await page.getByTestId('save').click();
    const lines = elements(saved(out)).filter((e) => e.kind === 'line');
    expect(lines.map((l) => l.points)).toEqual([
      [{ x: 50, y: 50 }, { x: 150, y: 50 }],
      [{ x: 150, y: 50 }, { x: 150, y: 90 }],
      [{ x: 150, y: 90 }, { x: 150, y: 70 }],
    ]);

    // Enter on an empty command line repeats the last command; Esc cancels it; U undoes the last segment.
    await page.getByTestId('cmd-input').press('Enter');
    await expect(page.getByTestId('cmd-prompt')).toContainText('Specify first point');
    await page.getByTestId('cmd-input').press('Escape');
    await expect(page.getByTestId('cmd-prompt')).not.toContainText('Specify first point');
    await cmd(page, 'U');
    await page.getByTestId('save').click();
    expect(elements(saved(out)).filter((e) => e.kind === 'line')).toHaveLength(2);
    await cmd(page, 'xyz');
    await expect(page.getByTestId('cmd-log')).toContainText('Unknown command "xyz"');
  } finally {
    await close();
  }
});

test('ortho constrains the cursor; the status bar shows the aids', async () => {
  const { page, out, close } = await launch();
  try {
    const box = (await page.getByTestId('page-canvas').boundingBox())!;
    await cmd(page, 'L');
    await page.mouse.click(box.x + 300, box.y + 200);
    const readout = async () => {
      const m = (await page.getByTestId('readout').textContent())!.match(/(-?\d+\.\d), (-?\d+\.\d) mm/)!;
      return { x: Number(m[1]), y: Number(m[2]) };
    };
    const base = await readout();
    // Without ortho the cursor follows the mouse.
    await page.mouse.move(box.x + 420, box.y + 233);
    expect((await readout()).y).not.toBe(base.y);
    await page.keyboard.press('F8');
    await expect(page.getByTestId('aid-ortho')).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.move(box.x + 421, box.y + 233);
    const o = await readout();
    expect(o.y).toBe(base.y);
    expect(o.x).toBeGreaterThan(base.x + 20);
    await page.mouse.click(box.x + 421, box.y + 233);
    await page.keyboard.press('Escape');
    await page.getByTestId('save').click();
    const line = elements(saved(out)).find((e) => e.kind === 'line')!;
    expect(line.points![0].y).toBe(line.points![1].y);
    expect(line.points![1].x).toBeGreaterThan(line.points![0].x);
    // F8 again turns it off; polar tracking excludes ortho.
    await page.keyboard.press('F10');
    await expect(page.getByTestId('aid-polar')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('aid-ortho')).toHaveAttribute('aria-pressed', 'false');
  } finally {
    await close();
  }
});

test('object snap finds endpoints and intersections and marks them in the status bar', async () => {
  const { page, close } = await launch();
  try {
    const cal = await calibrate(page);
    await cmd(page, 'L');
    for (const p of ['100,100', '200,100']) await cmd(page, p);
    await page.keyboard.press('Escape');
    await cmd(page, 'L');
    for (const p of ['150,60', '150,160']) await cmd(page, p);
    await page.keyboard.press('Escape');
    await cmd(page, 'L'); // a command is running, so the cursor shows its snap
    const readout = page.getByTestId('readout');
    const hover = async (x: number, y: number) => {
      const s = cal.at(x, y);
      await page.mouse.move(s.x, s.y);
    };
    await hover(150.8, 100.7);
    await expect(readout).toContainText('150.0, 100.0');
    await expect(readout).toContainText('Intersection');
    await hover(200.9, 99.2);
    await expect(readout).toContainText('200.0, 100.0');
    await expect(readout).toContainText('Endpoint');
    await hover(150.6, 110.8);
    await expect(readout).toContainText('150.0, 110.0');
    await expect(readout).toContainText('Midpoint');
    // Object snap off (F3): the cursor goes to the grid and no snap is named.
    await page.keyboard.press('F3');
    await expect(page.getByTestId('aid-osnap')).toHaveAttribute('aria-pressed', 'false');
    await hover(150.8, 100.7);
    await expect(readout).not.toContainText('Intersection');
    // A single mode can be switched off in the mode list.
    await page.keyboard.press('F3');
    await page.locator('.osnap-modes summary').click();
    await page.getByTestId('osnap-mode-intersection').uncheck();
    await hover(150.8, 100.7);
    await expect(readout).not.toContainText('Intersection');
  } finally {
    await close();
  }
});

test('window selection takes what is inside, crossing selection what it touches, Shift removes, layers lock', async () => {
  const { page, close } = await launch();
  try {
    const cal = await calibrate(page);
    const selected = page.getByTestId('chat-context');
    await cmd(page, 'REC');
    await cmd(page, '100,100');
    await cmd(page, '@40,20');
    await cmd(page, 'L');
    await cmd(page, '120,90');
    await cmd(page, '120,150');
    await page.keyboard.press('Escape');
    const drag = async (a: [number, number], b: [number, number], shift = false) => {
      const p = cal.at(...a), q = cal.at(...b);
      await page.mouse.move(p.x, p.y);
      if (shift) await page.keyboard.down('Shift');
      await page.mouse.down();
      await page.mouse.move((p.x + q.x) / 2, (p.y + q.y) / 2, { steps: 4 });
      await page.mouse.move(q.x, q.y, { steps: 4 });
      await page.mouse.up();
      if (shift) await page.keyboard.up('Shift');
    };
    // A window (left to right) around part of both objects takes neither.
    await drag([110, 95], [130, 125]);
    await expect(selected).toContainText('0 selected');
    // A window around the whole rectangle takes only the rectangle.
    await drag([90, 85], [150, 135]);
    await expect(selected).toContainText('1 selected');
    // The same area dragged right to left (crossing) also takes the line that passes through it.
    await drag([150, 135], [90, 85]);
    await expect(selected).toContainText('2 selected');
    // Shift removes what the area covers from the selection: the line goes, the rectangle stays when it is only touched.
    await drag([125, 145], [115, 140], true);
    await expect(selected).toContainText('1 selected');

    // Lock the annotation layer: crossing no longer selects its objects.
    await page.getByTestId('panel-toggle-layers').click();
    await page.getByTestId('layer-lock-annotation').click();
    await drag([150, 135], [90, 85]);
    await expect(selected).toContainText('0 selected');
    await page.getByTestId('layer-lock-annotation').click();
    await drag([150, 135], [90, 85]);
    await expect(selected).toContainText('2 selected');
  } finally {
    await close();
  }
});

test('layers: switching a layer off hides its objects, colour and the saved file keep the state', async () => {
  const { page, out, close } = await launch();
  try {
    await page.getByTestId('panel-toggle-layers').click();
    await cmd(page, 'REC');
    await cmd(page, '100,100');
    await cmd(page, '@40,20');
    await expect(page.getByTestId('layer-annotation')).toContainText('1');
    const before = await page.getByTestId('page-canvas').screenshot();
    await page.getByTestId('layer-on-annotation').click();
    await expect(page.getByTestId('layer-on-annotation')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('layer-table')).toBeVisible();
    const after = await page.getByTestId('page-canvas').screenshot();
    expect(Buffer.compare(before, after)).not.toBe(0);
    await page.getByTestId('layer-add').click(); // an empty name adds nothing
    await page.getByTestId('layer-new-name').fill('Cabinet');
    await page.getByTestId('layer-add').click();
    await expect(page.getByTestId('layer-table')).toContainText('Cabinet');
    await page.getByTestId('save').click();
    const s = saved(out);
    expect(s.layers?.find((l) => l.id === 'annotation')).toMatchObject({ on: false, locked: false });
    expect(s.layers?.some((l) => l.id.startsWith('u-'))).toBe(true);
    // Undo brings the layer back on (layer changes are commands).
    await page.getByTestId('undo').click();
    await page.getByTestId('undo').click();
    await expect(page.getByTestId('layer-on-annotation')).toHaveAttribute('aria-pressed', 'true');
  } finally {
    await close();
  }
});

test('the ribbon, aliases, the right-click menu and the full-screen toggle work', async () => {
  const { page, out, close } = await launch();
  try {
    for (const id of ['home', 'insert', 'wires', 'reports', 'plc', 'layout', 'view']) await expect(page.getByTestId(`tab-${id}`)).toBeVisible();
    await page.getByTestId('rb-line').click();
    await expect(page.getByTestId('cmd-prompt')).toContainText('LINE');
    await page.getByTestId('cmd-input').press('Escape');
    // Autocomplete: a prefix lists commands and aliases; Tab completes.
    await page.getByTestId('cmd-input').click();
    await page.getByTestId('cmd-input').fill('rect');
    await expect(page.getByTestId('cmd-suggest')).toContainText('RECTANGLE');
    await page.getByTestId('cmd-input').press('Tab');
    await expect(page.getByTestId('cmd-input')).toHaveValue('RECTANG');
    await page.getByTestId('cmd-input').fill('');
    // Right-click offers to repeat the last command.
    await cmd(page, 'DI');
    await page.getByTestId('cmd-input').press('Escape');
    const box = (await page.getByTestId('page-canvas').boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    await expect(page.getByTestId('ctx-repeat')).toContainText('Repeat DIST');
    await page.getByTestId('ctx-repeat').click();
    await expect(page.getByTestId('cmd-prompt')).toContainText('Specify first point');
    await page.getByTestId('cmd-input').press('Escape');
    // The ribbon collapses to its tabs and comes back.
    await page.getByTestId('ribbon-collapse').click();
    await expect(page.getByTestId('rb-line')).toHaveCount(0);
    await page.getByTestId('tab-home').click();
    await expect(page.getByTestId('rb-line')).toBeVisible();
    // Full screen hides ribbon and docks; the button brings them back.
    await tab(page, 'view');
    await page.getByTestId('rb-fullscreen').click();
    await expect(page.getByTestId('ribbon')).toHaveCount(0);
    await expect(page.getByTestId('dock-left')).toHaveCount(0);
    await expect(page.getByTestId('cmd-input')).toBeVisible();
    await page.getByTestId('exit-fullscreen').click();
    await expect(page.getByTestId('dock-left')).toBeVisible();
    // Move, copy: an existing selection is used (pick first); typed points give the displacement.
    await cmd(page, 'REC');
    await cmd(page, '100,100');
    await cmd(page, '@20,20');
    await page.getByTestId('cmd-input').press('Escape'); // leaves the command line
    await page.keyboard.press('Control+a');
    await expect(page.getByTestId('chat-context')).toContainText('1 selected');
    await cmd(page, 'CO');
    await cmd(page, '0,0');
    await cmd(page, '50,0');
    await page.getByTestId('cmd-input').press('Enter');
    await page.getByTestId('save').click();
    const rects = elements(saved(out)).filter((e) => e.kind === 'rect');
    expect(rects.map((r) => [r.x, r.y])).toEqual([[100, 100], [150, 100]]);
  } finally {
    await close();
  }
});

test('a docked-panel layout survives a restart and can be reset', async () => {
  const first = await launch();
  const profile = first.profile;
  try {
    await expect(first.page.getByTestId('dock-right').getByTestId('panel-chat')).toBeVisible();
    await first.page.getByTestId('panel-dock-chat').selectOption('left');
    await expect(first.page.getByTestId('dock-left').getByTestId('panel-chat')).toBeVisible();
    await first.page.getByTestId('panel-dock-messages').selectOption('hidden');
    await expect(first.page.getByRole('region', { name: 'Messages' })).toHaveCount(0);
    const w0 = (await first.page.getByTestId('dock-left').boundingBox())!.width;
    await first.page.getByTestId('split-left').focus();
    await first.page.keyboard.press('ArrowRight');
    await first.page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await first.page.getByTestId('dock-left').boundingBox())!.width).toBeCloseTo(w0 + 48, -1);
  } finally {
    await first.close();
  }
  const second = await launch({ profile });
  try {
    await expect(second.page.getByTestId('dock-left').getByTestId('panel-chat')).toBeVisible();
    await expect(second.page.getByRole('region', { name: 'Messages' })).toHaveCount(0);
    expect((await second.page.getByTestId('dock-left').boundingBox())!.width).toBeGreaterThan(290);
    await tab(second.page, 'view');
    await second.page.getByTestId('rb-reset-layout').click();
    await expect(second.page.getByTestId('dock-right').getByTestId('panel-chat')).toBeVisible();
    await expect(second.page.getByRole('region', { name: 'Messages' })).toBeVisible();
  } finally {
    await second.close();
  }
});

test('the assistant proposes in the chat, shows sources, and an accepted proposal is one undo step', async () => {
  const { page, out, close } = await launch();
  try {
    const box = (await page.getByTestId('page-canvas').boundingBox())!;
    const chat = page.getByTestId('panel-chat');
    await expect(page.getByTestId('chat-note')).toContainText('API key');
    await expect(page.getByTestId('ai-status')).toContainText('built-in');

    // Placing a coil gives a context hint: "add its contacts?"
    await page.getByTestId('symbol-coil').click();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('ai-hint')).toContainText('Add the contacts of -K1?');
    await page.getByTestId('ai-hint-ask').click();
    await expect(chat.getByTestId('chat-proposal')).toBeVisible();
    await expect(chat.getByTestId('chat-proposal')).toContainText('NO contact -K1');
    await expect(chat.getByTestId('source-project').first()).toBeVisible();
    await expect(chat.getByTestId('source-suggestion').first()).toBeVisible();

    // A preview only: the project still has just the coil (the file shows it).
    await page.getByTestId('save').click();
    expect(elements(saved(out)).filter((e) => e.kind === 'symbol')).toHaveLength(1);

    await chat.getByTestId('chat-accept').click();
    await expect(chat.getByTestId('chat-outcome')).toContainText('Accepted');
    await page.getByTestId('save').click();
    expect(elements(saved(out)).filter((e) => e.kind === 'symbol').map((e) => e.designation)).toEqual(['-K1', '-K1', '-K1']);

    // One undo step takes both contacts away again.
    await page.keyboard.press('Control+z');
    await page.getByTestId('save').click();
    expect(elements(saved(out)).filter((e) => e.kind === 'symbol')).toHaveLength(1);

    // Rejecting leaves the project alone; a request it cannot understand says an API key is needed.
    await chat.getByTestId('chat-input').fill('add contacts for -K1');
    await chat.getByTestId('chat-send').click();
    await chat.getByTestId('chat-reject').click();
    await expect(chat.getByTestId('chat-outcome').last()).toContainText('Rejected');
    await cmd(page, 'add a star-delta starter for a 7.5 kW motor on page 5');
    await expect(chat.getByTestId('chat-user').last()).toContainText('star-delta');
    await expect(chat.getByTestId('chat-assistant').last()).toContainText('API key');
    await page.getByTestId('save').click();
    expect(elements(saved(out)).filter((e) => e.kind === 'symbol')).toHaveLength(1);

    // Natural language typed on the command line goes to the assistant too.
    await cmd(page, 'number the wires on this page');
    await expect(chat.getByTestId('chat-assistant').last()).toContainText('nothing to change');
  } finally {
    await close();
  }
});
