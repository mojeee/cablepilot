// Performance budget (CLAUDE.md, rule 7): a 500-page project loads, and a page with hundreds of
// objects renders, within a sane budget. Budgets are generous so CI machines do not flake; they
// guard against accidental quadratic behaviour, not against small slowdowns.
import { describe, expect, it } from 'vitest';
import { pageNets } from '@shared/connectivity';
import { buildPage } from '@shared/draw/page';
import { parseProject, serializeProject } from '@shared/file';
import { buildIndex } from '@shared/geometry/spatial';
import { renumberWires } from '@shared/wires';
import { reportTable } from '@shared/reports';
import { apply } from '@shared/commands';
import { checkStats, runChecks } from '@shared/checks';
import { changedPages, makeSnapshot } from '@shared/revisions';
import { builder } from './support/builder';
import { loadLibrary } from './support/library';

const lib = loadLibrary();

function bigProject(pages: number, perPage: number) {
  const b = builder(lib, 'big', 'Big');
  const ids: string[] = [];
  for (let i = 0; i < pages; i++) ids.push(b.addPage(i % 2 ? 'control' : 'power', { en: `Page ${i + 1}` }));
  // Batch the symbol placement for speed: build elements directly.
  const sym = ['coil', 'fuse', 'contact-no', 'lamp', 'terminal'];
  for (const id of ids) {
    const els = [];
    for (let n = 0; n < perPage; n++) {
      const x = 40 + (n % 20) * 18, y = 40 + Math.floor(n / 20) * 30;
      els.push({ id: `s${n}`, kind: 'symbol' as const, symbolId: sym[n % sym.length], x, y, rot: 0 as const, mirror: false, designation: `-K${n + 1}` });
      els.push({ id: `w${n}`, kind: 'wire' as const, points: [{ x, y: y + 5 }, { x, y: y + 12 }], number: String(n) });
    }
    b.run({ type: 'el/add', page: id, elements: els });
  }
  return b.project;
}

describe('performance budget', () => {
  const project = bigProject(500, 100); // 500 pages, 50,000 elements
  it('serialises, parses and validates a 500-page project within 8 s', () => {
    const t0 = performance.now();
    const text = serializeProject(project);
    const r = parseProject(text);
    const ms = performance.now() - t0;
    expect(r.ok).toBe(true);
    expect(ms).toBeLessThan(8000);
  });
  it('renders one 200-object page (primitives and spatial index) within 250 ms', () => {
    const t0 = performance.now();
    const built = buildPage(project, project.pages[250], lib, 250);
    const idx = buildIndex(built.items);
    const ms = performance.now() - t0;
    expect(built.items.length).toBe(200);
    expect(idx.size).toBe(200);
    expect(ms).toBeLessThan(250);
  });
  it('computes the nets of a page with 100 symbols and 100 wires within 250 ms', () => {
    const t0 = performance.now();
    const nets = pageNets(project, project.pages[10], lib);
    expect(performance.now() - t0).toBeLessThan(250);
    expect(nets.length).toBeGreaterThan(50);
  });
  it('picking in the spatial index is fast', () => {
    const built = buildPage(project, project.pages[1], lib, 1);
    const idx = buildIndex(built.items);
    const t0 = performance.now();
    for (let i = 0; i < 10000; i++) idx.at(40 + (i % 300), 40 + (i % 150), 1);
    expect(performance.now() - t0).toBeLessThan(250);
  });
  it('numbers the wires of 500 pages and builds the wire list within 20 s, then redoes one page edit within 2 s', () => {
    const t0 = performance.now();
    const numbered = renumberWires(project, lib);
    reportTable(numbered, lib, 'wires');
    const nums = numbered.pages.reduce((a, pg) => a + pg.elements.filter((e) => e.kind === 'wire' && e.number !== undefined).length, 0);
    const ms = performance.now() - t0;
    
    expect(nums).toBeGreaterThan(20000);
    expect(ms).toBeLessThan(20000);
    // Incremental: after one page changes only that page's nets are recomputed.
    const t1 = performance.now();
    const edited = apply(numbered, { type: 'el/add', page: numbered.pages[7].id, elements: [{ id: 'x1', kind: 'wire', points: [{ x: 5, y: 5 }, { x: 5, y: 30 }] }] }, { lib });
    reportTable(edited, lib, 'wires');
    expect(performance.now() - t1).toBeLessThan(2000);
  });
  it('checks 500 pages within 20 s, then rechecks one page edit incrementally within 2 s', () => {
    // Unique designations per page so the project is clean apart from loose wire ends.
    const pages = project.pages.map((pg, i) => ({ ...pg, elements: pg.elements.map((e) => (e.kind === 'symbol' ? { ...e, designation: `-K${i * 100 + Number(e.id.slice(1)) + 1}` } : e)) }));
    const clean = { ...project, pages };
    const t0 = performance.now();
    const first = runChecks(clean, lib);
    expect(first.findings.length).toBeGreaterThan(0);
    expect(performance.now() - t0).toBeLessThan(20000);
    const t1 = performance.now();
    const before = checkStats.pages;
    const edited = apply(clean, { type: 'el/add', page: clean.pages[7].id, elements: [{ id: 'x2', kind: 'wire', points: [{ x: 5, y: 5 }, { x: 5, y: 30 }] }] }, { lib });
    const second = runChecks(edited, lib);
    expect(checkStats.pages - before).toBe(1);
    expect(second.findings.length).toBe(first.findings.length + 1);
    expect(performance.now() - t1).toBeLessThan(2000);
  });
  it('issues a revision on 500 pages and finds the one changed page within 20 s', () => {
    const t0 = performance.now();
    const issued = apply(project, { type: 'revision/issue', revision: { number: '0', date: '2026-01-01', description: 'x', drawn: '', checked: '', approved: '', status: 'approval' } }, { lib });
    expect(issued.revisions[0].pages).toHaveLength(500);
    const edited = apply(issued, { type: 'el/add', page: issued.pages[9].id, elements: [{ id: 'x3', kind: 'text', x: 5, y: 5, rot: 0, text: 'x', size: 3, align: 'left' }] }, { lib });
    expect(changedPages(edited, lib).map((c) => c.id)).toEqual([issued.pages[9].id]);
    expect(performance.now() - t0).toBeLessThan(20000);
    void makeSnapshot;
  });
});
