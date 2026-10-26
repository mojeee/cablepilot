// The command line's engine: typed text becomes a command, an answer to the running command, or a request
// to the assistant. Every ribbon button, menu item and shortcut runs a command through here too, so there
// is one path for all of them (and edits go through the editor's command layer, with undo).

import { t } from '@shared/i18n';
import { autocomplete, routeInput, resolveCommand } from '@shared/cad/commands';
import { parsePointInput } from '@shared/cad/input';
import { OSNAP_MODES, type OsnapMode } from '@shared/cad/snap';
import { runChecks } from '@shared/checks';
import { withShown, type PanelId } from '@shared/layout';
import { useChat } from '../state/chat';
import { useCad } from '../state/cad';
import { useEditor } from '../state/editor';
import { useUi } from '../state/ui';
import { circleSession, distSession, end, eraseSession, extendSession, lineSession, mirrorSession, moveSession, offsetSession, plineSession, rectSession, rotateSession, trimSession, zoomSession } from './sessions';
import { LAYOUT_RUN } from './layoutCmds';
import { view } from './viewBridge';

const ed = () => useEditor.getState();
const cad = () => useCad.getState();

/** Shows a panel (undoing a hide or a collapse) and optionally focuses an element inside it. */
export function showPanel(id: PanelId, focus?: string): void {
  const ui = useUi.getState();
  ui.setLayout(withShown(ui.layout, id));
  if (focus) setTimeout(() => document.querySelector<HTMLElement>(focus)?.focus(), 60);
}

function setAid(name: 'snap' | 'grid' | 'ortho' | 'polar' | 'osnap' | 'dyn', args: string, label: string): void {
  const c = cad();
  const a = args.trim().toLowerCase();
  if (a === 'on' || a === 'off') { if (c.aids[name] !== (a === 'on')) c.toggle(name); } else c.toggle(name);
  cad().say('info', `${label}: ${cad().aids[name] ? t('on') : t('off')}`);
}

function insert(args: string): void {
  const q = args.trim().toLowerCase();
  if (!q) { showPanel('symbols', '[data-testid="symbol-search"]'); cad().say('info', t('Type part of a symbol name after INSERT, for example INSERT coil.')); return; }
  const lib = ed().lib;
  const found = [...lib.symbols.values()].filter((d) => d.id === q || d.title.en.toLowerCase().includes(q) || d.title.it.toLowerCase().includes(q) || d.function === q);
  const hit = found.find((d) => d.id === q || d.title.en.toLowerCase() === q) ?? found[0];
  if (!hit) { cad().say('error', t('No symbol matches "{q}".', { q })); return; }
  ed().setTool('symbol', hit.id);
  cad().say('info', found.length > 1 ? t('{n} symbols match; placing {name}. Click to place, Esc to stop.', { n: found.length, name: hit.title.en }) : t('Placing {name}. Click to place, Esc to stop.', { name: hit.title.en }));
}

const dialog = (d: Parameters<ReturnType<typeof ed>['setDialog']>[0]) => () => ed().setDialog(d);

