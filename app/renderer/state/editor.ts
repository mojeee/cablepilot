// The editor state (Zustand): the open project and its undo history, the selection, the active
// tool, files, autosave and PDF export. The project itself is pure data from /shared and changes
// only through commands (CLAUDE.md, Architecture): `exec` is the single door.

import { defaultLadder } from '@shared/ladder';
import { create } from 'zustand';
import { t, getLanguage } from '@shared/i18n';
import { apply, type Command } from '@shared/commands';
import { cardFromPart, exportTags, nextSlot, parseTags, planImport, TAG_FORMATS, type ImportPlan, type TagFormat } from '@shared/plc';
import { keyOf } from '@shared/devices';
import { createHistory, exec as execHistory, redo as redoHistory, undo as undoHistory, type History } from '@shared/commands/history';
import { MIGRATIONS, parseProject, projectFileName, serializeProject } from '@shared/file';
import { newId } from '@shared/ids';
import { makeLibrary, type Library, type MacroDef, type PartDef, type SymbolDef } from '@shared/library/types';
import { withPin } from '@shared/draw/box';
import { BOM_STOCK_COLUMNS, computeBom, bomToCsv } from '@shared/bom';
import { pickingList, withStock } from '@shared/stock';
import { toCsv } from '@shared/export/csv';
import { xlsxBytes } from '@shared/export/xlsx';
import { useStock } from './stock';
import { useChat } from './chat';
import { macroFromSelection } from '@shared/macros';
import { newPage, newProject } from '@shared/model/defaults';
import { pageById } from '@shared/model/queries';
import type { BoxEl, El, Page, Project, ReportId, WarningSign } from '@shared/model/types';
import { reportCsv, workbookBytes } from '@shared/export/lists';
import { dxfElements, writeDxf } from '@shared/export/dxf';
import { buildPage } from '@shared/draw/page';
import { adaptMove } from '@shared/cabinet/place';
import { layoutPageDxf } from '@shared/cabinet/dxf';
import { isLayoutPage } from '@shared/cabinet/model';
import { reportCapacity, reportPageCommands, reportSyncCommands } from '@shared/draw/report';
import { rt } from '@shared/reportText';
import { FORM_PRESETS } from '@shared/forms';
import { frameRect } from '@shared/draw/page';
import { templateOf } from '@shared/model/queries';
import { exportPdf } from '@shared/pdf';
import { fixAllCommands, runChecks, type Finding } from '@shared/checks';
import { sheetMm, type PageType, type SheetSize } from '@shared/sheets';
import { BUILTIN_MACROS, BUILTIN_PARTS, BUILTIN_SYMBOLS } from '../library';
import { rasterizeSvg } from '../render/svg';
import { loadPdfFonts } from '../render/fonts';
import { useUi } from './ui';

export type Tool = 'select' | 'wire' | 'symbol' | 'text' | 'table' | 'image' | 'warning';
export type Dialog = null | 'settings' | 'symbolEditor' | 'addPage' | 'shortcuts' | 'bom' | 'reports' | 'wires' | 'revisions' | 'plc' | 'sizing' | 'warehouse' | 'erp' | 'reservation' | 'history' | 'layout' | 'layout3d' | 'ai';

export interface Recovery {
  id: string;
  name: string;
  savedAt: string;
}

interface EditorState {
  history: History;
  /** The project as last saved or opened: `dirty` is "present differs from this". */
  saved: Project | null;
  filePath: string | null;
  pageId: string;
  selection: string[];
  tool: Tool;
  placing: string | null;
  warningSign: WarningSign;
  /** Potential and conductor count applied to new wires. */
  wirePotential: string;
  wireConductors: number;
  pendingImage: { assetId: string; w: number; h: number } | null;
  printPreview: boolean;
  clipboard: El[];
  companySymbols: SymbolDef[];
  companyParts: PartDef[];
  /** Built-in and company macros. */
  macros: MacroDef[];
  lib: Library;
  dialog: Dialog;
  recovery: Recovery[];
  /** The device the sizing dialog opens on (set from the properties panel); null: the whole project. */
  sizingFocus: string | null;
  /** The device the warehouse window picks a stock item for (M8 part 1); null: no device. */
  warehouseFocus: string | null;
  /** Asks the properties panel to focus its text field (after placing a text). */
  focusText: boolean;
  /** The device whose outline the next image file chosen becomes (M6 part 3). */
  outlineTarget: { page: string; id: string } | null;
  /** A hint for the status bar: what the active tool expects next. */
  hint: string;

