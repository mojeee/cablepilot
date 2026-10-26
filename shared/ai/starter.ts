// A motor starter for the assistant (M7): the library macro (star-delta power circuit) placed on a page at
// the first free spot, the motor's load data from what the user stated, and the ratings sized by the same
// engine as the Sizing window (shared/feeders.ts, shared/sizing.ts) from the library and the warehouse. The
// assistant never types a rating: parts come from `sizeProject`, and anything it had to assume is listed.

import { computeBom } from '../bom';
import { apply, type Command } from '../commands';
import { keyOf } from '../devices';
import { lineCommands, sizeProject, SIZING_NOTE, type Feeder } from '../feeders';
import { t } from '../i18n';
import type { Library, MacroDef } from '../library/types';
import { placeMacro } from '../macros';
import { newPage } from '../model/defaults';
import type { El, LoadData, Page, Project, SymbolEl } from '../model/types';
import { sheetMm } from '../sheets';
import type { StockList } from '../stock';
import type { Claim, Proposal } from './types';

export interface StarterInput {
  macro: MacroDef;
  page: Page;
  powerKw: number;
  /** Nameplate data the user stated; the others are assumptions the assistant states itself. */
  currentA?: number;
  cosPhi?: number;
  efficiency?: number;
  lengthM?: number;
  starter: LoadData['starter'];
  /** Which of cosPhi / efficiency were assumed, not stated by the user. */
  assumed: string[];
}

export interface StarterResult {
  ok: boolean;
  error?: string;
  proposal?: Proposal;
  claims: Claim[];
  /** What the tool tells the model. */
  report: Record<string, unknown>;
}

interface Box { x0: number; y0: number; x1: number; y1: number }
/** A rough bounding box of an element in page millimetres (symbols and text are estimated), for finding free room. */
function boxOf(e: El): Box | undefined {
  if (e.kind === 'wire' || e.kind === 'line') return { x0: Math.min(...e.points.map((p) => p.x)), y0: Math.min(...e.points.map((p) => p.y)), x1: Math.max(...e.points.map((p) => p.x)), y1: Math.max(...e.points.map((p) => p.y)) };
  if (e.kind === 'text') { const lines = e.text.split('\n'); return { x0: e.x, y0: e.y, x1: e.x + Math.max(...lines.map((l) => l.length)) * e.size * 0.6, y1: e.y + lines.length * e.size * 1.5 }; }
  if (e.kind === 'symbol') return { x0: e.x - 12, y0: e.y - 12, x1: e.x + 12, y1: e.y + 12 };
  if ('x' in e && 'w' in e && 'h' in e) return { x0: e.x, y0: e.y, x1: e.x + (e.w as number), y1: e.y + (e.h as number) };
  if ('x' in e && 'y' in e) return { x0: e.x - 10, y0: e.y - 10, x1: e.x + 10, y1: e.y + 10 };
  return undefined;
}

/** The first free spot for a block on a page, scanning from the left; undefined when it does not fit (inside the frame, above the title block). */
export function freeSpot(page: Page, size: { w: number; h: number }): { x: number; y: number } | undefined {
  const sheet = sheetMm(page.size);
  const boxes = page.elements.filter((e) => e.kind !== 'form' && e.kind !== 'report' && e.kind !== 'table').map(boxOf).filter((b): b is Box => !!b);
  const y = 28;
  if (y + size.h > sheet.h - 45) return undefined;
  const gap = 6;
  for (let x = 25; x + size.w <= sheet.w - 15; x += 5) if (!boxes.some((b) => b.x0 < x + size.w + gap && b.x1 > x - gap && b.y0 < y + size.h + gap && b.y1 > y - gap)) return { x, y };
  return undefined;
}