type Runner = (args: string) => void;
const RUN: Record<string, Runner> = {
  LINE: () => cad().go(lineSession()),
  PLINE: () => cad().go(plineSession()),
  RECTANGLE: () => cad().go(rectSession(false)),
  DASHED: () => cad().go(rectSession(true)),
  CIRCLE: () => cad().go(circleSession()),
  TEXT: () => ed().setTool('text'),
  TABLE: () => ed().setTool('table'),
  IMAGE: () => document.querySelector<HTMLInputElement>('[data-testid="image-input"]')?.click(),
  WARNING: () => ed().setTool('warning'),
  WIRE: () => ed().setTool('wire'),
  MOVE: () => moveSession(false),
  COPY: () => moveSession(true),
  ROTATE: rotateSession,
  MIRROR: mirrorSession,
  ERASE: eraseSession,
  TRIM: () => cad().go(trimSession()),
  EXTEND: () => cad().go(extendSession()),
  OFFSET: () => cad().go(offsetSession()),
  ZOOM: (a) => {
    const s = zoomSession();
    cad().go(s);
    if (a.trim()) { if (!s.text(a.trim())) cad().say('error', t('Invalid input.')); }
  },
  EXTENTS: () => view()?.fit(),
  PAN: () => { cad().patch({ panMode: true }); cad().say('info', t('PAN: drag with the left button to move the view. Esc or Enter to finish.')); },
  UNDO: () => ed().undo(),
  REDO: () => ed().redo(),
  SELECTALL: () => ed().select(ed().page()?.elements.map((e) => e.id) ?? []),
  DIST: () => cad().go(distSession()),
  LAYER: () => showPanel('layers'),
  INSERT: insert,
  BOX: () => ed().setTool('symbol', 'box:blackbox'),
  CONNECTOR: () => ed().setTool('symbol', 'box:connector'),
  NUMBER: () => ed().renumberWires(),
  RENUMBER: () => ed().exec({ type: 'designation/renumber' }),
  WIRES: dialog('wires'),
  REPORT: dialog('reports'),
  BOM: dialog('bom'),
  CHECK: () => {
    const r = runChecks(ed().project(), ed().lib);
    showPanel('messages');
    useUi.getState().setChecksOpen(true);
    cad().say(r.errors ? 'error' : 'info', t('Electrical rule check: {errors} errors, {warnings} warnings, {infos} notes. See the Messages panel.', { errors: r.errors, warnings: r.warnings, infos: r.infos }));
  },
  SIZE: () => { ed().patch({ sizingFocus: null }); ed().setDialog('sizing'); },
  PLC: dialog('plc'),
  WAREHOUSE: dialog('warehouse'),
  AISETTINGS: dialog('ai'),
  REVISIONS: dialog('revisions'),
  SETTINGS: dialog('settings'),
  ADDPAGE: dialog('addPage'),
  NEW: () => ed().newProject(),
  OPEN: () => void ed().openFile(),
  SAVE: () => void ed().save(),
  SAVEAS: () => void ed().save(true),
  PDF: () => void ed().exportPdf('all'),
  DXFOUT: () => void ed().exportDxf(),
  DXFIN: () => void ed().importDxf(),
  GRID: (a) => setAid('grid', a, t('Grid display')),
  ORTHO: (a) => setAid('ortho', a, t('Ortho mode')),
  SNAP: (a) => setAid('snap', a, t('Grid snap')),
  POLAR: (a) => setAid('polar', a, t('Polar tracking')),
  DYN: (a) => setAid('dyn', a, t('Dynamic input')),
  OSNAP: (a) => {
    const words = a.trim().toLowerCase().split(/[\s,]+/).filter(Boolean);
    const modes = words.filter((w): w is OsnapMode => (OSNAP_MODES as readonly string[]).includes(w));
    if (modes.length) { cad().setAids({ modes, osnap: true }); cad().say('info', `${t('Object snap')}: ${modes.join(', ')}`); } else setAid('osnap', a, t('Object snap'));
  },
  PAGES: () => showPanel('pages'),
  SYMBOLS: () => showPanel('symbols'),
  PROPERTIES: () => showPanel('properties'),
  MESSAGES: () => showPanel('messages'),
  CHAT: () => showPanel('chat', '[data-testid="chat-input"]'),
  CLEANSCREEN: () => useUi.getState().setFullscreen(!useUi.getState().fullscreen),
  RESETLAYOUT: () => { useUi.getState().resetLayout(); cad().say('info', t('The panel layout is back to the default.')); },
  PREVIEW: () => ed().patch({ printPreview: !ed().printPreview }),
  HELP: dialog('shortcuts'),
  ...LAYOUT_RUN,
};

/** Runs a command by name or alias, as if typed. Stops the running command first. */
export function runCommand(word: string, args = ''): boolean {
  const cmd = resolveCommand(word);
  const run = cmd && RUN[cmd.name];
  if (!cmd || !run) return false;
  cad().go(null);
  cad().patch({ panMode: false });
  if (ed().tool !== 'select' && !['WIRE', 'TEXT', 'TABLE', 'WARNING', 'INSERT', 'BOX', 'CONNECTOR', 'IMAGE'].includes(cmd.name)) ed().setTool('select');
  // A legacy tool (wire, symbol) ends when another command starts: setTool above, then the command's own.
  run(args);
  const text = args ? `${cmd.name} ${args}` : cmd.name;
  cad().setLast(text);
  return true;
}

/** Everything typed in the command line goes through here (Enter). */
export function submit(raw: string): void {
  const c = cad();
  const text = raw.trim();
  c.setTyping('');
  const a = c.active;
  if (a) {
    c.say('echo', `${a.name}: ${text}`);
    if (text) c.pushHistory(text);
    if (!text) return a.enter();
    const pp = parsePointInput(text, a.base, c.cursor);
    if (pp.ok && a.pick !== 'select') return a.point(pp.pt);
    if (!a.text(text)) c.say('error', t('Invalid input. {prompt}', { prompt: a.prompt }));
    return;
  }
  if (c.panMode) { c.patch({ panMode: false }); return; }
  if (!text) {
    if (c.lastCommand) { c.say('echo', `${c.lastCommand}`); const [w, ...rest] = c.lastCommand.split(' '); runCommand(w, rest.join(' ')); }
    return;
  }
  c.pushHistory(text);
  const r = routeInput(text);
  if (r.kind === 'command') {
    c.say('echo', `${t('Command')}: ${text}`);
    runCommand(r.command.name, r.args);
  } else if (r.kind === 'unknown') {
    const near = autocomplete(r.word, 4).map((x) => x.word);
    c.say('error', t('Unknown command "{word}".', { word: r.word }) + (near.length ? ` ${t('Did you mean')} ${near.join(', ')}?` : ` ${t('Press F1 for the keyboard shortcuts.')}`));
  } else if (r.kind === 'natural') {
    c.say('echo', `${t('Assistant')}: ${text}`);
    showPanel('chat');
    void useChat.getState().ask(text);
  }
}

/** Enter pressed on the canvas (or Esc): finishes, repeats or cancels. */
export function enterKey(): void {
  const c = cad();
  if (c.active) return c.active.enter();
  if (c.panMode) return c.patch({ panMode: false });
  submit('');
}
export function escapeKey(): void {
  end();
  cad().patch({ panMode: false, typing: '' });
  ed().setTool('select');
  ed().select([]);
}


