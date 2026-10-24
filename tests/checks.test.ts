// The electrical rule check (rule 5): every rule has a positive and a negative case; fixes are plain
// commands that apply and undo; the check is incremental.
import { describe, expect, it } from 'vitest';
import { checkStats, fixAllCommands, parseContacts, runChecks, RULES, type Finding, type RuleId } from '@shared/checks';
import { findingDetail, findingText, fixText, ruleTitle, RULE_SOURCE } from '@shared/checkText';
import { createHistory, exec, undo } from '@shared/commands/history';
import { capacityOf, minCrossSection } from '@shared/ampacity';
import { getLanguage, setLanguage } from '@shared/i18n';
import type { Project } from '@shared/model/types';
import { builder } from './support/builder';
import { loadLibrary } from './support/library';

const lib = loadLibrary();
const of = (p: Project, rule: RuleId): Finding[] => runChecks(p, lib).findings.filter((f) => f.rule === rule);
const P = (x: number, y: number) => ({ x, y });
const setMethod = (b: ReturnType<typeof builder>, m = 'B1') => b.run({ type: 'project/settings', settings: { installationMethod: m } });

describe('duplicate designations', () => {
  it('flags the second coil with the same designation on the same kind of page, and renames it with one click', () => {
    const b = builder(lib, 'p', 'P');
    const a = b.addPage('control', { en: 'A' }), c = b.addPage('control', { en: 'B' });
    b.place(a, 'coil', 50, 50, { designation: '-K1' });
    b.place(c, 'coil', 50, 50, { designation: '-K1' });
    const f = of(b.project, 'duplicate-designation');
    expect(f).toHaveLength(1);
    expect(f[0].page).toBe(c);
    expect(f[0].fix?.args.to).toBe('-K2');
    const h = exec(createHistory(b.project), { type: 'batch', label: 'fix', commands: f[0].fix!.commands }, { lib });
    expect(of(h.present, 'duplicate-designation')).toEqual([]);
    expect(of(undo(h).present, 'duplicate-designation')).toHaveLength(1);
  });
  it('does not flag a coil and its contacts, or a device on a single-line and a multi-line page', () => {
    const b = builder(lib, 'p', 'P');
    const ct = b.addPage('control', { en: 'C' }), sl = b.addPage('singleLine', { en: 'S' }), pw = b.addPage('power', { en: 'P' });
    b.place(ct, 'coil', 50, 50, { designation: '-K1' });
    b.place(ct, 'contact-no', 90, 50, { designation: '-K1' });
    b.place(ct, 'contact-no', 120, 50, { designation: '-K1' });
    b.place(sl, 'contactor-1p', 50, 50, { designation: '-KM1' });
    b.place(pw, 'contactor-3p', 50, 50, { designation: '-KM1' });
    expect(of(b.project, 'duplicate-designation')).toEqual([]);
  });
});

describe('unconnected wire ends', () => {
  it('flags a wire in free space (with a remove fix) and a single free end (without)', () => {
    const b = builder(lib, 'p', 'P');
    const pg = b.addPage('control', { en: 'C' });
    const stray = b.wire(pg, [P(10, 10), P(10, 40)]);
    const coil = b.place(pg, 'coil', 100, 100, { designation: '-K1' });
    b.wire(pg, [P(100, 60), coil.pin('A1')]);
    const f = of(b.project, 'unconnected-wire');
    expect(f).toHaveLength(2);
    expect(f.find((x) => x.element === stray)?.fix?.id).toBe('remove-wire');
    expect(f.find((x) => x.element !== stray)?.fix).toBeUndefined();
    const h = exec(createHistory(b.project), { type: 'batch', label: 'fix', commands: f.find((x) => x.element === stray)!.fix!.commands }, { lib });
    expect(of(h.present, 'unconnected-wire')).toHaveLength(1);
    expect(of(undo(h).present, 'unconnected-wire')).toHaveLength(2);
  });
  it('accepts ends on pins, on another wire (a T) and at a potential tag', () => {
    const b = builder(lib, 'p', 'P');
    const pg = b.addPage('control', { en: 'C' });
    const a = b.place(pg, 'coil', 50, 100, { designation: '-K1' });
    const k = b.place(pg, 'contact-no', 50, 150, { designation: '-K1' });
    b.wire(pg, [a.pin('A2'), k.pin('1')]);
    const tag = b.place(pg, 'potential-tag', 50, 40, { rot: 270, value: '24VDC' });
    b.wire(pg, [tag.pin('1'), a.pin('A1')]);
    b.place(pg, 'potential-tag', 90, 175, { rot: 180, value: '0V' });
    b.wire(pg, [k.pin('2'), P(50, 175), P(90, 175)]);
    expect(of(b.project, 'unconnected-wire')).toEqual([]);
  });
});

