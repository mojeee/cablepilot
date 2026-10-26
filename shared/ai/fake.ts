// The deterministic stand-in for a real provider (M6 part 2). It understands three kinds of prompt, in
// English and Italian, and builds real proposals from the project with the same engines the app uses:
//   "add contacts for -K1"          places the contacts of a coil (the count comes from the device's part, else 1 NO + 1 NC)
//   "number the wires on this page"  the automatic wire numbering (shared/wires.ts), for the page or the project
//   "size the feeder of -M1"         the sizing engine (shared/feeders.ts, shared/sizing.ts); never an invented rating
//   "suggest a layout"               the cabinet layout suggestion (shared/cabinet/suggest.ts), with the rules it applied
//   "move the PLC to the right and rearrange"  moves one device on the layout, keeps it there and arranges the rest around it
//   "explain the layout"             lists the rules the layout was made with
// Anything else gets an honest answer: a free-form request needs an API key (AI settings). Pure: no network, no clock.

import { computeBom } from '../bom';
import { cabinetOf, isCab } from '../cabinet/model';
import { suggestLayout } from '../cabinet/suggest';
import { cabinetDevices } from '../cabinet/size';
import { shortDesignation } from '../cabinet/draw';
import { parseContacts } from '../checks';
import { apply, type Command } from '../commands';
import { keyOf } from '../devices';
import { lineCommands, sizeProject, SIZING_NOTE, type Feeder } from '../feeders';
import { t } from '../i18n';
import { newId as defaultId } from '../ids';
import { findPart, withProjectSymbols, type Library } from '../library/types';
import type { Page, Project, SymbolEl, WireEl } from '../model/types';
import type { AiAnswer, AiRequest, Claim } from './types';

const PROVIDER = { id: 'built-in', fake: true } as const;

/** Requests worth trying with a real model (tool-driven). */
export const AI_EXAMPLES = ['add a star-delta starter for a 7.5 kW motor on page 5', 'renumber the wires on pages 3–8', 'why does the check say Q3 is too small?', 'suggest a layout'];
export const FAKE_EXAMPLES = ['add contacts for -K1', 'number the wires on this page', 'size the feeder of -M1', 'suggest a layout', 'move the PLC to the right and rearrange'];

const DES = /(?:^|[\s(])(-?[A-Za-z]{1,3}\d+[A-Za-z0-9.]*)(?=[\s?.,)]|$)/g;
/** The designations named in a prompt, normalised to "-K1". */
export function designationsIn(prompt: string): string[] {
  return [...prompt.matchAll(DES)].map((m) => (m[1].startsWith('-') ? m[1] : `-${m[1]}`).toUpperCase());
}

const say = (text: string, extra: Partial<AiAnswer> = {}): AiAnswer => ({ text, claims: [], provider: PROVIDER, ...extra });

function noKey(): AiAnswer {
  return say(t('I only understand a few requests until you add your API key in the AI settings. Free-form requests need that key. Try one of these:'), { examples: FAKE_EXAMPLES, needsKey: true });
}

export function fakeAnswer(req: AiRequest, libIn: Library, newId: (prefix?: string) => string = defaultId): AiAnswer {
  const p = req.prompt.toLowerCase();
  const project = req.project;
  const lib = withProjectSymbols(libIn, project.symbols);
  const page = project.pages.find((x) => x.id === req.pageId);
  const des = designationsIn(req.prompt);

  if (/(layout|quadro|cabinet|armadio|piastra)/.test(p)) {
    if (/(explain|why|spiega|perch)/.test(p)) return explainLayoutAnswer(project, libIn, newId);
    if (/(move|shift|sposta)/.test(p)) return moveDeviceAnswer(project, libIn, req.prompt, des, /(rearrange|reorder|riorganizza|riordina|sistema)/.test(p), newId);
    return suggestAnswer(project, libIn, newId);
  }
  if (/(move|sposta)/.test(p) && /(right|left|destra|sinistra)/.test(p) && cabinetOf(project).devices.length > 0) return moveDeviceAnswer(project, libIn, req.prompt, des, /(rearrange|reorder|riorganizza|riordina|sistema)/.test(p), newId);

  if (/contact|contatt/.test(p)) {
    let target = des[0];
    if (!target) {
      const sel = page?.elements.find((e): e is SymbolEl => e.kind === 'symbol' && req.selection.includes(e.id) && lib.symbols.get(e.symbolId)?.function === 'coil');
      target = sel?.designation ?? '';
    }
    return target ? contactsFor(project, lib, target, newId) : say(t('Which device? Name its designation, for example "add contacts for -K1", or select the coil first.'), { examples: FAKE_EXAMPLES });
  }
  if (/(number|numer).*(wire|fil[oi]|conduttor|cavi)|(wire|fil[oi]).*(number|numer)/.test(p)) return numberWires(project, libIn, req.pageId, /this page|current page|questa pagina|sulla pagina|in questa/.test(p));
  if (/(size|dimension)/.test(p) && (des[0] || /feeder|linea|alimentaz/.test(p))) return des[0] ? sizeFeederAnswer(project, libIn, des[0]) : say(t('Which feeder? Name the load, for example "size the feeder of -M1".'), { examples: FAKE_EXAMPLES });
  return noKey();
}