  project(): Project;
  page(): Page | undefined;
  dirty(): boolean;
  exec(cmd: Command): void;
  undo(): void;
  redo(): void;
  select(ids: string[]): void;
  setPage(id: string): void;
  setTool(tool: Tool, placing?: string | null): void;
  setDialog(d: Dialog): void;
  setHint(h: string): void;
  patch(p: Partial<EditorState>): void;
  newProject(): void;
  openText(text: string, path: string | null, name: string): boolean;
  openFile(): Promise<void>;
  openSample(id: string): Promise<void>;
  save(saveAs?: boolean): Promise<void>;
  exportPdf(scope: 'all' | 'page'): Promise<void>;
  addPage(type: PageType, title: string, size: SheetSize, preset?: string, ladder?: boolean): void;
  /** Makes the current page a ladder page (rails and numbered rungs) or a normal page again (M8 part 2), one undo step. */
  setLadder(on: boolean): void;
  placeSymbol(symbolId: string, x: number, y: number, rot: 0 | 90 | 180 | 270, mirror: boolean): void;
  deleteSelection(): void;
  copy(): void;
  paste(): void;
  /** Copies the elements with these ids to a position offset by dx, dy (designations are numbered again), one undo step; selects the copies. */
  copyElements(ids: string[], dx: number, dy: number): void;
  insertElements(els: El[], dx: number, dy: number): void;
  placeBox(variant: 'blackbox' | 'connector', x: number, y: number): void;
  placeMacro(id: string, x: number, y: number): void;
  saveMacro(name: string): Promise<void>;
  exportBom(withStock?: boolean): Promise<void>;
  /** The warehouse picking list: what to take from which warehouse and location (CSV or XLSX). */
  exportPicking(kind: 'csv' | 'xlsx'): Promise<void>;
  renumberWires(): void;
  exportReportCsv(id: ReportId): Promise<void>;
  exportXlsx(): Promise<void>;
  exportDxf(): Promise<void>;
  /** Places a PLC card made from a library part (its designation, part, slot and addresses in one undo step). */
  placePlcCard(partId: string, x: number, y: number): void;
  exportTags(format: TagFormat): Promise<void>;
  /** Asks for a tag-list file and works out what importing it would change (nothing is applied). */
  readTags(format: TagFormat): Promise<{ name: string; plan: ImportPlan } | null>;
  importDxf(): Promise<void>;
  addReportPages(ids: ReportId[]): void;
  syncReportPages(): void;
  /** Applies every plain fix of the electrical rule check as one undo step. */
  fixAll(): void;
  /** Applies the fix of one finding. */
  fix(f: Finding): void;
  /** Shows a finding: its page, with the element selected. */
  goTo(f: Finding): void;
  loadCompany(): Promise<void>;
  checkRecovery(): Promise<void>;
  recover(id: string): Promise<void>;
  discardRecovery(id: string): Promise<void>;
  autosaveNow(): Promise<void>;
}

const msg = useUi.getState;

/** Rail potentials of a new ladder page: the project's DC control supply when it has one (the user can change the wires). */
export function ladderRails(p: Project): { left?: string; right?: string } {
  const pick = (ids: string[], kind: string) => ids.find((id) => p.potentials.some((x) => x.id === id)) ?? p.potentials.find((x) => x.kind === kind)?.id;
  return { left: pick(['24VDC'], 'dc-plus'), right: pick(['0V'], 'dc-minus') };
}