describe('coils and contacts', () => {
  it('flags a relay coil without contacts and a contact without a coil; accepts them together', () => {
    const b = builder(lib, 'p', 'P');
    const pg = b.addPage('control', { en: 'C' });
    b.place(pg, 'coil', 50, 50, { designation: '-K1' });
    b.place(pg, 'contact-no', 150, 50, { designation: '-K9' });
    expect(of(b.project, 'coil-no-contacts')).toHaveLength(1);
    expect(of(b.project, 'contact-no-coil')).toHaveLength(1);
    b.place(pg, 'contact-no', 90, 50, { designation: '-K1' });
    b.place(pg, 'coil', 190, 50, { designation: '-K9' });
    expect(of(b.project, 'coil-no-contacts')).toEqual([]);
    expect(of(b.project, 'contact-no-coil')).toEqual([]);
  });
  it('lets a power part count as the contacts of a coil, and does not ask a valve coil (class Y) for contacts', () => {
    const b = builder(lib, 'p', 'P');
    const ct = b.addPage('control', { en: 'C' }), pw = b.addPage('power', { en: 'P' });
    b.place(ct, 'coil', 50, 50, { designation: '-K1' });
    b.place(pw, 'contactor-3p', 50, 50, { designation: '-K1' });
    b.place(ct, 'coil', 90, 50, { designation: '-Y1' });
    expect(of(b.project, 'coil-no-contacts')).toEqual([]);
    b.place(pw, 'contact-nc', 120, 50, { designation: '-FR9' });
    b.place(pw, 'overload-relay-3p', 160, 50, { designation: '-FR9' });
    expect(of(b.project, 'contact-no-coil')).toEqual([]);
  });
});

describe('contacts used against contacts available', () => {
  const setup = (part: string, contacts: ('contact-no' | 'contact-nc')[]) => {
    const b = builder(lib, 'p', 'P');
    const pg = b.addPage('control', { en: 'C' });
    b.place(pg, 'coil', 50, 50, { designation: '-K1' });
    contacts.forEach((s, i) => b.place(pg, s, 90 + i * 30, 50, { designation: '-K1' }));
    b.parts(pg, '-K1', [[part, 1]]);
    return b.project;
  };
  it('parses contact counts', () => {
    expect(parseContacts('1 NO + 1 NC')).toEqual({ no: 1, nc: 1, co: 0 });
    expect(parseContacts('2 CO').co).toBe(2);
  });
  it('flags more contacts than the parts provide', () => expect(of(setup('generic-relay-interface-1co-24vdc', ['contact-no', 'contact-no']), 'contacts-exceeded')).toHaveLength(1));
  it('counts a changeover contact as one NO or one NC', () => {
    expect(of(setup('generic-relay-interface-2co-24vdc', ['contact-no', 'contact-nc']), 'contacts-exceeded')).toEqual([]);
    expect(of(setup('generic-relay-interface-2co-24vdc', ['contact-no', 'contact-no', 'contact-nc']), 'contacts-exceeded')).toHaveLength(1);
  });
  it('says nothing when no part states its contacts', () => expect(of(setup('generic-contactor-dc-2p-63a', ['contact-no', 'contact-no']), 'contacts-exceeded')).toEqual([]));
});