function contactsFor(project: Project, lib: Library, des: string, newId: (prefix?: string) => string): AiAnswer {
  let coil: { page: Page; el: SymbolEl } | undefined;
  for (const pg of project.pages) for (const e of pg.elements) if (!coil && e.kind === 'symbol' && e.designation === des && lib.symbols.get(e.symbolId)?.function === 'coil') coil = { page: pg, el: e };
  if (!coil) return say(t('There is no coil {des} in this project, so I have nothing to add contacts to.', { des }), { claims: [{ text: t('Searched every page for a coil with this designation.'), source: { kind: 'project', ref: t('All pages') } }] });
  const key = keyOf(coil.page, des, coil.el.location);
  const rec = project.devices.find((d) => d.designation === key);
  const partCounts = (rec?.parts ?? []).map((u) => findPart(lib, project.parts, u.part)).filter((x) => !!x).map((x) => ({ part: x, c: parseContacts(x.data['Auxiliary contacts'] ?? x.data.Contacts) })).find((x) => x.c.no + x.c.nc + x.c.co > 0);
  const want = partCounts ? { no: partCounts.c.no + partCounts.c.co, nc: partCounts.c.nc } : { no: 1, nc: 1 };
  const have = { no: 0, nc: 0 };
  for (const pg of project.pages) for (const e of pg.elements) if (e.kind === 'symbol' && e.designation === des) { const fn = lib.symbols.get(e.symbolId)?.function; if (fn === 'contact-no') have.no++; if (fn === 'contact-nc') have.nc++; }
  const todo: ('contact-no' | 'contact-nc')[] = [...Array(Math.max(0, want.no - have.no)).fill('contact-no'), ...Array(Math.max(0, want.nc - have.nc)).fill('contact-nc')];
  const claims: Claim[] = [{ text: t('{des} is a coil on page {page}.', { des, page: project.pages.indexOf(coil.page) + 1 }), source: { kind: 'project', ref: t('Page {page}', { page: project.pages.indexOf(coil.page) + 1 }) } }];
  if (!todo.length) return say(t('{des} already has all the contacts its device provides.', { des }), { claims });
  claims.push(partCounts
    ? { text: t('The device provides {n} contacts.', { n: want.no + want.nc }), source: { kind: 'library', ref: partCounts.part.code } }
    : { text: t('The device has no part with contact data, so I suggest one NO and one NC contact; check the data sheet.'), source: { kind: 'suggestion', ref: t('confirm before use') } });
  const commands: Command[] = todo.map((symbolId, i) => ({
    type: 'symbol/place' as const, page: coil!.page.id,
    element: { id: newId('s'), kind: 'symbol' as const, symbolId, x: Math.round((coil!.el.x + 30 + 15 * i) / 2.5) * 2.5, y: coil!.el.y, rot: 0 as const, mirror: false, designation: des, ...(coil!.el.location ? { location: coil!.el.location } : {}) },
  }));
  const names = todo.map((s) => (s === 'contact-no' ? t('NO contact') : t('NC contact')));
  return say(t('I propose {n} contacts for {des}, placed to the right of its coil on page {page}. Accept to place them, then move them where they belong.', { n: todo.length, des, page: project.pages.indexOf(coil.page) + 1 }), {
    claims,
    proposal: { label: `AI: contacts for ${des}`, commands: [{ type: 'batch', label: `AI: contacts for ${des}`, commands }], summary: names.map((n) => `${n} ${des}`), page: coil.page.id },
  });
}

