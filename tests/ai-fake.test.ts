// The built-in (fake) assistant: deterministic proposals built from the project with the app's own engines, each
// claim with its source, and an honest answer to anything it does not understand (rule 6).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { apply } from '@shared/commands';
import { designationsIn, fakeAnswer, FAKE_EXAMPLES } from '@shared/ai/fake';
import type { AiAnswer, AiRequest } from '@shared/ai/types';
import { runChecks } from '@shared/checks';
import { parseProject } from '@shared/file';
import { setLanguage } from '@shared/i18n';
import { idGen } from '@shared/ids';
import type { Project, SymbolEl, WireEl } from '@shared/model/types';
import { builder } from './support/builder';
import { loadLibrary } from './support/library';

const lib = loadLibrary();
const open = (name: string): Project => {
  const r = parseProject(readFileSync(join(__dirname, '..', 'samples', `${name}.cablepilot.json`), 'utf8'));
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};
const ask = (project: Project, prompt: string, pageId = project.pages[0]?.id ?? '', selection: string[] = []): AiAnswer => {
  const req: AiRequest = { prompt, lang: 'en', project, pageId, selection };
  return fakeAnswer(req, lib, idGen('n'));
};
const apps = (p: Project, a: AiAnswer): Project => apply(p, a.proposal!.commands.length === 1 ? a.proposal!.commands[0] : { type: 'batch', label: 'x', commands: a.proposal!.commands }, { lib });

function coilProject(extra?: (b: ReturnType<typeof builder>, pg: string) => void) {
  const b = builder(lib, 'p', 'T');
  const pg = b.addPage('control', { en: 'Control' });
  b.place(pg, 'coil', 60, 60, { designation: '-K1' });
  extra?.(b, pg);
  return { b, pg };
}

describe('built-in assistant: contacts', () => {
  it('proposes the contacts of a coil, one NO and one NC when the device has no part, labelled as a suggestion', () => {
    const { b } = coilProject();
    const a = ask(b.project, 'add contacts for -K1');
    expect(a.provider).toEqual({ id: 'built-in', fake: true });
    expect(a.proposal?.summary).toEqual(['NO contact -K1', 'NC contact -K1']);
    expect(a.claims.map((c) => c.source.kind)).toEqual(['project', 'suggestion']);
    const after = apps(b.project, a);
    const contacts = after.pages[0].elements.filter((e): e is SymbolEl => e.kind === 'symbol' && e.symbolId.startsWith('contact-'));
    expect(contacts.map((c) => [c.symbolId, c.designation])).toEqual([['contact-no', '-K1'], ['contact-nc', '-K1']]);
    // The coil has contacts now: the rule check's finding is gone.
    expect(runChecks(b.project, lib).findings.some((f) => f.rule === 'coil-no-contacts')).toBe(true);
    expect(runChecks(after, lib).findings.some((f) => f.rule === 'coil-no-contacts')).toBe(false);
  });
  it('uses the contact count of the device part when there is one, and says so (library)', () => {
    const { b } = coilProject((bb) => {
      bb.run({ type: 'part/embed', def: lib.parts.get('generic-contactor-25a')! });
      bb.run({ type: 'device/update', key: '-K1', patch: { parts: [{ part: 'generic-contactor-25a', qty: 1 }] } });
    });
    const a = ask(b.project, 'add contacts for -K1');
    expect(a.proposal?.summary).toHaveLength(2);
    expect(a.claims.some((c) => c.source.kind === 'library' && c.source.ref.includes('25'))).toBe(true);
  });
  it('does not add what is already there, and understands its own hint, "its contacts" with the coil selected, and Italian', () => {
    const { b, pg } = coilProject();
    const first = ask(b.project, 'add contacts for -K1');
    const after = apps(b.project, first);
    expect(ask(after, 'add contacts for -K1').proposal).toBeUndefined();
    const coil = b.project.pages[0].elements[0].id;
    expect(ask(b.project, 'add its contacts', pg, [coil]).proposal?.summary).toHaveLength(2);
    expect(ask(b.project, 'aggiungi i contatti di K1').proposal?.summary).toHaveLength(2);
    expect(ask(b.project, 'add contacts for -K9').proposal).toBeUndefined();
    expect(ask(b.project, 'add contacts').proposal).toBeUndefined();
  });
  it('is one undo step: the proposal is a single batch command', () => {
    const { b } = coilProject();
    const a = ask(b.project, 'add contacts for -K1');
    expect(a.proposal!.commands).toHaveLength(1);
    expect(a.proposal!.commands[0].type).toBe('batch');
    expect(a.proposal!.page).toBe(b.project.pages[0].id);
  });
});

