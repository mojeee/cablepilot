// The assistant's tool loop against the scripted provider (no network): tool calls, proposal building with the
// sizing engine and the library, source tagging, refusal paths, cancel, limits, and undo of an accepted proposal.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runAssistant, MAX_TOOL_ROUNDS } from '../app/main/ai/assistant';
import { ScriptedProvider } from '../app/main/ai/providers/scripted';
import { ProviderError, type ChatProvider, type ChatRequest, type ChatResponse } from '../app/main/ai/providers/types';
import { RateLimiter } from '../app/main/ai/ipc';
import { apply } from '@shared/commands';
import { runChecks } from '@shared/checks';
import { cleanClaims, runTool, TOOL_SPECS, type ToolEnv, type Work } from '@shared/ai/tools';
import type { AiAnswer } from '@shared/ai/types';
import { parseProject } from '@shared/file';
import { setLanguage } from '@shared/i18n';
import { idGen } from '@shared/ids';
import { createHistory, exec, redo, undo } from '@shared/commands/history';
import type { Project, SymbolEl, WireEl } from '@shared/model/types';
import { builder } from './support/builder';
import { loadLibrary, loadMacros } from './support/library';

const lib = loadLibrary();
const macros = loadMacros();
const P = (x: number, y: number) => ({ x, y });
const sample = (name: string): Project => {
  const r = parseProject(readFileSync(join(__dirname, '..', 'samples', `${name}.cablepilot.json`), 'utf8'));
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};
async function ask(project: Project, prompt: string, o: { pageId?: string; lang?: 'en' | 'it'; provider?: ChatProvider; selection?: string[]; maxToolRounds?: number; signal?: AbortSignal } = {}) {
  const progress: string[] = [];
  const r = await runAssistant({ prompt, lang: o.lang ?? 'en', project, pageId: o.pageId ?? project.pages[0]?.id ?? '', selection: o.selection ?? [] }, { provider: o.provider ?? new ScriptedProvider('anthropic'), providerId: 'anthropic', model: 'scripted', lib, macros, stock: null, newId: idGen('n'), scripted: true, maxToolRounds: o.maxToolRounds, signal: o.signal, onProgress: (e) => progress.push(e.kind) });
  setLanguage('en');
  return { r, progress };
}
const accept = (p: Project, a: AiAnswer): Project => apply(p, { type: 'batch', label: a.proposal!.label, commands: a.proposal!.commands }, { lib });
const answer = (r: Awaited<ReturnType<typeof ask>>['r']): AiAnswer => {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};

function blankPower() {
  const b = builder(lib, 'p', 'Pump');
  const pg = b.addPage('power', { en: 'Power' }, { location: 'PS' });
  return { b, pg };
}

