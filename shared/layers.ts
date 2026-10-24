// Drawing layers (M6 part 2). The built-in layers map the drawing style's groups: symbols, wires, text,
// annotation (lines, rectangles, tables, images, warning signs) and reports. An element sits on the
// layer named in its `layer` field, else on the default layer of its kind. A layer can be switched off
// (not drawn, not printed), locked (cannot be selected or changed from the canvas), given a colour
// that replaces the drawing style's and a dashed line type. Layer data lives in `project.layers`
// (overrides and user layers only), changed by the `layer/set` and `layer/remove` commands.

import { t } from './i18n';
import type { El, Layer, Page, Project } from './model/types';
import type { Prim } from './draw/primitives';

export const BUILTIN_LAYER_IDS = ['symbols', 'wires', 'text', 'annotation', 'reports'] as const;

export function builtinLayers(): Layer[] {
  return [
    { id: 'symbols', name: t('Symbols'), on: true, locked: false, lineType: 'continuous' },
    { id: 'wires', name: t('Wires'), on: true, locked: false, lineType: 'continuous' },
    { id: 'text', name: t('Text'), on: true, locked: false, lineType: 'continuous' },
    { id: 'annotation', name: t('Annotation'), on: true, locked: false, lineType: 'continuous' },
    { id: 'reports', name: t('Reports and forms'), on: true, locked: false, lineType: 'continuous' },
  ];
}

/** The layer an element sits on when it names none. */
export function defaultLayerOf(kind: El['kind']): string {
  switch (kind) {
    case 'symbol': case 'box': case 'cab': return 'symbols';
    case 'wire': case 'junction': return 'wires';
    case 'text': return 'text';
    case 'report': case 'form': return 'reports';
    default: return 'annotation';
  }
}

/** Built-in layers with the project's overrides applied, then the user's own layers. */
export function layersOf(project: Pick<Project, 'layers'>): Layer[] {
  const over = new Map((project.layers ?? []).map((l) => [l.id, l]));
  const base = builtinLayers().map((l) => {
    const o = over.get(l.id);
    // A built-in layer keeps its (translated) name; only state, colour and line type are overridden.
    return o ? { ...l, on: o.on, locked: o.locked, lineType: o.lineType, ...(o.colour ? { colour: o.colour } : {}) } : l;
  });
  return [...base, ...(project.layers ?? []).filter((l) => !BUILTIN_LAYER_IDS.includes(l.id as (typeof BUILTIN_LAYER_IDS)[number]))];
}

/** Cabinet layout items: dimension lines, zones and covers are annotation; the rest (enclosure, plate, rails, ducts, devices) sit on the symbols layer. */
const defaultOf = (el: El): string => (el.kind === 'cab' && (el.item === 'dim' || el.item === 'zone' || el.item === 'cover') ? 'annotation' : defaultLayerOf(el.kind));
export const layerOf = (el: El): string => el.layer ?? defaultOf(el);

/** A lookup of layer states, built once per page build. An unknown layer id counts as the default layer of the kind. */
export function layerLookup(project: Pick<Project, 'layers'>): (el: El) => Layer {
  const all = new Map(layersOf(project).map((l) => [l.id, l]));
  return (el) => all.get(el.layer ?? '') ?? all.get(defaultOf(el))!;
}

/** The layer's colour and line type applied to an element's primitives. */
export function applyLayer(prims: Prim[], layer: Layer): Prim[] {
  if (!layer.colour && layer.lineType === 'continuous') return prims;
  return prims.map((p) => {
    if (p.k === 'image') return p;
    const q = { ...p, ...(layer.colour ? { c: layer.colour } : {}) } as Prim;
    if (layer.lineType === 'dashed' && (q.k === 'poly' || q.k === 'circle')) return { ...q, dash: true };
    return q;
  });
}

/** Ids of the elements of a page that can be selected: on a layer that is on and not locked. */
export function selectableIds(project: Project, page: Page): Set<string> {
  const look = layerLookup(project);
  const out = new Set<string>();
  for (const e of page.elements) {
    const l = look(e);
    if (l.on && !l.locked) out.add(e.id);
  }
  return out;
}

/** Elements grouped by layer id, for the layer palette's counts. */
export function layerCounts(project: Project, page: Page | undefined): Map<string, number> {
  const look = layerLookup(project);
  const m = new Map<string, number>();
  for (const e of page?.elements ?? []) m.set(look(e).id, (m.get(look(e).id) ?? 0) + 1);
  return m;
}