describe('built-in assistant: wire numbers', () => {
  function wired() {
    const b = builder(lib, 'p', 'T');
    const pg = b.addPage('power', { en: 'Power' });
    b.wire(pg, [{ x: 10, y: 10 }, { x: 60, y: 10 }]);
    b.wire(pg, [{ x: 10, y: 30 }, { x: 60, y: 30 }]);
    return { b, pg };
  }
  it('proposes the automatic numbering for the page or the project, and nothing when it is done', () => {
    const { b, pg } = wired();
    const a = ask(b.project, 'number the wires on this page', pg);
    expect(a.proposal?.commands).toEqual([{ type: 'wire/renumber', page: pg }]);
    expect(a.claims[0].source.kind).toBe('project');
    const after = apps(b.project, a);
    expect(after.pages[0].elements.filter((e): e is WireEl => e.kind === 'wire').every((w) => !!w.number)).toBe(true);
    expect(ask(after, 'number the wires on this page', pg).proposal).toBeUndefined();
    expect(ask(b.project, 'number all the wires').proposal?.commands).toEqual([{ type: 'wire/renumber' }]);
    expect(ask(b.project, 'numera i fili di questa pagina', pg).proposal?.commands).toEqual([{ type: 'wire/renumber', page: pg }]);
  });
});

describe('built-in assistant: sizing', () => {
  it('sizes a feeder with the sizing engine: parts from the library, assumptions as standard claims, never an invented rating', () => {
    const p = open('conveyor');
    const bigger: Project = { ...p, devices: p.devices.map((d) => (d.designation === '+DS-M1' && d.load ? { ...d, load: { ...d.load, powerKw: 30 } } : d)) };
    const a = ask(bigger, 'size the feeder of -M1');
    expect(a.proposal).toBeTruthy();
    expect(a.proposal!.summary.length).toBeGreaterThan(0);
    expect(a.claims.some((c) => c.source.kind === 'library')).toBe(true);
    expect(a.claims.some((c) => c.source.kind === 'standard')).toBe(true);
    expect(a.claims[a.claims.length - 1]).toMatchObject({ source: { kind: 'suggestion' } });
    expect(a.claims[a.claims.length - 1].text).toMatch(/does not replace the engineer/);
    const after = apps(bigger, a);
    expect(after).not.toBe(bigger);
    expect(after.devices.find((d) => d.designation === '+DS-M1')?.parts.length).toBeGreaterThan(0);
  });
  it('proposes nothing when the feeder already meets its requirements, and says what is missing instead of guessing', () => {
    const p = open('conveyor');
    expect(ask(p, 'size the feeder of -M1').proposal).toBeUndefined();
    const noData: Project = { ...p, devices: p.devices.map((d) => (d.designation === '+DS-M1' && d.load ? { ...d, load: { kind: 'motor' as const, powerKw: 5.5 } } : d)) };
    const a = ask(noData, 'size the feeder of -M1');
    expect(a.proposal).toBeUndefined();
    expect(a.text).toMatch(/missing/);
    expect(ask(p, 'size the feeder of -M99').proposal).toBeUndefined();
  });
});

describe('built-in assistant: everything else', () => {
  it('says plainly that free-form requests need an API key and offers what it can do', () => {
    const p = open('conveyor');
    const a = ask(p, 'add a star-delta starter for a 7.5 kW motor on page 5');
    expect(a.proposal).toBeUndefined();
    expect(a.needsKey).toBe(true);
    expect(a.text).toMatch(/API key/);
    expect(a.examples).toEqual(FAKE_EXAMPLES);
    expect(a.provider.fake).toBe(true);
  });
  it('answers in the language of the request', () => {
    setLanguage('it');
    try {
      const a = fakeAnswer({ prompt: 'hello', lang: 'it', project: open('conveyor'), pageId: '', selection: [] }, lib);
      expect(a.text).toMatch(/chiave API/);
    } finally {
      setLanguage('en');
    }
  });
  it('finds designations in prompts', () => {
    expect(designationsIn('add contacts for -K1')).toEqual(['-K1']);
    expect(designationsIn('size the feeder of M12?')).toEqual(['-M12']);
    expect(designationsIn('number the wires')).toEqual([]);
  });
});