describe('potentials joined', () => {
  it('flags two potentials in one net, and across pages through interruption points', () => {
    const b = builder(lib, 'p', 'P');
    const pg = b.addPage('power', { en: 'P' });
    b.wire(pg, [P(10, 10), P(10, 30)], { potential: 'L1' });
    b.wire(pg, [P(10, 30), P(40, 30)], { potential: 'N' });
    expect(of(b.project, 'potential-conflict')).toHaveLength(1);
    const c = builder(lib, 'q', 'Q');
    const a1 = c.addPage('power', { en: 'A' }), a2 = c.addPage('power', { en: 'B' });
    const i1 = c.place(a1, 'interruption-point', 60, 30, { value: 'SIG' });
    const i2 = c.place(a2, 'interruption-point', 60, 30, { value: 'SIG' });
    c.wire(a1, [P(10, 30), i1.pin('1')], { potential: 'L1' });
    c.wire(a2, [P(10, 30), i2.pin('1')], { potential: 'N' });
    expect(of(c.project, 'potential-conflict')).toHaveLength(1);
  });
  it('accepts one potential and unrelated nets', () => {
    const b = builder(lib, 'p', 'P');
    const pg = b.addPage('power', { en: 'P' });
    b.wire(pg, [P(10, 10), P(10, 30)], { potential: 'L1' });
    b.wire(pg, [P(10, 30), P(40, 30)], { potential: 'L1' });
    b.wire(pg, [P(10, 50), P(40, 50)], { potential: 'N' });
    expect(of(b.project, 'potential-conflict')).toEqual([]);
  });
});

describe('conductor cross-section against the protective device (IEC 60364-5-52)', () => {
  function circuit(method: string | null, wireType?: string) {
    const b = builder(lib, 'p', 'P');
    const pg = b.addPage('power', { en: 'P' });
    const q = b.place(pg, 'mcb-3p', 100, 60, { designation: '-QF1' });
    b.parts(pg, '-QF1', [['generic-mcb-3p-c32a', 1]]);
    if (method) setMethod(b, method);
    if (wireType) b.run({ type: 'project/wires', wireTypes: [{ id: wireType, type: 'H07V-K', crossSection: wireType.replace('mm2', ''), colour: 'BK' }] });
    const w = b.wire(pg, [q.pin('2'), P(q.pin('2').x, 120)]);
    if (wireType) b.run({ type: 'el/update', page: pg, id: w, patch: { wireType } });
    return { b, pg, w };
  }
  it('has the table helpers', () => {
    expect(capacityOf('B1', 6)).toBe(36);
    expect(capacityOf('B1', 0.75)).toBeUndefined();
    expect(minCrossSection('B1', 32)).toBe(6);
    expect(minCrossSection('B1', 500)).toBeUndefined();
  });
  it('flags a 1.5 mm² conductor on a 32 A breaker, shows assumptions, and fixes it with a wire type', () => {
    const { b } = circuit('B1');
    const f = of(b.project, 'cable-size');
    expect(f).toHaveLength(1);
    expect(f[0].args).toMatchObject({ xs: 1.5, rating: 32, min: 6, method: 'B1' });
    expect(findingDetail(f[0])).toContain('does not replace');
    const h = exec(createHistory(b.project), { type: 'batch', label: 'fix', commands: f[0].fix!.commands }, { lib });
    expect(of(h.present, 'cable-size')).toEqual([]);
    expect(h.present.wireTypes.some((w) => w.id === '6mm2-BK')).toBe(true);
    expect(of(undo(h).present, 'cable-size')).toHaveLength(1);
  });
  it('accepts a large enough conductor', () => expect(of(circuit('B1', '6mm2').b.project, 'cable-size')).toEqual([]));
  it('depends on the stated method: none stated skips the check and says so; a better method can pass', () => {
    const none = circuit(null).b.project;
    expect(of(none, 'cable-size')).toEqual([]);
    expect(of(none, 'method-missing')).toHaveLength(1);
    expect(of(circuit('B1', '4mm2').b.project, 'cable-size')).toHaveLength(1);
    expect(of(circuit('C', '4mm2').b.project, 'cable-size')).toEqual([]);
  });
  it('applies the ambient temperature and grouping of the supply data to the capacity', () => {
    const { b } = circuit('C', '4mm2'); // method C, 4 mm²: 32 A at 30 °C, enough for the 32 A breaker
    expect(of(b.project, 'cable-size')).toEqual([]);
    b.run({ type: 'project/settings', settings: { supply: { ...b.project.settings.supply, ambient: 40 } } }); // 32 * 0.87 = 27.84 A
    expect(of(b.project, 'cable-size')).toHaveLength(1);
  });
  it('checks the cores of a cable by the cable part', () => {
    const { b, pg, w } = circuit('B1', '6mm2');
    b.run({ type: 'part/embed', def: lib.parts.get('generic-cable-power-4x2.5mm2')! });
    b.run({ type: 'cable/set', cable: { id: '-W1', kind: 'multicore', part: 'generic-cable-power-4x2.5mm2' } });
    b.run({ type: 'el/update', page: pg, id: w, patch: { cable: '-W1', core: 'BN' } });
    expect(of(b.project, 'cable-size')).toHaveLength(1);
  });
});