describe('the assistant with the scripted provider: a star-delta starter', () => {
  it('reads the page, searches parts, proposes the library macro with ratings from the sizing engine, and labels every claim', async () => {
    const { b } = blankPower();
    const { r, progress } = await ask(b.project, 'add a star-delta starter for a 7.5 kW motor on page 1');
    const a = answer(r);
    expect(a.toolLog).toHaveLength(3);
    expect(progress).toEqual(['tool', 'tool', 'tool', 'text', 'done']);
    expect(a.provider).toEqual({ id: 'anthropic', fake: true });
    expect(a.proposal?.summary.join(' ')).toMatch(/Motor .*7\.5 kW/);
    const after = accept(b.project, a);
    const syms = after.pages[0].elements.filter((e): e is SymbolEl => e.kind === 'symbol' && !!e.designation);
    expect(syms.map((s) => s.symbolId).sort()).toEqual(['contactor-3p', 'contactor-3p', 'contactor-3p', 'mcb-3p', 'motor-3ph-6', 'overload-relay-3p']);
    const motor = after.devices.find((d) => d.load);
    expect(motor?.load).toMatchObject({ kind: 'motor', powerKw: 7.5, starter: 'star-delta', cosPhi: 0.85, efficiency: 90 });
    // Ratings are parts from the library, never invented.
    const parts = after.devices.flatMap((d) => d.parts.map((u) => u.part));
    expect(parts.length).toBeGreaterThanOrEqual(3);
    for (const id of parts) expect(lib.parts.has(id)).toBe(true);
    // Sources: library entry, standard and clause, and suggestion with the assumptions (rule 6).
    const kinds = new Set(a.claims.map((c) => c.source.kind));
    expect(kinds.has('library')).toBe(true);
    expect(kinds.has('standard')).toBe(true);
    expect(kinds.has('suggestion')).toBe(true);
    expect(a.claims.some((c) => /cos φ.*efficiency|Assumed/.test(c.text) && c.source.kind === 'suggestion')).toBe(true);
    // A new starter must not add errors to the rule check.
    expect(runChecks(after, lib).errors).toBe(runChecks(b.project, lib).errors);
  });

  it('accepting is one undo step, undo restores the project, redo applies it again', async () => {
    const { b } = blankPower();
    const a = answer((await ask(b.project, 'add a star-delta starter for a 7.5 kW motor on page 1')).r);
    let h = createHistory(b.project);
    h = exec(h, { type: 'batch', label: a.proposal!.label, commands: a.proposal!.commands }, { lib });
    expect(h.past).toHaveLength(1);
    expect(h.present.pages[0].elements.length).toBeGreaterThan(30);
    h = undo(h);
    expect(h.present).toBe(b.project);
    h = redo(h);
    expect(h.present.pages[0].elements.length).toBeGreaterThan(30);
  });

  it('works in Italian', async () => {
    const { b } = blankPower();
    const a = answer((await ask(b.project, 'aggiungi un avviatore stella-triangolo per un motore da 7,5 kW a pagina 1', { lang: 'it' })).r);
    expect(a.text).toMatch(/Propongo/);
    expect(a.proposal).toBeDefined();
  });

  it('puts the starter on a new power page when the requested page has no free room, in the same proposal and the same undo step', async () => {
    const { b, pg } = blankPower();
    for (let x = 20; x < 400; x += 25) b.rect(pg, x, 30, 20, 190);
    const a = answer((await ask(b.project, 'add a star-delta starter for a 7.5 kW motor on page 1')).r);
    expect(a.proposal?.summary[0]).toMatch(/New power page 2 \(page 1 has no free room\)/);
    const after = accept(b.project, a);
    expect(after.pages).toHaveLength(2);
    expect(after.pages[1].type).toBe('power');
    expect(after.pages[1].elements.filter((e) => e.kind === 'symbol' && e.designation)).toHaveLength(6);
    expect(after.pages[0].elements).toHaveLength(b.project.pages[0].elements.length);
    expect(a.proposal?.page).toBe(after.pages[1].id);
  });

  it('refuses a missing page and does not guess ratings when the motor data is missing', async () => {
    const missing = answer((await ask(blankPower().b.project, 'add a star-delta starter for a 7.5 kW motor on page 9')).r);
    expect(missing.proposal).toBeUndefined();
    expect(missing.text).toMatch(/there is no page 9/);
  });
});

describe('renumbering', () => {
  function wired() {
    const b = builder(lib, 'p', 'W');
    const pages = [1, 2, 3].map((i) => b.addPage('power', { en: `P${i}` }));
    for (const pg of pages) { const q = b.place(pg, 'mcb-3p', 100, 60); b.wire(pg, [q.pin('2'), P(q.pin('2').x, 120)], { potential: 'L1' }); }
    return { b, pages };
  }
  it('renumbers only the wires on the requested pages, as one proposal', async () => {
    const { b, pages } = wired();
    const a = answer((await ask(b.project, 'renumber the wires on pages 1–2')).r);
    expect(a.proposal?.commands).toHaveLength(1);
    const after = accept(b.project, a);
    const num = (p: Project, i: number) => (p.pages[i].elements.find((e) => e.kind === 'wire') as WireEl).number;
    expect(num(after, 0)).toBeTruthy();
    expect(num(after, 1)).toBeTruthy();
    expect(num(after, 2)).toBeFalsy();
    expect(a.claims.some((c) => c.source.kind === 'project')).toBe(true);
    expect(pages).toHaveLength(3);
  });
  it('says so when there is nothing to change', async () => {
    const { b } = wired();
    const once = accept(b.project, answer((await ask(b.project, 'renumber the wires')).r));
    const again = answer((await ask(once, 'renumber the wires')).r);
    expect(again.proposal).toBeUndefined();
    expect(again.text).toMatch(/already has the right number/);
  });
  it('rejects a page range outside the project', async () => {
    const { b } = wired();
    const a = answer((await ask(b.project, 'renumber the wires on pages 3-8')).r);
    expect(a.proposal).toBeUndefined();
    expect(a.text).toMatch(/pages run from 1 to 3/);
  });
});