export function makePage(project: Project, type: PageType, title: string, size: SheetSize, presetId?: string): Page {
  const lang = project.settings.drawingLanguage;
  const page = newPage(newId('pg'), type, { [lang]: title }, size);
  // A layout page is drawn in real millimetres (M6 part 3): an empty front view the user draws the enclosure and plate on.
  if (type === 'layout') return { ...page, layout: { view: 'front', w: 1100, h: 1300 } };
  if (type === 'data') {
    const preset = FORM_PRESETS.find((p) => p.id === presetId) ?? FORM_PRESETS[0];
    const tpl = templateOf(project, page);
    const { w, h } = sheetMm(size);
    const f = frameRect(tpl, w, h);
    return { ...page, title: { [lang]: title || preset.title[lang] }, elements: [{ id: newId('f'), kind: 'form', x: f.fx + 10, y: f.fy + 8, w: 170, items: preset.items }] };
  }
  // Terminal, cable and BOM pages show their live report from the first row.
  const report: ReportId | undefined = type === 'terminals' ? 'terminals' : type === 'cables' ? 'cables' : type === 'bom' ? 'bom' : undefined;
  if (report) {
    const { w, h } = sheetMm(size);
    const f = frameRect(templateOf(project, page), w, h);
    const x = f.fx + 8, y = f.fy + 8;
    return { ...page, elements: [{ id: newId('r'), kind: 'report', x, y, report, offset: 0, rows: reportCapacity(project, page, report, y) }] };
  }
  return page;
}

function starterProject(): Project {
  const lang = getLanguage();
  const p = newProject(newId('prj'), t('Untitled project'), { drawingLanguage: lang });
  const tl = (s: string) => ({ [lang]: s });
  p.pages = [
    makePage(p, 'cover', tl(t('Cover sheet'))[lang], 'A3'),
    makePage(p, 'contents', tl(t('Contents'))[lang], 'A3'),
    makePage(p, 'power', tl(t('Power'))[lang], 'A3'),
  ];
  return p;
}

const freshHistory = (p: Project) => createHistory(p);

