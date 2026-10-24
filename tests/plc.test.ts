// PLC racks and cards (M5): addressing schemes, the I/O overview, edits as commands, tag lists (export,
// parse, round trip, import preview) and the PLC address check on cards.
import { describe, expect, it } from 'vitest';
import { runChecks } from '@shared/checks';
import { createHistory, exec, undo } from '@shared/commands/history';
import { parseProject, serializeProject } from '@shared/file';
import { reportTable } from '@shared/reports';
import { REPORT_IDS } from '@shared/model/types';
import { canonicalAddress, cardFromPart, exportTags, formatAddress, nextSlot, parseAddress, parseTags, planImport, plcChannels, tagList } from '@shared/plc';
import { builder } from './support/builder';
import { loadLibrary } from './support/library';
import { SAMPLES } from './support/samples';

const lib = loadLibrary();
const P = (x: number, y: number) => ({ x, y });

/** A project with a CPU, a DI card (8), a DO card (8) and an AI card (4) in rack 0; one input wired to a terminal. */
function rack() {
  const b = builder(lib, 'p', 'Press line');
  const pg = b.addPage('plc', { en: 'PLC' });
  const card = (des: string, type: 'cpu' | 'di' | 'do' | 'ai' | 'ao', slot: number, n: number, x: number) => b.box(pg, { variant: 'blackbox', x, y: 40, w: 40, designation: des, plc: { type, rack: '0', slot }, pitch: 10, pins: Array.from({ length: n }, (_, i): [string, 'left'] => [String(i), 'left']) });
  const cpu = card('-A1', 'cpu', 0, 0, 20);
  const di = card('-A2', 'di', 1, 8, 80);
  const dq = card('-A3', 'do', 2, 8, 160);
  const ai = card('-A4', 'ai', 3, 4, 240);
  return { b, pg, cpu, di, dq, ai };
}

describe('addresses', () => {
  it('parses and writes both notations; word addresses are bytes for Siemens and words for IEC', () => {
    expect(parseAddress('%I0.1', 'siemens')).toEqual({ area: 'I', size: 'X', byte: 0, bit: 1 });
    expect(parseAddress('%QX2.7', 'iec')).toEqual({ area: 'Q', size: 'X', byte: 2, bit: 7 });
    expect(parseAddress('IW64', 'siemens')?.byte).toBe(64);
    expect(parseAddress('%IW32', 'iec')?.byte).toBe(64);
    expect(parseAddress('hello', 'iec')).toBeUndefined();
    expect(parseAddress('I0.8', 'iec')).toBeUndefined();
    const a = parseAddress('Q3.2', 'siemens')!;
    expect(formatAddress(a, 'siemens')).toBe('Q3.2');
    expect(formatAddress(a, 'iec')).toBe('%QX3.2');
    expect(formatAddress(parseAddress('IW64', 'siemens')!, 'iec')).toBe('%IW32');
  });
  it('compares addresses in one spelling', () => {
    expect(canonicalAddress('%IX0.0')).toBe('I0.0');
    expect(canonicalAddress(' i0.0 ')).toBe('I0.0');
    expect(canonicalAddress('%IW32')).toBe('IW32');
  });
});