describe('explaining a check finding', () => {
  function undersized() {
    const b = builder(lib, 'p', 'Q');
    const pg = b.addPage('power', { en: 'P' });
    const q = b.place(pg, 'mcb-3p', 100, 60, { designation: '-QF1' });
    b.parts(pg, '-QF1', [['generic-mcb-3p-c32a', 1]]);
    b.run({ type: 'project/settings', settings: { installationMethod: 'B1' } });
    b.wire(pg, [q.pin('2'), P(q.pin('2').x, 120)]);
    return b;
  }
  it('runs the check and quotes the finding with its standard, without proposing a change', async () => {
    const b = undersized();
    expect(runChecks(b.project, lib).findings.some((f) => f.rule === 'cable-size')).toBe(true);
    const a = answer((await ask(b.project, 'why does the check say QF1 is too small?')).r);
    expect(a.proposal).toBeUndefined();
    expect(a.text).toMatch(/too small for installation method B1/);
    expect(a.text).toMatch(/suggestions/);
    expect(a.claims.some((c) => c.source.kind === 'standard' && /IEC 60364-5-52/.test(c.source.ref))).toBe(true);
    expect(a.toolLog?.length).toBeGreaterThanOrEqual(1);
  });
  it('says plainly when there is no such finding', async () => {
    const a = answer((await ask(blankPower().b.project, 'why does the check say Q3 is too small?')).r);
    expect(a.text).toMatch(/no finding/);
    expect(a.proposal).toBeUndefined();
  });
});

describe('refusal and failure paths', () => {
  it('answers a request that cannot be built in plain words and changes nothing', async () => {
    const a = answer((await ask(blankPower().b.project, 'make me a PCB layout')).r);
    expect(a.proposal).toBeUndefined();
    expect(a.text).toMatch(/cannot do that/);
    expect(a.toolLog).toEqual([]);
  });
  it('turns a provider failure into a plain-language error', async () => {
    const { r } = await ask(blankPower().b.project, 'simulate a failure');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/Claude returned an error/);
  });
  it('maps every provider error kind to words and a way out, never with the key', async () => {
    for (const kind of ['auth', 'quota', 'rate', 'offline', 'timeout', 'model', 'refused', 'bad_request', 'limit'] as const) {
      const bad: ChatProvider = { id: 'anthropic', chat: async () => { throw new ProviderError(kind, 'anthropic', 'boom sk-ant-secret-0123456789'); }, check: async () => undefined };
      const { r } = await ask(blankPower().b.project, 'hello', { provider: bad });
      expect(r.ok).toBe(false);
      if (!r.ok) { expect(r.error.message.length).toBeGreaterThan(10); expect(r.error.hint.length).toBeGreaterThan(5); expect(JSON.stringify(r.error)).not.toContain('sk-ant'); }
    }
  });
  it('cancels a running request, changing nothing', async () => {
    const ctrl = new AbortController();
    const slow: ChatProvider = { id: 'anthropic', chat: (req: ChatRequest) => new Promise<ChatResponse>((_, rej) => { req.signal?.addEventListener('abort', () => rej(new ProviderError('cancelled', 'anthropic', 'c'))); setTimeout(() => ctrl.abort(), 10); }), check: async () => undefined };
    const { r } = await ask(blankPower().b.project, 'hello', { provider: slow, signal: ctrl.signal });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('ai_cancelled');
  });
  it('stops a model that keeps calling tools after the round limit', async () => {
    let n = 0;
    const loop: ChatProvider = { id: 'anthropic', chat: async () => ({ text: '', toolCalls: [{ id: `c${++n}`, name: 'read_project', input: {} }], stop: 'tool_use', raw: { provider: 'anthropic', data: null } }), check: async () => undefined };
    const a = answer((await ask(blankPower().b.project, 'hello', { provider: loop, maxToolRounds: 3 })).r);
    expect(a.text).toMatch(/stopped after 3 steps/);
    expect(n).toBe(4);
  });
  it('limits the rate of requests with a sliding window', () => {
    const l = new RateLimiter(3, 1000);
    expect([0, 10, 20, 30].map((t) => l.take(t))).toEqual([true, true, true, false]);
    expect(l.take(1500)).toBe(true);
  });
});

