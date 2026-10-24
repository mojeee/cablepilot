// Performance budget (CLAUDE.md, rule 7): a 500-page project loads, and a page with hundreds of
// objects renders, within a sane budget. Budgets are generous so CI machines do not flake; they
// guard against accidental quadratic behaviour, not against small slowdowns.
import { describe, expect, it } from 'vitest';
import { pageNets } from '@shared/connectivity';
import { buildPage } from '@shared/draw/page';
import { parseProject, serializeProject } from '@shared/file';
import { buildIndex } from '@shared/geometry/spatial';
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
});