export const useEditor = create<EditorState>((set, get) => {
  const initial = starterProject();
  const ctx = () => ({ lib: get().lib });
  const flash = (severity: 'info' | 'warning' | 'error', text: () => string) => msg().addMessage(severity, text);
  const errMsg = (e: { message: string; hint: string }) => flash('error', () => `${e.message} ${e.hint}`);

  const withLoaded = (p: Project, path: string | null) => {
    void window.cablepilot.autosave.clear(get().project().id);
    useChat.getState().setHint(null);
    set({ history: freshHistory(p), saved: p, filePath: path, pageId: p.pages[0]?.id ?? '', selection: [], tool: 'select', placing: null });
  };

  return {
    history: freshHistory(initial),
    saved: initial,
    filePath: null,
    pageId: initial.pages[2].id,
    selection: [],
    tool: 'select',
    placing: null,
    warningSign: 'general',
    wirePotential: '',
    wireConductors: 1,
    pendingImage: null,
    printPreview: false,
    clipboard: [],
    companySymbols: [],
    companyParts: [],
    macros: BUILTIN_MACROS,
    lib: makeLibrary(BUILTIN_SYMBOLS, BUILTIN_PARTS),
    dialog: null,
    recovery: [],
    sizingFocus: null,
    warehouseFocus: null,
    focusText: false,
    outlineTarget: null,
    hint: '',

    project: () => get().history.present,
    page: () => pageById(get().history.present, get().pageId),
    dirty: () => get().history.present !== get().saved,

    exec: (cmd) => {
      // On a layout page a move snaps devices to rails and rails take their devices along.
      const h = execHistory(get().history, adaptMove(get().history.present, get().lib, cmd), ctx());
      if (h === get().history) return;
      const p = h.present;
      // Keep the selection to elements that still exist; keep the page if it still exists.
      const pg = pageById(p, get().pageId) ?? p.pages[0];
      const ids = new Set(pg?.elements.map((e) => e.id));
      set({ history: h, pageId: pg?.id ?? '', selection: get().selection.filter((id) => ids.has(id)) });
    },
    undo: () => {
      const h = undoHistory(get().history);
      if (h === get().history) return;
      const p = h.present;
      const pg = pageById(p, get().pageId) ?? p.pages[0];
      const ids = new Set(pg?.elements.map((e) => e.id));
      set({ history: h, pageId: pg?.id ?? '', selection: get().selection.filter((id) => ids.has(id)) });
    },
    redo: () => {
      const h = redoHistory(get().history);
      if (h === get().history) return;
      const p = h.present;
      const pg = pageById(p, get().pageId) ?? p.pages[0];
      const ids = new Set(pg?.elements.map((e) => e.id));
      set({ history: h, pageId: pg?.id ?? '', selection: get().selection.filter((id) => ids.has(id)) });
    },
    select: (selection) => set({ selection }),
    setPage: (pageId) => set({ pageId, selection: [] }),
    setTool: (tool, placing = null) => set({ tool, placing, selection: tool === 'select' ? get().selection : [], hint: '' }),
    setDialog: (dialog) => set({ dialog }),
    setHint: (hint) => set({ hint }),
    patch: (p) => set(p),

    newProject: () => {
      const p = starterProject();
      withLoaded(p, null);
      flash('info', () => t('New project created.'));
    },

    openText: (text, path, name) => {
      const r = parseProject(text, MIGRATIONS);
      if (!r.ok) {
        errMsg(r.error);
        return false;
      }
      withLoaded(r.value, path);
      // A sample has no file: name it by the project it holds, so the message always matches what opened.
      const shown = path ? name : r.value.name;
      flash('info', () => t('Opened {name}.', { name: shown }));
      return true;
    },
    openFile: async () => {
      const r = await window.cablepilot.files.open();
      if (!r.ok) return errMsg(r.error);
      if (r.value) get().openText(r.value.text, r.value.path, r.value.name);
    },
    openSample: async (id) => {
      const r = await window.cablepilot.samples.read(id);
      if (!r.ok) return errMsg(r.error);
      // A sample opens as an unsaved copy: Save asks where to put it.
      get().openText(r.value, null, id);
    },
    save: async (saveAs = false) => {
      const p = get().project();
      const text = serializeProject(p);
      const r = await window.cablepilot.files.save(text, saveAs ? null : get().filePath, projectFileName(p));
      if (!r.ok) return errMsg(r.error);
      if (!r.value) return;
      void window.cablepilot.history.backup(p.id, p.name, text);
      const { path, name } = r.value;
      set({ saved: p, filePath: path });
      void window.cablepilot.autosave.clear(p.id);
      flash('info', () => t('Saved {name}.', { name }));
    },
    exportPdf: async (scope) => {
      const p = get().project();
      const pageIds = scope === 'page' ? [get().pageId] : undefined;
      flash('info', () => t('Exporting PDF...'));
      let bytes: Uint8Array;
      try {
        bytes = await exportPdf(p, get().lib, { pageIds, rasterizeSvg, creator: 'CablePilot', fonts: await loadPdfFonts() });
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        return flash('error', () => t('The PDF could not be made: {detail}', { detail }));
      }
      const r = await window.cablepilot.files.exportPdf(bytes, projectFileName(p).replace(/\.cablepilot\.json$/, '.pdf'));
      if (!r.ok) return errMsg(r.error);
      if (r.value) {
        const { name } = r.value;
        flash('info', () => t('PDF exported to {name}.', { name }));
      }
    },

    addPage: (type, title, size, preset, ladder) => {
      const p = get().project();
      const page = makePage(p, type, title, size, preset);
      const at = Math.max(0, p.pages.findIndex((x) => x.id === get().pageId)) + 1;
      if (!ladder) get().exec({ type: 'page/add', page, index: at });
      else {
        // The ladder's line numbers follow the page's place in the set, so it is computed with the page inserted.
        const withPage = { ...p, pages: [...p.pages.slice(0, at), page, ...p.pages.slice(at)] };
        get().exec({ type: 'batch', label: 'add ladder page', commands: [{ type: 'page/add', page, index: at }, { type: 'page/ladder', id: page.id, ladder: defaultLadder(withPage, page), rails: ladderRails(p) }] });
      }
      set({ pageId: page.id, selection: [] });
    },
    setLadder: (on) => {
      const p = get().project();
      const pg = get().page();
      if (!pg) return;
      get().exec({ type: 'page/ladder', id: pg.id, ladder: on ? pg.ladder ?? defaultLadder(p, pg) : null, rails: ladderRails(p) });
    },

    placeBox: (variant, x, y) => {
      const pg = get().page();
      if (!pg) return;
      const id = newId('b');
      // A black box starts empty; a connector starts with four numbered pins on its right side.
      let el: BoxEl = { id, kind: 'box', variant, x, y, w: variant === 'connector' ? 15 : 40, h: variant === 'connector' ? 25 : 30, designation: '', pins: [], functionText: {} };
      if (variant === 'connector') for (let i = 1; i <= 4; i++) el = withPin(el, 'right', String(i));
      get().exec({ type: 'box/place', page: pg.id, autoNumber: true, element: el });
      const placed = get().page()?.elements.find((e) => e.id === id);
      const des = placed && placed.kind === 'box' ? placed.designation : '';
      const title = variant === 'connector' ? t('Connector') : t('Black box');
      flash('info', () => t('Placed {designation} ({symbol}).', { designation: des, symbol: title }));
      set({ selection: [id], tool: 'select', placing: null });
    },
    placeMacro: (macroId, x, y) => {
      const m = get().macros.find((q) => q.id === macroId);
      const pg = get().page();
      if (!m || !pg) return;
      const prefix = newId('mc');
      get().exec({ type: 'macro/place', page: pg.id, macro: m, x, y, prefix });
      const title = m.title[getLanguage()];
      flash('info', () => t('Placed macro {name}.', { name: title }));
      set({ selection: m.elements.map((_, i) => `${prefix}-${i + 1}`), tool: 'select', placing: null });
    },
    saveMacro: async (name) => {
      const pg = get().page();
      const clean = name.trim();
      if (!pg || !clean) return;
      const slug = clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'macro';
      const macro = macroFromSelection(pg, get().selection, { id: `company-${slug}`, title: { en: clean, it: clean } });
      if (!macro) return flash('warning', () => t('Select symbols, boxes or wires to save as a macro.'));
      const r = await window.cablepilot.company.save('macros', macro.id, JSON.stringify(macro, null, 2));
      if (!r.ok) return errMsg(r.error);
      await get().loadCompany();
      flash('info', () => t('Saved macro {name} to the company library.', { name: clean }));
    },
    exportBom: async (withStockColumns = false) => {
      const p = get().project();
      const stock = useStock.getState().stock;
      const bom = computeBom(p, get().lib);
      const csv = withStockColumns && stock
        ? bomToCsv(p, withStock(bom, stock, [...get().lib.parts.values(), ...p.parts.filter((x) => !get().lib.parts.has(x.id))]), p.settings.drawingLanguage, [...p.settings.bom.columns, ...BOM_STOCK_COLUMNS])
        : bomToCsv(p, bom);
      const r = await window.cablepilot.files.exportText(csv, projectFileName(p).replace(/\.cablepilot\.json$/, '-bom.csv'));
      if (!r.ok) return errMsg(r.error);
      if (r.value) {
        const { name } = r.value;
        flash('info', () => t('BOM exported to {name}.', { name }));
      }
    },

    exportPicking: async (kind) => {
      const p = get().project();
      const lang = p.settings.drawingLanguage;
      const rows = pickingList(computeBom(p, get().lib), useStock.getState().stock, [...get().lib.parts.values(), ...p.parts.filter((x) => !get().lib.parts.has(x.id))], lang);
      const base = projectFileName(p).replace(/\.cablepilot\.json$/, '-picking-list');
      const r = kind === 'csv'
        ? await window.cablepilot.files.exportText(toCsv(rows, lang), `${base}.csv`)
        : await window.cablepilot.files.exportBinary(xlsxBytes([{ name: 'Picking list', rows }]), `${base}.xlsx`);
      if (!r.ok) return errMsg(r.error);
      if (r.value) { const name = r.value.name; flash('info', () => t('Picking list exported to {name}.', { name })); }
    },

    renumberWires: () => {
      const before = get().project();
      get().exec({ type: 'wire/renumber' });
      const changed = get().project() !== before;
      flash(changed ? 'info' : 'warning', () => (changed ? t('Wires numbered.') : t('No wire numbers changed.')));
    },
    exportReportCsv: async (id) => {
      const p = get().project();
      const name = rt(p.settings.drawingLanguage, `report.${id}` as 'report.bom');
      const r = await window.cablepilot.files.exportText(reportCsv(p, get().lib, id), `${projectFileName(p).replace(/\.cablepilot\.json$/, '')}-${id}.csv`);
      if (!r.ok) return errMsg(r.error);
      if (r.value) { const file = r.value.name; flash('info', () => t('{list} exported to {name}.', { list: name, name: file })); }
    },
    exportXlsx: async () => {
      const p = get().project();
      const r = await window.cablepilot.files.exportBinary(workbookBytes(p, get().lib), projectFileName(p).replace(/\.cablepilot\.json$/, '.xlsx'));
      if (!r.ok) return errMsg(r.error);
      if (r.value) { const file = r.value.name; flash('info', () => t('Lists exported to {name}.', { name: file })); }
    },
    placePlcCard: (partId, x, y) => {
      const pg = get().page();
      const part = get().lib.parts.get(partId);
      if (!pg || !part) return;
      const p = get().project();
      const id = newId('b');
      const el = cardFromPart(part, { id, x, y, rack: '0', slot: nextSlot(p, '0') });
      if (!el) return;
      const place: Command = { type: 'box/place', page: pg.id, autoNumber: true, element: el };
      const trial = apply(p, place, { lib: get().lib }).pages.find((q) => q.id === pg.id)?.elements.find((e) => e.id === id);
      if (!trial || trial.kind !== 'box') return;
      const key = keyOf(pg, trial.designation, trial.location);
      get().exec({ type: 'batch', label: 'Place PLC card', commands: [{ type: 'part/embed', def: part }, place, { type: 'device/update', key, patch: { parts: [{ part: part.id, qty: 1 }] } }, { type: 'plc/assign' }] });
      const des = trial.designation;
      const title = part.title[getLanguage()];
      flash('info', () => t('Placed {designation} ({symbol}).', { designation: des, symbol: title }));
      set({ selection: [id], tool: 'select', placing: null });
    },
    exportTags: async (format) => {
      const p = get().project();
      const f = TAG_FORMATS.find((x) => x.id === format)!;
      const r = await window.cablepilot.files.exportText(exportTags(p, get().lib, format), `${projectFileName(p).replace(/\.cablepilot\.json$/, '')}-tags-${format}.${f.ext}`);
      if (!r.ok) return errMsg(r.error);
      if (r.value) { const file = r.value.name; flash('info', () => t('Tag list exported to {name}.', { name: file })); }
    },
    readTags: async (format) => {
      const f = TAG_FORMATS.find((x) => x.id === format)!;
      const r = await window.cablepilot.files.importTags(f.ext as 'xml' | 'txt');
      if (!r.ok) { errMsg(r.error); return null; }
      if (!r.value) return null;
      return { name: r.value.name, plan: planImport(get().project(), get().lib, parseTags(r.value.text, format), format) };
    },
    exportDxf: async () => {
      const p = get().project();
      const i = p.pages.findIndex((x) => x.id === get().pageId);
      if (i < 0) return;
      const pg = p.pages[i];
      // A layout page goes out at real size, one layer per kind of item.
      const text = isLayoutPage(pg) ? layoutPageDxf(p, pg, get().lib) : (() => { const built = buildPage(p, pg, get().lib, i); return writeDxf(built.prims, built.height); })();
      const r = await window.cablepilot.files.exportText(text, `${projectFileName(p).replace(/\.cablepilot\.json$/, '')}-${String(i + 1).padStart(2, '0')}.dxf`);
      if (!r.ok) return errMsg(r.error);
      if (r.value) { const file = r.value.name; flash('info', () => t('Page exported to {name}.', { name: file })); }
    },
    importDxf: async () => {
      const r = await window.cablepilot.files.importDxf();
      if (!r.ok) return errMsg(r.error);
      if (!r.value) return;
      const p = get().project();
      const size = p.settings.defaultSize;
      const page = newPage(newId('pg'), 'layout', { [p.settings.drawingLanguage]: r.value.name.replace(/\.dxf$/i, '') }, size);
      const f = frameRect(templateOf(p, page), sheetMm(size).w, sheetMm(size).h);
      const res = dxfElements(r.value.text, () => newId('e'), { x0: f.fx + 5, y0: f.fy + 5, maxW: f.fw - 10, maxH: f.fh - 50 });
      if (res.elements.length === 0) return flash('warning', () => t('The DXF file has no lines or texts this app can read.'));
      const at = Math.max(0, p.pages.findIndex((x) => x.id === get().pageId)) + 1;
      get().exec({ type: 'page/add', page: { ...page, elements: res.elements }, index: at });
      set({ pageId: page.id, selection: [] });
      const skipped = Object.values(res.skipped).reduce((a, b) => a + b, 0);
      const n = res.elements.length;
      flash(skipped ? 'warning' : 'info', () => (skipped ? t('Imported {n} graphics from the DXF; {skipped} other objects were skipped.', { n, skipped }) : t('Imported {n} graphics from the DXF.', { n })));
    },
    addReportPages: (ids) => {
      const p = get().project();
      const at = Math.max(0, p.pages.findIndex((x) => x.id === get().pageId)) + 1;
      const cmds = reportPageCommands(p, get().lib, ids, at);
      if (cmds.length === 0) return;
      get().exec({ type: 'batch', label: 'add report pages', commands: cmds });
      flash('info', () => t('Added {n} report pages.', { n: cmds.length }));
    },
    syncReportPages: () => {
      const cmds = reportSyncCommands(get().project(), get().lib);
      if (cmds.length === 0) return flash('info', () => t('All report pages are complete.'));
      get().exec({ type: 'batch', label: 'complete report pages', commands: cmds });
      flash('info', () => t('Added {n} report pages.', { n: cmds.length }));
    },

    fixAll: () => {
      const cmds = fixAllCommands(get().project(), get().lib);
      if (cmds.length === 0) return;
      const before = runChecks(get().project(), get().lib).findings.length;
      get().exec({ type: 'batch', label: 'Fix all', commands: cmds });
      const n = Math.max(0, before - runChecks(get().project(), get().lib).findings.length);
      flash('info', () => t('Fixed {n} findings in one undo step.', { n }));
    },
    fix: (f) => {
      if (f.fix) get().exec({ type: 'batch', label: 'Fix', commands: f.fix.commands });
    },
    goTo: (f) => {
      if (f.page && pageById(get().project(), f.page)) set({ pageId: f.page, selection: f.element ? [f.element] : [] });
    },

    placeSymbol: (symbolId, x, y, rot, mirror) => {
      if (symbolId.startsWith('plc:')) return get().placePlcCard(symbolId.slice(4), x, y);
      if (symbolId.startsWith('box:')) return get().placeBox(symbolId.slice(4) === 'connector' ? 'connector' : 'blackbox', x, y);
      if (symbolId.startsWith('macro:')) return get().placeMacro(symbolId.slice(6), x, y);
      const { lib } = get();
      const def = lib.symbols.get(symbolId);
      if (!def) return;
      const pg = get().page();
      if (!pg) return;
      const id = newId('s');
      const cmds: Command[] = [];
      if (!BUILTIN_SYMBOLS.some((s) => s.id === symbolId)) cmds.push({ type: 'symbol/embed', def });
      cmds.push({ type: 'symbol/place', page: pg.id, autoNumber: true, breakWires: true, element: { id, kind: 'symbol', symbolId, x, y, rot, mirror, designation: ''} });
      get().exec(cmds.length === 1 ? cmds[0] : { type: 'batch', label: 'place', commands: cmds });
      const placed = get().page()?.elements.find((e) => e.id === id);
      const des = placed && placed.kind === 'symbol' ? placed.designation : '';
      const title = def.title[getLanguage()];
      flash('info', () => (des ? t('Placed {designation} ({symbol}).', { designation: des, symbol: title }) : t('Placed {symbol}.', { symbol: title })));
      set({ selection: [id] });
      // Context hint (M6 part 2): a coil placed with a designation offers its contacts.
      if (def.function === 'coil' && des) useChat.getState().setHint({ text: t('Add the contacts of {des}?', { des }), prompt: `add contacts for ${des}` });
    },

    deleteSelection: () => {
      const { selection, pageId } = get();
      if (!selection.length) return;
      get().exec({ type: 'el/remove', page: pageId, ids: selection });
      set({ selection: [] });
    },
    copy: () => {
      const pg = get().page();
      if (!pg) return;
      const sel = new Set(get().selection);
      set({ clipboard: pg.elements.filter((e) => sel.has(e.id)) });
    },
    paste: () => {
      get().insertElements(get().clipboard, 5, 5);
    },
    copyElements: (ids, dx, dy) => {
      const pg = get().page();
      if (!pg) return;
      const sel = new Set(ids);
      get().insertElements(pg.elements.filter((e) => sel.has(e.id)), dx, dy);
    },
    insertElements: (clipboard, dx, dy) => {
      const { pageId } = get();
      if (!clipboard.length) return;
      const els = clipboard.map((e): El => {
        const id = newId('e');
        if (e.kind === 'wire' || e.kind === 'line') return { ...e, id, points: e.points.map((q) => ({ x: q.x + dx, y: q.y + dy })) };
        if (e.kind === 'symbol' || e.kind === 'box') return { ...e, id, x: e.x + dx, y: e.y + dy, designation: '' };
        return { ...e, id, x: (e as { x: number }).x + dx, y: (e as { y: number }).y + dy } as El;
      });
      // Pasted symbols are numbered automatically, one by one, so designations stay unique.
      const cmds: Command[] = els.map((e) => (e.kind === 'symbol' ? { type: 'symbol/place' as const, page: pageId, element: e, autoNumber: true } : e.kind === 'box' ? { type: 'box/place' as const, page: pageId, element: e, autoNumber: true } : { type: 'el/add' as const, page: pageId, elements: [e] }));
      get().exec({ type: 'batch', label: 'paste', commands: cmds });
      set({ selection: els.map((e) => e.id) });
    },

    loadCompany: async () => {
      const load = async <T,>(kind: 'symbols' | 'parts' | 'macros'): Promise<T[]> => {
        const r = await window.cablepilot.company.list(kind);
        const out: T[] = [];
        if (!r.ok) return out;
        for (const f of r.value) {
          try {
            out.push(JSON.parse(f.text) as T);
          } catch {
            // A damaged company file is skipped; the library check reports it.
          }
        }
        return out;
      };
      const [defs, parts, macros] = await Promise.all([load<SymbolDef>('symbols'), load<PartDef>('parts'), load<MacroDef>('macros')]);
      set({ companySymbols: defs, companyParts: parts, macros: [...BUILTIN_MACROS, ...macros], lib: makeLibrary([...BUILTIN_SYMBOLS, ...defs], [...BUILTIN_PARTS, ...parts]) });
    },

    checkRecovery: async () => {
      const r = await window.cablepilot.autosave.list();
      if (r.ok) set({ recovery: r.value.map((a) => ({ id: a.id, name: a.name, savedAt: a.savedAt })) });
    },
    recover: async (id) => {
      const r = await window.cablepilot.autosave.read(id);
      if (!r.ok) return errMsg(r.error);
      if (get().openText(r.value, null, id)) {
        set({ recovery: get().recovery.filter((x) => x.id !== id), saved: null });
        flash('warning', () => t('Recovered an autosaved copy. Save it to keep it.'));
      }
    },
    discardRecovery: async (id) => {
      await window.cablepilot.autosave.clear(id);
      set({ recovery: get().recovery.filter((x) => x.id !== id) });
    },
    autosaveNow: async () => {
      if (!get().dirty()) return;
      const p = get().project();
      const text = serializeProject(p);
      await window.cablepilot.autosave.write(p.id, p.name, get().filePath, text);
      // The first change of the day also keeps a daily backup in the project history (M8 part 2).
      await window.cablepilot.history.backup(p.id, p.name, text);
    },
  };
});