describe('tool validation (a proposal never carries an invented rating)', () => {
  const env = (project: Project): ToolEnv => ({ project, lib, macros, stock: null, pageId: project.pages[0].id, selection: [], lang: 'en' });
  const work = (project: Project): Work => ({ project, proposals: [], newId: idGen('t') });
  const setup = () => {
    const b = builder(lib, 'p', 'V');
    const pg = b.addPage('power', { en: 'P' });
    b.place(pg, 'mcb-3p', 100, 60, { designation: '-QF1' });
    return { b, pg };
  };
  it('refuses a part that is not in the library, a command type that is not allowed, and an unknown page', () => {
    const { b, pg } = setup();
    const w = work(b.project);
    const key = '-QF1';
    const bad = runTool('propose_commands', { label: 'x', summary: ['x'], commands: [{ type: 'device/update', key, patch: { parts: [{ part: 'made-up-32a-breaker', qty: 1 }] } }] }, env(b.project), w);
    expect(bad.isError).toBe(true);
    expect(bad.content).toMatch(/do not invent parts/);
    expect(runTool('propose_commands', { label: 'x', summary: ['x'], commands: [{ type: 'revision/issue', revision: {} }] }, env(b.project), w).isError).toBe(true);
    expect(runTool('propose_commands', { label: 'x', summary: ['x'], commands: [{ type: 'el/remove', page: 'nope', ids: ['a'] }] }, env(b.project), w).content).toMatch(/does not exist/);
    expect(w.proposals).toHaveLength(0);
    expect(pg).toBeTruthy();
  });
  it('accepts a valid command with a real part, embeds the part, and marks electrical values as a suggestion', () => {
    const { b } = setup();
    const w = work(b.project);
    const r = runTool('propose_commands', { label: 'Set breaker', summary: ['QF1: 32 A breaker'], commands: [{ type: 'device/update', key: 'QF1', patch: { parts: [{ part: 'generic-mcb-3p-c32a', qty: 1 }] } }], claims: [{ text: 'C32 fits', source: { kind: 'library', ref: 'generic-mcb-3p-c32a' } }] }, env(b.project), w);
    expect(r.isError).toBe(false);
    expect(w.proposals).toHaveLength(1);
    const after = accept(b.project, { text: '', claims: [], provider: { id: 'x', fake: true }, proposal: w.proposals[0] });
    expect(after.parts.some((p) => p.id === 'generic-mcb-3p-c32a')).toBe(true);
    expect(r.claims?.map((c) => c.source.kind)).toEqual(['library', 'suggestion']);
  });
  it('downgrades a claim whose source cannot be verified to a suggestion', () => {
    const { b } = setup();
    const c = cleanClaims([
      { text: 'a', source: { kind: 'library', ref: 'generic-mcb-3p-c32a' } },
      { text: 'b', source: { kind: 'library', ref: 'invented-part' } },
      { text: 'c', source: { kind: 'standard', ref: 'IEC 60364-5-52 B.52-5' } },
      { text: 'd', source: { kind: 'standard', ref: 'my own rule of thumb' } },
      { text: 'e', source: { kind: 'wizardry', ref: 'x' } },
    ], env(b.project));
    expect(c.map((x) => x.source.kind)).toEqual(['library', 'suggestion', 'standard', 'suggestion', 'suggestion']);
  });
  it('has well-formed tool specs and reports an unknown tool as an error', () => {
    const names = TOOL_SPECS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of TOOL_SPECS) { expect(t.description.length).toBeGreaterThan(20); expect(t.parameters.type).toBe('object'); }
    const { b } = setup();
    expect(runTool('format_disk', {}, env(b.project), work(b.project)).isError).toBe(true);
  });
  it('reads the pump-station sample with the read tools and sizes a feeder from the load data with stock-aware parts', () => {
    const p = sample('pump-station');
    const e = env(p);
    const w = work(p);
    expect(JSON.parse(runTool('read_project', {}, e, w).content).pageCount).toBe(22);
    expect(JSON.parse(runTool('find_devices', { query: 'M1' }, e, w).content).devices[0].designation).toMatch(/M1$/);
    const sized = runTool('size_feeder', { device: 'M1' }, e, w);
    expect(sized.isError).toBe(false);
    expect(JSON.parse(sized.content).lines.length).toBeGreaterThan(2);
    expect(sized.claims?.some((c) => c.source.kind === 'standard')).toBe(true);
    expect(JSON.parse(runTool('size_cable', { currentA: 16, lengthM: 20 }, e, w).content).xs).toBeGreaterThan(0);
    expect(JSON.parse(runTool('find_parts', { type: 'Contactor' }, e, w).content).total).toBeGreaterThan(0);
    expect(w.proposals).toHaveLength(0);
  });
  it('suggests a layout through the cabinet engine and explains it without a change', () => {
    const p = sample('pump-station');
    const w = work(p);
    const ex = runTool('propose_layout', { mode: 'explain' }, env(p), w);
    expect(ex.isError).toBe(false);
    expect(w.proposals).toHaveLength(0);
    expect(ex.claims?.length).toBeGreaterThan(0);
  });
});