describe('assigning addresses by the scheme', () => {
  it('numbers each area in rack and slot order: bits per byte, two bytes per analog channel, configurable starts', () => {
    const { b } = rack();
    b.run({ type: 'plc/assign' });
    const rows = plcChannels(b.project, lib);
    expect(rows).toHaveLength(8 + 8 + 4);
    expect(rows.filter((r) => r.type === 'di').map((r) => r.address)).toEqual(['I0.0', 'I0.1', 'I0.2', 'I0.3', 'I0.4', 'I0.5', 'I0.6', 'I0.7']);
    expect(rows.filter((r) => r.type === 'do')[3].address).toBe('Q0.3');
    expect(rows.filter((r) => r.type === 'ai').map((r) => r.address)).toEqual(['IW64', 'IW66', 'IW68', 'IW70']);
    // Starts and the IEC style: a second digital card continues after the first; words count in words.
    b.run({ type: 'project/settings', settings: { plc: { style: 'iec', start: { di: 4, do: 0, ai: 64, ao: 64 } } } });
    b.run({ type: 'plc/assign', all: true });
    const again = plcChannels(b.project, lib);
    expect(again.find((r) => r.type === 'di')?.address).toBe('%IX4.0');
    expect(again.filter((r) => r.type === 'ai').map((r) => r.address)).toEqual(['%IW32', '%IW33', '%IW34', '%IW35']);
  });
  it('fills only empty addresses unless told to replace all, and keeps manual ones', () => {
    const { b, pg, di } = rack();
    b.run({ type: 'plc/channels', edits: [{ page: pg, el: di.id, pin: '1', patch: { address: 'I9.0' } }] });
    b.run({ type: 'plc/assign' });
    const r = plcChannels(b.project, lib).filter((x) => x.type === 'di');
    expect(r[0].address).toBe('I0.0');
    expect(r[1].address).toBe('I9.0');
    b.run({ type: 'plc/assign', all: true });
    expect(plcChannels(b.project, lib).filter((x) => x.type === 'di')[1].address).toBe('I0.1');
  });
  it('places a card from a library part: pins from its channel count, next free slot', () => {
    const part = lib.parts.get('generic-plc-di-16-24vdc')!;
    const el = cardFromPart(part, { id: 'x', x: 0, y: 0, rack: '0', slot: 3 })!;
    expect(el.pins).toHaveLength(16);
    expect(el.plc).toEqual({ type: 'di', rack: '0', slot: 3 });
    expect(cardFromPart(lib.parts.get('generic-plc-cpu-compact')!, { id: 'y', x: 0, y: 0, rack: '0', slot: 0 })?.pins).toHaveLength(0);
    expect(cardFromPart(lib.parts.get('generic-contactor-9a')!, { id: 'z', x: 0, y: 0, rack: '0', slot: 0 })).toBeUndefined();
    expect(nextSlot(rack().b.project, '0')).toBe(4);
  });
});

describe('the I/O overview', () => {
  it('lists every channel live: address, tag, comment, what it is wired to, page-column; edits are undoable', () => {
    const { b, pg, di } = rack();
    const t = b.place(pg, 'terminal', 40, 60, { designation: '-X2', rot: 90 });
    const right = ['1', '2'].map((id) => t.pin(id)).sort((p, q) => q.x - p.x)[0];
    b.wire(pg, [right, di.pin('0')]);
    b.run({ type: 'plc/assign' });
    b.run({ type: 'plc/channels', edits: [{ page: pg, el: di.id, pin: '0', patch: { tag: 'S1_Start', comment: 'Start button' } }] });
    const row = plcChannels(b.project, lib)[0];
    expect(row).toMatchObject({ address: 'I0.0', tag: 'S1_Start', comment: 'Start button', card: '-A2', rack: '0', slot: 1 });
    expect(row.connected).toMatch(/^-X2:/);
    expect(row.position).toMatch(/^1\./);
    // Edit in the overview = command; undo restores it.
    const h = exec(createHistory(b.project), { type: 'plc/channels', edits: [{ page: pg, el: di.id, pin: '0', patch: { address: 'I5.5', comment: '' } }] }, { lib });
    expect(plcChannels(h.present, lib)[0]).toMatchObject({ address: 'I5.5', comment: '' });
    expect(plcChannels(undo(h).present, lib)[0]).toMatchObject({ address: 'I0.0', comment: 'Start button' });
  });
  it('is a report page and a row in the workbook, in the drawing language', () => {
    const { b } = rack();
    b.run({ type: 'plc/assign' });
    expect(REPORT_IDS).toContain('plcIo');
    const t = reportTable(b.project, lib, 'plcIo');
    expect(t.rows).toHaveLength(20);
    expect(t.headers[0]).toBe('Address');
    expect(t.rows[0].cells[3]).toBe('-A2:0');
    b.run({ type: 'project/settings', settings: { drawingLanguage: 'it' } });
    expect(reportTable(b.project, lib, 'plcIo').headers[0]).toBe('Indirizzo');
  });
  it('survives saving and opening (file format 5)', () => {
    const { b } = rack();
    b.run({ type: 'plc/assign' });
    const r = parseProject(serializeProject(b.project));
    expect(r.ok).toBe(true);
    if (r.ok) expect(plcChannels(r.value, lib).map((x) => x.address)).toEqual(plcChannels(b.project, lib).map((x) => x.address));
  });
  it('the conveyor sample has a rack with assigned and tagged I/O', () => {
    const p = SAMPLES[0].build(lib);
    const rows = plcChannels(p, lib).filter((r) => r.tag);
    expect(rows.map((r) => `${r.address} ${r.tag}`)).toEqual(['I0.0 S0_EStop_OK', 'I0.1 S1_Start', 'I0.2 S2_Stop', 'Q0.0 KM1_Run', 'Q0.1 H1_Running']);
    expect(rows[1].connected).toMatch(/^\+DS-X2:|^-X2:/);
  });
});