describe('conductor colour against the potential type (IEC 60204-1, IEC 60445)', () => {
  function withClass(id: string, colour: string) {
    const b = builder(lib, 'p', 'P');
    const pg = b.addPage('power', { en: 'P' });
    b.run({ type: 'project/wires', wireClasses: b.project.wireClasses.map((c) => (c.id === id ? { ...c, colour } : c)) });
    b.wire(pg, [P(10, 10), P(10, 40)], { potential: id });
    return b.project;
  }
  it('flags a protective conductor that is not green-and-yellow, and fixes it', () => {
    const p = withClass('PE', 'BK');
    const f = of(p, 'colour-pe');
    expect(f).toHaveLength(1);
    const h = exec(createHistory(p), { type: 'batch', label: 'fix', commands: f[0].fix!.commands }, { lib });
    expect(of(h.present, 'colour-pe')).toEqual([]);
    expect(of(undo(h).present, 'colour-pe')).toHaveLength(1);
  });
  it('flags green-and-yellow on any other potential, and a neutral that is not blue', () => {
    expect(of(withClass('L1', 'GNYE'), 'colour-gnye')).toHaveLength(1);
    expect(of(withClass('N', 'BK'), 'colour-neutral')).toHaveLength(1);
  });
  it('accepts the default wire classes', () => {
    for (const id of ['PE', 'N', 'L1', '24VDC']) {
      const b = builder(lib, 'p', 'P');
      b.wire(b.addPage('power', { en: 'P' }), [P(10, 10), P(10, 40)], { potential: id });
      expect(runChecks(b.project, lib).findings.filter((x) => x.rule.startsWith('colour'))).toEqual([]);
    }
  });
});

describe('missing PE connection (IEC 60204-1 clause 8.2)', () => {
  it('flags live circuits with no PE, accepts a connected earth symbol or a PE wire', () => {
    const b = builder(lib, 'p', 'P');
    const pg = b.addPage('power', { en: 'P' });
    b.wire(pg, [P(10, 10), P(10, 40)], { potential: 'L1' });
    expect(of(b.project, 'missing-pe')).toHaveLength(1);
    const e = b.place(pg, 'earth-pe', 80, 60);
    expect(of(b.project, 'missing-pe')).toHaveLength(1);
    b.wire(pg, [e.pin('1'), P(80, 20)]);
    expect(of(b.project, 'missing-pe')).toEqual([]);
    const c = builder(lib, 'q', 'Q');
    const q = c.addPage('power', { en: 'P' });
    c.wire(q, [P(10, 10), P(10, 40)], { potential: 'L1' });
    c.wire(q, [P(30, 10), P(30, 40)], { potential: 'PE' });
    expect(of(c.project, 'missing-pe')).toEqual([]);
  });
  it('says nothing for a project without live circuits', () => {
    const b = builder(lib, 'p', 'P');
    b.addPage('power', { en: 'P' });
    expect(of(b.project, 'missing-pe')).toEqual([]);
  });
});

describe('wires on a terminal', () => {
  function strip(allowed?: string) {
    const b = builder(lib, 'p', 'P');
    const pg = b.addPage('terminals', { en: 'T' });
    const t = b.place(pg, 'terminal', 100, 100, { designation: '-X1' });
    b.wire(pg, [t.pin('1'), P(t.pin('1').x, 60)]);
    b.wire(pg, [t.pin('1'), P(60, t.pin('1').y)]);
    if (allowed) {
      const part = lib.parts.get('generic-terminal-feedthrough-4mm2')!;
      b.run({ type: 'part/embed', def: { ...part, id: 'two', data: { ...part.data, 'Conductors per connection': allowed } } });
      b.run({ type: 'device/update', key: '-X1', patch: { parts: [{ part: 'two', qty: 1 }] } });
    }
    return b.project;
  }
  it('flags two wires on a terminal that takes one', () => expect(of(strip(), 'terminal-wires')).toHaveLength(1));
  it('accepts two wires when the terminal part allows two', () => expect(of(strip('2'), 'terminal-wires')).toEqual([]));
});