export function numberWires(project: Project, lib: Library, pageId: string, onPage: boolean): AiAnswer {
  const cmd: Command = onPage ? { type: 'wire/renumber', page: pageId } : { type: 'wire/renumber' };
  const after = apply(project, cmd, { lib });
  const changed: { was: string; now: string }[] = [];
  project.pages.forEach((pg, i) => pg.elements.forEach((e, j) => {
    const n = after.pages[i].elements[j] as WireEl;
    if (e.kind === 'wire' && n.number !== e.number) changed.push({ was: e.number ?? '', now: n.number ?? '' });
  }));
  const pattern = project.settings.numbering.pattern;
  const claims: Claim[] = [{ text: t('Numbers follow the pattern {pattern} of this project.', { pattern }), source: { kind: 'project', ref: t('Project settings: numbering') } }];
  if (!changed.length) return say(t('Every wire already has the right number; nothing to change.'), { claims });
  const scope = onPage ? t('the nets that touch this page') : t('the whole project');
  return say(t('I propose to number {n} wires ({scope}). Numbers you typed by hand stay as they are.', { n: changed.length, scope }), {
    claims,
    proposal: { label: 'AI: number the wires', commands: [cmd], summary: changed.slice(0, 8).map((c) => (c.was ? `${c.was} → ${c.now}` : `→ ${c.now}`)).concat(changed.length > 8 ? [t('... and {n} more', { n: changed.length - 8 })] : []), page: pageId },
  });
}

export function sizeFeederAnswer(project: Project, lib: Library, des: string): AiAnswer {
  const ctx = { project, lib, stock: null, bom: computeBom(project, lib) };
  const feeders: Feeder[] = sizeProject(ctx);
  const f = feeders.find((x) => x.load === des || x.load.endsWith(des));
  if (!f) return say(t('{des} has no load data and is not a motor, so there is no feeder to size. Enter its power or current in the Properties panel first.', { des }));
  if (f.missing.length) return say(t('I cannot size the feeder of {des} yet: {missing} are missing in its load data. I do not guess ratings.', { des, missing: f.missing.join(', ') }));
  const claims: Claim[] = [];
  if (f.ib !== undefined) claims.push({ text: t('Design current Ib = {ib} A ({source}).', { ib: Math.round(f.ib * 100) / 100, source: f.ibSource === 'nameplate' ? t('nameplate') : t('computed from the load data') }), source: { kind: 'project', ref: t('Load data of {des}', { des }) } });
  const summary: string[] = [];
  for (const l of f.lines) {
    if (l.status === 'change' && l.proposal?.option) {
      summary.push(`${l.subject || l.role}: ${l.proposal.option.part.code}`);
      claims.push({ text: `${l.requirement?.text ?? ''} → ${l.proposal.option.part.code}`.trim(), source: { kind: 'library', ref: l.proposal.option.part.code } });
      for (const a of l.requirement?.assumptions ?? []) claims.push({ text: a, source: { kind: 'standard', ref: 'IEC 60364-5-52 / 60364-4-43 / 60947' } });
    } else if (l.status === 'change' && l.proposal?.xs) {
      summary.push(t('wires: {xs} mm²', { xs: l.proposal.xs }));
    }
  }
  claims.push({ text: SIZING_NOTE(), source: { kind: 'suggestion', ref: t('confirm before use') } });
  const cmds = f.lines.filter((l) => l.status === 'change').map((l) => lineCommands(ctx, l, undefined, f.ib)).filter((c): c is Command => !!c);
  if (!cmds.length) return say(t('The feeder of {des} already meets its requirements; I have nothing to propose.', { des }), { claims });
  return say(t('I propose these ratings for the feeder of {des}. They are suggestions from the stated data; confirm each one.', { des }), {
    claims,
    proposal: { label: `AI: size ${des}`, commands: [{ type: 'batch', label: `AI: size ${des}`, commands: cmds }], summary },
  });
}

export function suggestAnswer(project: Project, lib: Library, newId: (prefix?: string) => string): AiAnswer {
  const sug = suggestLayout(project, lib, { newId });
  if (!sug.commands.length) return say(t('Every device is already placed and nothing is left to arrange.'), { claims: sug.rules });
  const note = sug.issues.length ? ` ${t('Look at: {issues}', { issues: sug.issues.join(' ') })}` : '';
  return say(t('I propose a cabinet layout: {summary}. Accept it to put it on the layout pages, then edit it with the normal tools.', { summary: sug.summary.join('; ') }) + note, {
    claims: sug.rules,
    proposal: { label: 'AI: suggested layout', commands: [{ type: 'batch', label: 'AI: suggested layout', commands: sug.commands }], summary: sug.summary.concat(sug.issues), page: sug.page },
  });
}

