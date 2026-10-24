// Revisions (M4): issuing, the pages changed since the last issue, the revision index of every sheet,
// comparing two revisions, the title-block revision field and the generated cover sheet.
import { describe, expect, it } from 'vitest';
import { createHistory, exec, undo } from '@shared/commands/history';
import { buildPage } from '@shared/draw/page';
import { parseProject, serializeProject } from '@shared/file';
import { changedPages, compareRevisions, makeSnapshot, nextRevisionNumber, pageRevision, revisionMatrix } from '@shared/revisions';
import { titleValue } from '@shared/titleblock';
import type { Prim } from '@shared/draw/primitives';
import { builder } from './support/builder';
import { loadLibrary } from './support/library';
import { SAMPLES } from './support/samples';

const lib = loadLibrary();
const rev = (number: string, date: string, status: 'proposal' | 'approval' | 'construction' | 'asBuilt' = 'approval') => ({ type: 'revision/issue' as const, revision: { number, date, description: `Rev ${number}`, drawn: 'AB', checked: 'CD', approved: 'EF', status } });
const texts = (prims: Prim[]) => prims.filter((p) => p.k === 'text').map((p) => (p.k === 'text' ? p.text : ''));

function base() {
  const b = builder(lib, 'p', 'Revision test');
  b.set({ properties: { client: 'ACME', drawn: 'XX' } });
  b.addPage('cover', { en: 'Cover sheet', it: 'Copertina' });
  const a = b.addPage('control', { en: 'Control' });
  const c = b.addPage('power', { en: 'Power' });
  const coil = b.place(a, 'coil', 50, 50, { designation: '-K1', functionText: { en: 'Main contactor' } });
  b.place(a, 'contact-no', 100, 50, { designation: '-K1' });
  b.wire(a, [P(50, 20), coil.pin('A1')], { number: '001' });
  b.place(c, 'mcb-3p', 80, 60, { designation: '-QF1' });
  b.parts(c, '-QF1', [['generic-mcb-3p-c32a', 1]]);
  return { b, a, c };
}
const P = (x: number, y: number) => ({ x, y });

describe('issuing and change detection', () => {
  it('numbers the revisions 0, 1, 2 and then letters when asked to continue a letter', () => {
    const { b } = base();
    expect(nextRevisionNumber(b.project)).toBe('0');
    b.run(rev('0', '2026-01-01'));
    expect(nextRevisionNumber(b.project)).toBe('1');
    b.run(rev('A', '2026-01-02'));
    expect(nextRevisionNumber(b.project)).toBe('B');
  });
  it('reports no change right after an issue, then the page that was edited, added or removed', () => {
    const { b, a } = base();
    expect(changedPages(b.project, lib)).toEqual([]); // nothing issued yet
    b.run(rev('0', '2026-01-01'));
    expect(changedPages(b.project, lib)).toEqual([]);
    b.text(a, 10, 10, 'new note');
    expect(changedPages(b.project, lib).map((c) => [c.title, c.status])).toEqual([['Control', 'changed']]);
    const added = b.addPage('data', { en: 'Data' });
    expect(changedPages(b.project, lib).map((c) => c.status).sort()).toEqual(['added', 'changed']);
    b.run({ type: 'page/remove', id: added });
    b.run({ type: 'page/remove', id: b.project.pages[1].id });
    expect(changedPages(b.project, lib).map((c) => c.status)).toEqual(['removed']);
  });
  it('sees a changed device part as a change of the BOM page', () => {
    const { b, c } = base();
    b.run({ type: 'page/add', page: { id: 'bom', type: 'bom', title: { en: 'BOM' }, size: 'A3', templateId: '', elements: [{ id: 'r', kind: 'report', x: 20, y: 20, report: 'bom', offset: 0, rows: 20 }] } });
    b.run(rev('0', '2026-01-01'));
    b.parts(c, '-QF1', [['generic-mcb-3p-c16a', 1]]);
    expect(changedPages(b.project, lib).map((x) => x.id).sort()).toEqual(['bom']);
  });
  it('is stable through saving and opening the file (key order does not matter)', () => {
    const { b } = base();
    b.run(rev('0', '2026-01-01'));
    const r = parseProject(serializeProject(b.project));
    expect(r.ok && changedPages(r.value, lib)).toEqual([]);
  });
  it('stores status, date and names, and fills the title block', () => {
    const { b } = base();
    b.run(rev('0', '2026-03-04', 'construction'));
    const p = b.project;
    expect(p.issueStatus).toBe('construction');
    expect(p.revisions[0]).toMatchObject({ number: '0', date: '2026-03-04', drawn: 'AB', checked: 'CD', approved: 'EF', status: 'construction' });
    expect(p.properties).toMatchObject({ revision: '0', issueDate: '2026-03-04', drawn: 'AB' });
    expect(p.revisions[0].pages).toHaveLength(3);
    expect(Object.keys(p.revisions[0].inventory.devices)).toContain('-K1');
  });
  it('undoes an issue and a status change', () => {
    const { b } = base();
    let h = createHistory(b.project);
    h = exec(h, rev('0', '2026-01-01'), { lib });
    expect(h.present.revisions).toHaveLength(1);
    h = exec(h, { type: 'issue/status', status: 'asBuilt' }, { lib });
    expect(h.present.issueStatus).toBe('asBuilt');
    h = undo(undo(h));
    expect(h.present.revisions).toHaveLength(0);
    expect(h.present.issueStatus).toBe('proposal');
  });
});