export function buildStarter(projectIn: Project, lib: Library, inp: StarterInput, stock: StockList | null, newId: (p?: string) => string): StarterResult {
  const claims: Claim[] = [];
  let project = projectIn;
  let page = inp.page;
  const commands: Command[] = [];
  let spot = freeSpot(page, inp.macro.size);
  let newPageNo = 0;
  if (!spot) {
    // No room on that page: the starter goes on a new power page right after it, in the same proposal.
    if (inp.macro.size.w > sheetMm(page.size).w - 40) return { ok: false, error: `page has no free room for the starter (${inp.macro.size.w} x ${inp.macro.size.h} mm)`, claims, report: {} };
    const fresh: Page = { ...newPage(newId('p'), 'power', { en: 'Motor starter, star-delta', it: 'Avviatore motore, stella-triangolo' }, page.size), ...(page.function ? { function: page.function } : {}), ...(page.location ? { location: page.location } : {}) };
    const at = projectIn.pages.indexOf(page) + 1;
    const add: Command = { type: 'page/add', page: fresh, index: at };
    commands.push(add);
    project = apply(project, add, { lib });
    page = fresh;
    spot = { x: 90, y: 28 };
    newPageNo = at + 1;
  }
  const prefix = newId('ai');
  const pageNo = project.pages.indexOf(page) + 1;
  // The designations the macro will get (the same call the command makes).
  const els = placeMacro(project, page, inp.macro, spot, prefix);
  const syms = els.filter((e): e is SymbolEl => e.kind === 'symbol' && !!e.designation);
  const motorSym = syms.find((e) => lib.symbols.get(e.symbolId)?.function === 'motor');
  if (!motorSym) return { ok: false, error: 'the macro has no motor', claims, report: {} };
  const motorKey = keyOf(page, motorSym.designation, motorSym.location);
  const load: LoadData = { kind: 'motor', powerKw: inp.powerKw, starter: inp.starter, ...(inp.currentA ? { current: inp.currentA } : {}), ...(inp.cosPhi ? { cosPhi: inp.cosPhi } : {}), ...(inp.efficiency ? { efficiency: inp.efficiency } : {}), ...(inp.lengthM ? { length: inp.lengthM } : {}) };
  const place: Command = { type: 'macro/place', page: page.id, macro: inp.macro, x: spot.x, y: spot.y, prefix };
  const setLoad: Command = { type: 'device/update', key: motorKey, patch: { load } };
  const base = apply(apply(project, place, { lib }), setLoad, { lib });
  const ctx = { project: base, lib, stock, bom: computeBom(base, lib) };
  const feeder: Feeder | undefined = sizeProject(ctx).find((f) => f.load === motorKey);
  commands.push(place, setLoad);
  const summary = [newPageNo ? t('New power page {page} (page {from} has no free room)', { page: newPageNo, from: newPageNo - 1 }) : '', t('Motor starter from the library on page {page}', { page: pageNo }), t('Motor {des}: {kw} kW, {starter}', { des: motorKey, kw: inp.powerKw, starter: inp.starter === 'star-delta' ? t('star-delta start') : t('direct on line') })].filter(Boolean);
  claims.push({ text: t('The starter is the library macro {id}: {parts}.', { id: inp.macro.id, parts: syms.map((s) => s.designation).join(', ') }), source: { kind: 'library', ref: inp.macro.id } });
  claims.push({ text: t('Motor {des}: {kw} kW, {starter}.', { des: motorKey, kw: inp.powerKw, starter: inp.starter === 'star-delta' ? t('star-delta start') : t('direct on line') }), source: { kind: 'suggestion', ref: t('stated in your request; confirm against the nameplate') } });
  if (inp.assumed.length) claims.push({ text: t('Assumed, not stated: {what}. Confirm from the motor nameplate.', { what: inp.assumed.join(', ') }), source: { kind: 'suggestion', ref: t('assumption') } });
  const report: Record<string, unknown> = { page: pageNo, ...(newPageNo ? { newPage: true, note: `page ${newPageNo - 1} had no free room, so the starter is on a new power page ${newPageNo}` } : {}), motor: motorKey, devices: syms.map((s) => s.designation), at: spot };
  let sized = false;
  if (feeder && feeder.ib !== undefined) {
    sized = true;
    const batch: Command[] = [];
    claims.push({ text: t('Design current Ib = {ib} A (computed from the load data).', { ib: Math.round(feeder.ib * 100) / 100 }), source: { kind: 'suggestion', ref: t('from the stated data; confirm before use') } });
    const lines: Record<string, unknown>[] = [];
    for (const l of feeder.lines) {
      lines.push({ role: l.role, subject: l.subject, status: l.status, requirement: l.requirement?.text, part: l.proposal?.option?.part.code, availability: l.proposal?.option?.availability });
      if (l.status === 'change' && l.proposal?.option) {
        const cmd = lineCommands(ctx, l, undefined, feeder.ib);
        if (cmd) batch.push(cmd);
        summary.push(`${l.subject || l.role}: ${l.proposal.option.part.code}`);
        claims.push({ text: `${l.requirement?.text ?? ''} → ${l.proposal.option.part.code}`.trim(), source: { kind: 'library', ref: l.proposal.option.part.code } });
        for (const a of l.requirement?.assumptions ?? []) if (!claims.some((c) => c.text === a)) claims.push({ text: a, source: { kind: 'standard', ref: 'IEC 60364-5-52 / 60364-4-43 / 60947' } });
      } else if (l.status === 'change' && l.proposal?.xs) {
        const cmd = lineCommands(ctx, l, undefined, feeder.ib);
        if (cmd) batch.push(cmd);
        summary.push(t('wires: {xs} mm²', { xs: l.proposal.xs }));
      } else if (l.status === 'unavailable' || l.status === 'missing') summary.push(`${l.subject || l.role}: ${l.status === 'missing' ? t('data missing') : t('nothing in the library meets the requirement')}`);
    }
    report.sizing = { ib: feeder.ib, lines };
    // The sizing commands were made against `base`; they apply after the placement in the same batch.
    commands.push(...batch);
  } else report.sizing = { skipped: true, missing: feeder?.missing ?? ['current'], note: 'ratings are not guessed: state the nameplate current, or cos phi and efficiency' };
  if (!sized) claims.push({ text: t('No ratings proposed: the nameplate current, or cos φ and efficiency, are needed. I do not guess ratings.'), source: { kind: 'suggestion', ref: t('confirm before use') } });
  else claims.push({ text: SIZING_NOTE(), source: { kind: 'suggestion', ref: t('confirm before use') } });
  const label = `AI: ${inp.starter === 'star-delta' ? 'star-delta' : 'DOL'} starter ${inp.powerKw} kW`;
  const proposal: Proposal = { label, commands: [{ type: 'batch', label, commands }], summary, page: page.id };
  return { ok: true, proposal, claims, report };
}
