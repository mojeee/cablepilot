import { describe, expect, it } from 'vitest';
import { buildPage } from '@shared/draw/page';
import { hitTest, inRect, snapGrid, snapPoint } from '@shared/geometry/pick';
import { buildIndex } from '@shared/geometry/spatial';
import { builder } from './support/builder';
import { loadLibrary } from './support/library';

const lib = loadLibrary();
function setup() {
  const b = builder(lib, 'p', 'T');
  const pg = b.addPage('control', { en: 'C' });
  const k = b.place(pg, 'coil', 100, 100);
  const w = b.wire(pg, [{ x: 40, y: 40 }, { x: 80, y: 40 }]);
  b.rect(pg, 90, 80, 40, 40, { dashed: true });
  const page = b.project.pages[0];
  const built = buildPage(b.project, page, lib, 0);
  return { b, page, built, idx: buildIndex(built.items), k, w };
}

describe('picking and snapping', () => {
  it('hits a symbol, a wire near its line, and a dashed outline only on its border', () => {
    const { page, built, idx, k, w } = setup();
    expect(hitTest(page, built.items, idx, 100, 100, 1)).toBe(k.id);
    expect(hitTest(page, built.items, idx, 60, 41, 1.5)).toBe(w);
    expect(hitTest(page, built.items, idx, 60, 50, 1.5)).toBeNull();
    expect(hitTest(page, built.items, idx, 130, 110, 1.5)).toBe(page.elements[2].id);
    expect(hitTest(page, built.items, idx, 95, 85, 1.5)).toBeNull();
  });
  it('selects what lies inside a rubber band', () => {
    const { built, w } = setup();
    expect(inRect(built.items, [30, 30, 90, 50])).toEqual([w]);
  });
  it('snaps to pins before the grid, and to the grid otherwise', () => {
    const { page, k } = setup();
    expect(k).toBeTruthy();
    expect(snapPoint(page, lib, 101, 94, 3)).toMatchObject({ x: 100, y: 95, on: 'pin' });
    expect(snapPoint(page, lib, 61.3, 63.9, 3)).toEqual({ x: 62.5, y: 65, on: "grid" });
    expect(snapGrid(3.7)).toBe(2.5);
  });
});