describe('revision index of every sheet', () => {
  it('marks the pages that changed in each revision and gives each sheet the last revision that changed it', () => {
    const { b, a, c } = base();
    b.run(rev('0', '2026-01-01'));
    b.text(a, 10, 10, 'changed in 1');
    b.run(rev('1', '2026-02-01'));
    b.text(c, 10, 10, 'changed in 2');
    b.run(rev('2', '2026-03-01'));
    const m = revisionMatrix(b.project);
    expect(m.map((x) => x.changed.size)).toEqual([3, 1, 1]);
    expect(pageRevision(b.project, a)).toBe('1');
    expect(pageRevision(b.project, c)).toBe('2');
    expect(pageRevision(b.project, b.project.pages[0].id)).toBe('0');
    expect(titleValue('revision', b.project, b.project.pages[1], 1)).toBe('1');
    expect(titleValue('revision', b.project, b.project.pages[2], 2)).toBe('2');
  });
  it('falls back to the project revision field before any issue', () => {
    const { b } = base();
    b.set({ properties: { revision: 'X' } });
    expect(titleValue('revision', b.project, b.project.pages[1], 1)).toBe('X');
  });
});

describe('comparing revisions', () => {
  it('lists added, removed and changed pages, devices, wires and parts', () => {
    const { b, a, c } = base();
    b.run(rev('0', '2026-01-01'));
    b.text(a, 10, 10, 'note');
    b.parts(c, '-QF1', [['generic-mcb-3p-c16a', 1]]);
    const k2 = b.place(a, 'coil', 50, 90, { designation: '-K2' });
    const k2c = b.place(a, 'contact-no', 100, 90, { designation: '-K2' });
    b.wire(a, [k2.pin('A2'), P(50, 130), P(100, 130), k2c.pin('1')], { number: '002' });
    b.run(rev('1', '2026-02-01'));
    const cmp = compareRevisions(b.project, lib, '0', '1')!;
    expect(cmp.pages.map((p) => [p.title, p.status])).toEqual([['Control', 'changed']]);
    expect(cmp.devices.map((d) => [d.key, d.status])).toEqual([['-K2', 'added'], ['-QF1', 'changed']]);
    expect(cmp.wires.some((w) => w.status === 'added' && w.key.startsWith('002'))).toBe(true);
    expect(cmp.parts.some((p) => p.status === 'added')).toBe(true);
    expect(cmp.parts.some((p) => p.status === 'removed')).toBe(true);
    // The working copy against the last revision: nothing; against revision 0: the same as 0 to 1.
    expect(compareRevisions(b.project, lib, '1', 'working')!.pages).toEqual([]);
    expect(compareRevisions(b.project, lib, '0', 'working')!.devices).toHaveLength(2);
    expect(compareRevisions(b.project, lib, '0', 'nope')).toBeUndefined();
    const same = compareRevisions(b.project, lib, '1', '1')!;
    expect([same.pages, same.devices, same.wires, same.parts]).toEqual([[], [], [], []]);
  });
  it('compares part quantities', () => {
    const { b, c } = base();
    b.run(rev('0', '2026-01-01'));
    b.run({ type: 'device/update', key: '-QF1', patch: { parts: [{ part: 'generic-mcb-3p-c32a', qty: 2 }] } });
    expect(compareRevisions(b.project, lib, '0', 'working')!.parts).toEqual([{ key: 'MCB-3P-C32A', status: 'changed', from: 1, to: 2 }].map((x) => ({ ...x, key: expect.any(String) })));
    void c;
    void makeSnapshot;
  });
});

describe('the generated cover sheet', () => {
  it('shows the sheet index with revisions, the revision list, the status boxes, the units and the approval block', () => {
    const { b, a } = base();
    b.run(rev('0', '2026-01-01', 'approval'));
    b.text(a, 10, 10, 'changed');
    b.run(rev('1', '2026-02-01', 'construction'));
    const cover = buildPage(b.project, b.project.pages[0], lib, 0);
    const t = texts(cover.prims);
    for (const s of ['Sheet index', 'Control', 'Power', 'Revisions', 'Rev 0', 'Rev 1', '2026-02-01', 'Issue status', 'For construction', 'As built', 'Units to build:', 'Customer approval', 'Signature']) expect(t, s).toContain(s);
    expect(t.filter((x) => x === 'x').length).toBe(4); // three pages in revision 0, one in revision 1
    // Italian drawing language.
    const it = { ...b.project, settings: { ...b.project.settings, drawingLanguage: 'it' as const } };
    const ti = texts(buildPage(it, it.pages[0], lib, 0).prims);
    expect(ti).toContain('Indice dei fogli');
    expect(ti).toContain('Approvazione del cliente');
    expect(ti).toContain('Per costruzione');
  });
  it('draws without any revision issued', () => {
    const { b } = base();
    expect(texts(buildPage(b.project, b.project.pages[0], lib, 0).prims)).toContain('Revisions');
  });
});

describe('sample projects carry their revisions', () => {
  it('the charger set has revisions 0 and 1, the changed page and nothing unissued', () => {
    const p = SAMPLES[2].build(lib);
    expect(p.revisions.map((r) => r.number)).toEqual(['0', '1']);
    expect(p.issueStatus).toBe('construction');
    expect(changedPages(p, lib)).toEqual([]);
    const cmp = compareRevisions(p, lib, '0', '1')!;
    expect(cmp.pages.filter((x) => x.status === 'changed').map((x) => x.title)).toContain('Uscita DC e batteria');
    expect(cmp.devices.map((d) => d.key)).toContain('+DS-G1');
    expect(cmp.parts.some((x) => x.from === 54 && x.to === 55)).toBe(true);
    const dc = p.pages.find((x) => x.title.en === 'DC output and battery')!;
    expect(pageRevision(p, dc.id)).toBe('1');
    expect(pageRevision(p, p.pages[2].id)).toBe('0');
  });
});