describe('tag lists', () => {
  function tagged() {
    const { b, pg, di, dq, ai } = rack();
    b.run({ type: 'plc/assign' });
    b.run({ type: 'plc/channels', edits: [
      { page: pg, el: di.id, pin: '0', patch: { tag: 'S1_Start', comment: 'Start <button> & "go"' } },
      { page: pg, el: dq.id, pin: '0', patch: { tag: 'KM1_Run', comment: 'Contactor' } },
      { page: pg, el: ai.id, pin: '0', patch: { tag: 'B1_Pressure' } },
    ] });
    return b.project;
  }
  it('writes a CODESYS global variable list with AT declarations (IEC notation, word indexes) and comments', () => {
    const text = exportTags(tagged(), lib, 'codesys');
    expect(text).toContain('VAR_GLOBAL');
    expect(text).toContain('END_VAR');
    expect(text).toContain('S1_Start AT %IX0.0 : BOOL; (* Start <button> & "go" *)');
    expect(text).toContain('KM1_Run AT %QX0.0 : BOOL;');
    expect(text).toContain('B1_Pressure AT %IW32 : WORD;');
    expect(text).toMatch(/In_0_1 AT %IX0\.1 : BOOL;/);
    expect(text).toMatch(/InW_70 AT %IW35 : WORD;/);
  });
  it('writes a TIA Portal tag table (Openness layout) with percent addresses in byte notation and escaped text', () => {
    const text = exportTags(tagged(), lib, 'tia');
    expect(text).toContain('<SW.Tags.PlcTagTable');
    expect(text).toContain('<LogicalAddress>%I0.0</LogicalAddress>');
    expect(text).toContain('<LogicalAddress>%IW64</LogicalAddress>');
    expect(text).toContain('<DataTypeName>Word</DataTypeName>');
    expect(text).toContain('Start &lt;button&gt; &amp; &quot;go&quot;');
    expect(text).toContain('<Name>S1_Start</Name>');
    const ids = [...text.matchAll(/ ID="([0-9A-F]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('makes names valid identifiers and unique', () => {
    const { b, pg, di } = rack();
    b.run({ type: 'plc/assign' });
    b.run({ type: 'plc/channels', edits: [{ page: pg, el: di.id, pin: '0', patch: { tag: '1 Start-Button' } }, { page: pg, el: di.id, pin: '1', patch: { tag: '1 Start-Button' } }] });
    const names = tagList(b.project, lib, 'tia').map((t) => t.name);
    expect(names[0]).toBe('_1_Start_Button');
    expect(names[1]).toBe('_1_Start_Button_2');
  });
  for (const format of ['tia', 'codesys'] as const) {
    it(`${format}: export then parse gives the same names, addresses and comments`, () => {
      const p = tagged();
      const parsed = parseTags(exportTags(p, lib, format), format);
      const list = tagList(p, lib, format);
      expect(parsed.map((x) => [x.name, x.address, x.comment])).toEqual(list.map((x) => [x.name, x.address, x.comment]));
      expect(parsed.length).toBe(20);
    });
    it(`${format}: importing an export of the same project changes nothing; a renamed tag and a new comment are previewed, applied in one undo step`, () => {
      const p = tagged();
      const same = planImport(p, lib, parseTags(exportTags(p, lib, format), format), format);
      expect(same.edits).toEqual([]);
      expect(same.rows.every((r) => r.status === 'same')).toBe(true);
      const text = exportTags(p, lib, format).replace('S1_Start', 'Start_PB').replace(format === 'tia' ? 'Contactor' : '(* Contactor *)', format === 'tia' ? 'Main contactor' : '(* Main contactor *)');
      const plan = planImport(p, lib, parseTags(text, format), format);
      expect(plan.rows.filter((r) => r.status === 'set').length).toBeGreaterThanOrEqual(2);
      expect(plan.edits.find((e) => e.patch.tag === 'Start_PB')).toBeTruthy();
      const h = exec(createHistory(p), { type: 'plc/channels', edits: plan.edits }, { lib });
      const rows = plcChannels(h.present, lib);
      expect(rows[0].tag).toBe('Start_PB');
      expect(rows.find((r) => r.tag === 'KM1_Run')?.comment).toBe('Main contactor');
      expect(plcChannels(undo(h).present, lib)[0].tag).toBe('S1_Start');
    });
  }
  it('imports addresses from the other notation and reports unknown and invalid ones', () => {
    const p = tagged();
    const text = 'VAR_GLOBAL\n  Pump AT %IX0.2 : BOOL; // Pump running\n  Ghost AT %IX9.0 : BOOL;\n  Wide AT %IW33 : WORD;\nEND_VAR\n';
    const plan = planImport(p, lib, parseTags(text, 'codesys'), 'codesys');
    expect(plan.rows.map((r) => r.status)).toEqual(['set', 'unmatched', 'set']);
    expect(plan.edits.find((e) => e.patch.tag === 'Wide')).toMatchObject({ pin: '1' });
    expect(parseTags('<nothing/>', 'tia')).toEqual([]);
    expect(planImport(p, lib, [{ name: 'x', address: 'banana', comment: '' }], 'tia').rows[0].status).toBe('invalid');
  });
});

describe('PLC address check on cards', () => {
  it('flags the same address on two channels, also across pages and in another spelling, and clears when one changes', () => {
    const { b, pg, di } = rack();
    b.run({ type: 'plc/assign' });
    const f0 = runChecks(b.project, lib).findings.filter((f) => f.rule === 'plc-address');
    expect(f0).toEqual([]);
    b.run({ type: 'plc/channels', edits: [{ page: pg, el: di.id, pin: '3', patch: { address: '%IX0.0' } }] });
    const f1 = runChecks(b.project, lib).findings.filter((f) => f.rule === 'plc-address');
    expect(f1).toHaveLength(1);
    expect(f1[0].element).toBe(di.id);
    // A channel symbol on another page with a card's address is a duplicate too.
    b.run({ type: 'plc/channels', edits: [{ page: pg, el: di.id, pin: '3', patch: { address: 'I0.3' } }] });
    const pg2 = b.addPage('plc', { en: 'Old' });
    b.place(pg2, 'plc-input', 50, 50, { value: 'I0.4' });
    expect(runChecks(b.project, lib).findings.filter((f) => f.rule === 'plc-address')).toHaveLength(1);
  });
  it('the three samples have no findings with their racks', () => {
    for (const s of SAMPLES) expect(runChecks(s.build(lib), lib).findings, s.file).toEqual([]);
  });
  it('file format: the PLC scheme is migrated into old files', () => {
    const { b } = rack();
    const v4 = JSON.parse(serializeProject(b.project)) as Record<string, unknown>;
    const { plc, ...settings } = v4.settings as Record<string, unknown>;
    void plc;
    const r = parseProject(JSON.stringify({ ...v4, version: 4, settings }));
    expect(r.ok && r.value.settings.plc.style).toBe('siemens');
    void P;
  });
});