export function explainLayoutAnswer(project: Project, lib: Library, newId: (prefix?: string) => string): AiAnswer {
  const sug = suggestLayout(project, lib, { newId });
  return say(t('This is how a layout is suggested. The rules apply to the devices that are not placed or locked by you; the rest stays where it is.'), { claims: sug.rules });
}

/** The device a prompt names: a designation, or a kind of device (PLC, HMI) that is on the layout. */
function findDevice(project: Project, lib: Library, prompt: string, des: string[]): string | undefined {
  const cab = cabinetOf(project);
  const keys = cab.devices.map((p) => p.el.designation as string);
  for (const d of des) { const k = keys.find((x) => x.endsWith(d)); if (k) return k; }
  const p = prompt.toLowerCase();
  const byCategory = (cat: string, id?: string) => cabinetDevices(project, lib).filter((d) => keys.includes(d.key) && d.part?.category === cat && (!id || d.part.id.includes(id)));
  if (/\bplc\b/.test(p)) return (byCategory('plc', 'cpu')[0] ?? byCategory('plc')[0])?.key;
  if (/\bhmi\b/.test(p)) return byCategory('hmi-network', 'hmi')[0]?.key;
  return undefined;
}

export function moveDeviceAnswer(project: Project, lib: Library, prompt: string, des: string[], rearrange: boolean, newId: (prefix?: string) => string): AiAnswer {
  const cab = cabinetOf(project);
  const key = findDevice(project, lib, prompt, des);
  const placed = cab.devices.find((p) => p.el.designation === key);
  if (!key || !placed) return say(t('Which device on the layout should move? Name it, for example "move the PLC to the right" or "move -K1 to the left". Suggest a layout first if nothing is placed.'), { examples: FAKE_EXAMPLES });
  const right = /(right|destra)/.test(prompt.toLowerCase());
  const e = placed.el;
  const rail = cab.rails.find((r) => r.el.id === e.rail)?.el;
  const door = cab.doors.includes(placed.page);
  const frame = rail ?? (door ? cab.doorFrame : (cab.plate ?? cab.enclosure));
  if (!frame) return say(t('There is no plate to move the device on.'));
  const x = right ? frame.x + frame.w - e.w - (rail ? 0 : 15) : frame.x + (rail ? 0 : 15);
  const move: Command = { type: 'el/update', page: placed.page.id, id: e.id, patch: { x } };
  const name = shortDesignation(key);
  const claims: Claim[] = [{ text: t('{name} is on the layout at x = {x} mm.', { name, x: Math.round(e.x) }), source: { kind: 'project', ref: t('Layout page') } }];
  if (!rearrange) {
    const others = cab.devices.filter((p) => p.page === placed.page && p !== placed && p.el.x < x + e.w && p.el.x + p.el.w > x && Math.abs(p.el.y - e.y) < e.h);
    return say(t('I propose to move {name} to the {side}.', { name, side: right ? t('right') : t('left') }) + (others.length ? ` ${t('It would overlap {n} device(s); add "and rearrange" to arrange the others around it.', { n: others.length })}` : ''), {
      claims, proposal: { label: `AI: move ${name}`, commands: [move], summary: [t('{name} to the {side}', { name, side: right ? t('right') : t('left') })], page: placed.page.id },
    });
  }
  // Moved by hand counts as placed by the user: the suggestion keeps it and arranges the rest around it.
  const moved = apply(project, move, { lib });
  const sug = suggestLayout(moved, lib, { newId });
  const cmds = [move, ...sug.commands];
  return say(t('I propose to move {name} to the {side} and keep it there, then arrange the other devices around it. It is a preview: accept it or reject it.', { name, side: right ? t('right') : t('left') }), {
    claims: [...claims, ...sug.rules],
    proposal: { label: `AI: move ${name} and rearrange`, commands: [{ type: 'batch', label: `AI: move ${name} and rearrange`, commands: cmds }], summary: [t('{name} to the {side}', { name, side: right ? t('right') : t('left') }), ...sug.summary], page: placed.page.id },
  });
}
