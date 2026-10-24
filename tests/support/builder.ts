// A small builder for projects in tests and for the sample projects: everything goes through the
// same commands the app uses, and pin positions come from the symbol library.
import { apply, type Command } from '@shared/commands';
import { pinWorld } from '@shared/draw/symbol';
import { idGen } from '@shared/ids';
import type { Library } from '@shared/library/types';
import { newPage, newProject } from '@shared/model/defaults';
import type { LText, Page, Project, ProjectSettings, Pt, Rot, SymbolEl, WarningSign } from '@shared/model/types';
import type { PageType, SheetSize } from '@shared/sheets';

export interface PlaceOpts {
  rot?: Rot;
  mirror?: boolean;
  designation?: string;
  auto?: boolean;
  location?: string;
  functionText?: LText;
  value?: string;
}

export function builder(lib: Library, projectId: string, name: string, settings: Partial<ProjectSettings> = {}) {
  let project: Project = newProject(projectId, name, settings);
  const nid = idGen('e');
  const pid = idGen('p');
  const run = (c: Command) => {
    project = apply(project, c, { lib });
  };
  const api = {
    get project() { return project; },
    run,
    set(patch: { name?: string; properties?: Record<string, string>; assembly?: Record<string, string> }) { run({ type: 'project/set', ...patch }); },
    addPage(type: PageType, title: LText, opts: { size?: SheetSize; location?: string; function?: string; elements?: Page['elements'] } = {}): string {
      const id = pid();
      run({ type: 'page/add', page: { ...newPage(id, type, title, opts.size ?? project.settings.defaultSize), ...(opts.location ? { location: opts.location } : {}), ...(opts.function ? { function: opts.function } : {}), elements: opts.elements ?? [] } });
      return id;
    },
    place(page: string, symbolId: string, x: number, y: number, o: PlaceOpts = {}) {
      const id = nid();
      const element: SymbolEl = { id, kind: 'symbol', symbolId, x, y, rot: o.rot ?? 0, mirror: o.mirror ?? false, designation: o.designation ?? '', ...(o.location ? { location: o.location } : {}), ...(o.functionText ? { functionText: o.functionText } : {}), ...(o.value ? { value: o.value } : {}) };
      run({ type: 'symbol/place', page, element, autoNumber: o.auto !== false && !o.designation });
      const def = lib.symbols.get(symbolId);
      if (!def) throw new Error(`unknown symbol ${symbolId}`);
      const placed = project.pages.find((p) => p.id === page)?.elements.find((e) => e.id === id) as SymbolEl;
      return {
        id,
        get designation() { return (project.pages.find((p) => p.id === page)?.elements.find((e) => e.id === id) as SymbolEl).designation; },
        pin(pinId: string): Pt {
          const p = pinWorld(def, placed).find((q) => q.id === pinId);
          if (!p) throw new Error(`${symbolId} has no pin ${pinId}`);
          return { x: p.x, y: p.y };
        },
      };
    },
    wire(page: string, points: Pt[], o: { potential?: string; conductors?: number; number?: string } = {}): string {
      const id = nid();
      run({ type: 'wire/add', page, id, points, ...(o.potential ? { potential: o.potential } : {}), ...(o.conductors ? { conductors: o.conductors } : {}) });
      if (o.number) run({ type: 'el/update', page, id, patch: { number: o.number } });
      return id;
    },
    text(page: string, x: number, y: number, text: string, o: { size?: number; rot?: number; align?: 'left' | 'center' | 'right'; bold?: boolean } = {}) {
      run({ type: 'el/add', page, elements: [{ id: nid(), kind: 'text', x, y, rot: o.rot ?? 0, text, size: o.size ?? 3.5, align: o.align ?? 'left', ...(o.bold ? { bold: true } : {}) }] });
    },
    rect(page: string, x: number, y: number, w: number, h: number, o: { dashed?: boolean; label?: string } = {}) {
      run({ type: 'el/add', page, elements: [{ id: nid(), kind: 'rect', x, y, w, h, ...(o.dashed ? { dashed: true } : {}), ...(o.label ? { label: o.label } : {}) }] });
    },
    warning(page: string, x: number, y: number, sign: WarningSign, size = 12) {
      run({ type: 'el/add', page, elements: [{ id: nid(), kind: 'warning', x, y, size, sign }] });
    },
    nid,
  };
  return api;
}