describe('PLC addresses', () => {
  it('flags an address used on two channels, ignoring case, and accepts distinct ones', () => {
    const b = builder(lib, 'p', 'P');
    const pg = b.addPage('plc', { en: 'P' }), pg2 = b.addPage('plc', { en: 'Q' });
    b.place(pg, 'plc-input', 50, 50, { value: 'I0.0' });
    b.place(pg, 'plc-input', 50, 70, { value: 'I0.1' });
    expect(of(b.project, 'plc-address')).toEqual([]);
    b.place(pg2, 'plc-input', 50, 50, { value: 'i0.0' });
    const f = of(b.project, 'plc-address');
    expect(f).toHaveLength(1);
    expect(f[0].page).toBe(pg2);
  });
});

describe('one-click fixes together, texts and incremental checking', () => {
  it('fixes everything fixable in one batch, without two fixes taking the same choice', () => {
    const b = builder(lib, 'p', 'P');
    const a = b.addPage('control', { en: 'A' }), c = b.addPage('control', { en: 'B' }), d = b.addPage('control', { en: 'C' });
    for (const pg of [a, c, d]) b.place(pg, 'coil', 50, 50, { designation: '-K1' });
    b.wire(a, [P(10, 10), P(10, 40)]);
    const cmds = fixAllCommands(b.project, lib);
    const h = exec(createHistory(b.project), { type: 'batch', label: 'Fix all', commands: cmds }, { lib });
    expect(of(h.present, 'duplicate-designation')).toEqual([]);
    expect(of(h.present, 'unconnected-wire')).toEqual([]);
    expect(undo(h).present).toBe(b.project);
  });
  it('has a text, a title, a source and Italian for every rule', () => {
    const f: Finding = { id: 'x', rule: 'plc-address', severity: 'error', args: { address: 'I0.0', other: 'p', des: '-K1', used: '2 NO', have: '1 CO', potentials: 'L1, N', wire: '1', xs: 1.5, cap: 15.5, device: '-QF1', rating: 32, method: 'B1', min: 6, potential: 'PE', colour: 'BK', no: '1', n: 2, max: 1, stray: 0 } };
    const before = getLanguage();
    try {
      for (const lang of ['en', 'it'] as const) {
        setLanguage(lang);
        for (const rule of RULES) {
          const text = findingText({ ...f, rule }, { pageName: () => 'Page' });
          expect(text, `${lang} ${rule}`).not.toMatch(/\{\w+\}/);
          expect(text.length).toBeGreaterThan(10);
          expect(ruleTitle(rule).length).toBeGreaterThan(3);
          expect(RULE_SOURCE[rule]).toBeTruthy();
        }
        expect(fixText({ id: 'rename-designation', args: { to: '-K2' }, commands: [] })).toContain('-K2');
      }
    } finally {
      setLanguage(before);
    }
  });
  it('rechecks only the page that changed', () => {
    const b = builder(lib, 'p', 'P');
    const pages = Array.from({ length: 30 }, (_, i) => b.addPage('control', { en: `P${i}` }));
    pages.forEach((pg, i) => b.place(pg, 'coil', 50, 50, { designation: `-K${i + 1}` }));
    runChecks(b.project, lib);
    const edited = builder(lib, 'p', 'P');
    void edited;
    const next = { ...b.project, pages: b.project.pages.map((pg, i) => (i === 7 ? { ...pg, elements: [...pg.elements, { id: 'w9', kind: 'wire' as const, points: [P(5, 5), P(5, 30)] }] } : pg)) };
    const before = checkStats.pages;
    const r = runChecks(next, lib);
    expect(checkStats.pages - before).toBe(1);
    expect(r.findings.filter((x) => x.rule === 'unconnected-wire')).toHaveLength(1);
  });
});
