// Layers: defaults mapped to the drawing style groups, on/off and lock, colour and line type applied to what is
// drawn, the commands, and the saved file.
import { describe, expect, it } from 'vitest';
import { apply } from '@shared/commands';
import { buildPage } from '@shared/draw/page';
import { createHistory, exec, undo } from '@shared/commands/history';
import { parseProject, serializeProject, MIGRATIONS } from '@shared/file';
import { BUILTIN_LAYER_IDS, defaultLayerOf, layerCounts, layersOf, selectableIds } from '@shared/layers';
import { builder } from './support/builder';
import { loadLibrary } from './support/library';

const lib = loadLibrary();

function sample() {
  const b = builder(lib, 'p', 'T');
  const pg = b.addPage('power', { en: 'P' });
  b.place(pg, 'coil', 60, 60);
  b.wire(pg, [{ x: 10, y: 10 }, { x: 40, y: 10 }]);
  b.run({ type: 'el/add', page: pg, elements: [{ id: 'ln', kind: 'line', points: [{ x: 0, y: 100 }, { x: 50, y: 100 }] }, { id: 'tx', kind: 'text', x: 5, y: 120, rot: 0, text: 'Hi', size: 3.5, align: 'left' }] });
  return { b, pg };
}
const ids = (p: ReturnType<typeof sample>['b']['project']) => p.pages[0].elements.map((e) => e.id);

describe('layers', () => {
  it('maps every element kind to a built-in layer', () => {
    expect(defaultLayerOf('symbol')).toBe('symbols');
    expect(defaultLayerOf('wire')).toBe('wires');
    expect(defaultLayerOf('line')).toBe('annotation');
    expect(defaultLayerOf('circle')).toBe('annotation');
    expect(defaultLayerOf('text')).toBe('text');
    expect(defaultLayerOf('report')).toBe('reports');
    expect(layersOf({}).map((l) => l.id)).toEqual([...BUILTIN_LAYER_IDS]);
  });
  it('counts the objects of the page per layer', () => {
    const { b } = sample();
    const c = layerCounts(b.project, b.project.pages[0]);
    expect(c.get('symbols')).toBe(1);
    expect(c.get('wires')).toBe(1);
    expect(c.get('annotation')).toBe(1);
    expect(c.get('text')).toBe(1);
  });
  it('a layer that is off is neither drawn nor selectable; a locked one is drawn but not selectable', () => {
    const { b, pg } = sample();
    const page = () => b.project.pages[0];
    const drawn = () => new Set(buildPage(b.project, page(), lib, 0).items.map((i) => i.id));
    expect(drawn().has('ln')).toBe(true);
    b.run({ type: 'layer/set', layer: { ...layersOf(b.project).find((l) => l.id === 'annotation')!, on: false } });
    expect(drawn().has('ln')).toBe(false);
    expect(drawn().has('tx')).toBe(true);
    expect(selectableIds(b.project, page()).has('ln')).toBe(false);
    b.run({ type: 'layer/set', layer: { ...layersOf(b.project).find((l) => l.id === 'annotation')!, on: true, locked: true } });
    expect(drawn().has('ln')).toBe(true);
    expect(selectableIds(b.project, page()).has('ln')).toBe(false);
    expect(selectableIds(b.project, page()).has('tx')).toBe(true);
    void pg;
  });
  it('a layer colour and line type replace the style for its elements only', () => {
    const { b } = sample();
    b.run({ type: 'layer/set', layer: { ...layersOf(b.project).find((l) => l.id === 'annotation')!, colour: '#ff0000', lineType: 'dashed' } });
    const prims = buildPage(b.project, b.project.pages[0], lib, 0).prims;
    const ln = prims.filter((p) => p.id === 'ln');
    expect(ln.length).toBeGreaterThan(0);
    for (const p of ln) {
      expect('c' in p && p.c).toBe('#ff0000');
      expect(p.k === 'poly' && p.dash).toBe(true);
    }
    expect(prims.filter((p) => p.id === 'tx').every((p) => !('c' in p) || p.c !== '#ff0000')).toBe(true);
  });
  it('user layers take elements by their layer field; removing the layer sends them back', () => {
    const { b, pg } = sample();
    b.run({ type: 'layer/set', layer: { id: 'u-cab', name: 'Cabinet', on: true, locked: false, lineType: 'continuous' } });
    b.run({ type: 'el/update', page: pg, id: 'ln', patch: { layer: 'u-cab' } });
    expect(layerCounts(b.project, b.project.pages[0]).get('u-cab')).toBe(1);
    b.run({ type: 'layer/set', layer: { id: 'u-cab', name: 'Cabinet', on: false, locked: false, lineType: 'continuous' } });
    expect(new Set(buildPage(b.project, b.project.pages[0], lib, 0).items.map((i) => i.id)).has('ln')).toBe(false);
    b.run({ type: 'layer/remove', id: 'u-cab' });
    expect(layersOf(b.project).some((l) => l.id === 'u-cab')).toBe(false);
    expect(layerCounts(b.project, b.project.pages[0]).get('annotation')).toBe(1);
    expect(ids(b.project)).toContain('ln');
  });
  it('layer changes undo', () => {
    const { b } = sample();
    let h = createHistory(b.project);
    h = exec(h, { type: 'layer/set', layer: { ...layersOf(b.project)[0], on: false } }, { lib });
    expect(layersOf(h.present)[0].on).toBe(false);
    h = undo(h);
    expect(layersOf(h.present)[0].on).toBe(true);
    void apply;
  });
  it('are saved with the project and read back', () => {
    const { b } = sample();
    b.run({ type: 'layer/set', layer: { ...layersOf(b.project).find((l) => l.id === 'wires')!, colour: '#00ff00', locked: true } });
    const text = serializeProject(b.project);
    const r = parseProject(text, MIGRATIONS);
    expect(r.ok).toBe(true);
    if (r.ok) expect(layersOf(r.value).find((l) => l.id === 'wires')).toMatchObject({ colour: '#00ff00', locked: true });
    // A project with no layer data (every older file) has the built-in layers with their defaults.
    expect(layersOf(JSON.parse(serializeProject(builder(lib, 'q', 'Q').project)))).toHaveLength(5);
  });
});
