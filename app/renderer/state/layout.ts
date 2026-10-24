// The cabinet layout state (M6 part 3): the layout window's tab, the company's layout templates, and the
// operations that read or write files (exchange, DXF) or show a preview (a suggestion, an import). Every
// change to the project is a command through the editor, and every preview goes through the chat's
// proposal (Accept / Reject, one undo step).

import { create } from 'zustand';
import type { AiAnswer } from '@shared/ai/types';
import { t, getLanguage } from '@shared/i18n';
import { layoutCsv, layoutJson, exportLayout, parseLayoutCsv, parseLayoutJson, planDimsImport, planLayoutImport } from '@shared/cabinet/exchange';
import { cabinetOf } from '@shared/cabinet/model';
import { drillingDxf, layoutPageDxf, layoutViewsDxf } from '@shared/cabinet/dxf';
import { suggestLayout } from '@shared/cabinet/suggest';
import { isTemplate, loadTemplate, templateFromLayout, type LayoutTemplate } from '@shared/cabinet/templates';
import { projectFileName } from '@shared/file';
import { newId } from '@shared/ids';
import type { LayoutFileData } from '@shared/api';
import { columnIndex, guessMapping, type ColumnMapping, type StockField } from '@shared/stock';
import { useChat } from './chat';
import { useEditor } from './editor';
import { useStock } from './stock';
import { useUi } from './ui';

export type LayoutTab = 'devices' | 'structure' | 'suggestion' | 'templates' | 'exchange' | 'ducts';

const flash = (severity: 'info' | 'warning' | 'error', text: () => string) => useUi.getState().addMessage(severity, text);
const errMsg = (e: { message: string; hint: string }) => flash('error', () => `${e.message} ${e.hint}`);
const base = () => projectFileName(useEditor.getState().project()).replace(/\.cablepilot\.json$/, '');

interface LayoutState {
  tab: LayoutTab;
  templates: LayoutTemplate[];
  folder: { name: string; watching: boolean } | null;
  setTab(t: LayoutTab): void;
  suggest(): Promise<void>;
  loadTemplates(): Promise<void>;
  saveTemplate(title: string): Promise<void>;
  useTemplate(id: string): void;
  exportFile(kind: 'json' | 'csv'): Promise<void>;
  exportDxf(kind: 'views' | 'drilling' | 'page'): Promise<void>;
  importFile(): Promise<void>;
  importItemMaster(): Promise<void>;
  loadFolder(): Promise<void>;
  pickFolder(): Promise<void>;
  refreshFolder(auto?: boolean): Promise<void>;
  watch(on: boolean): Promise<void>;
}

/** The mapping for an item master: the company's saved warehouse mapping where its columns exist in this file, the guess from the header otherwise. */
function mappingFor(rows: string[][]): ColumnMapping {
  const saved = useStock.getState().mapping;
  const guess = guessMapping(rows);
  const columns: ColumnMapping['columns'] = { ...guess.columns };
  if (saved?.header) for (const [f, ref] of Object.entries(saved.columns) as [StockField, string][]) if (columnIndex(rows, saved, f) >= 0 && ref) columns[f] = ref;
  return { header: true, columns };
}

function show(text: string, answer: Omit<AiAnswer, 'provider'>): void {
  // The window closes so the preview on the canvas and the Accept button in the assistant panel are free.
  useEditor.getState().setDialog(null);
  useChat.getState().present(text, { ...answer, provider: { id: 'layout', fake: false } });
}

export const useLayout = create<LayoutState>((set, get) => {
  const preview = (data: LayoutFileData, source: string): void => {
    const ed = useEditor.getState();
    const parsed = data.ext === 'json' ? parseLayoutJson(data.text) : parseLayoutCsv(data.rows);
    if (!parsed.ok) return errMsg(parsed.error);
    const plan = planLayoutImport(ed.project(), ed.lib, parsed.value, () => newId('c'));
    const lines = [...plan.changes.slice(0, 14), ...(plan.changes.length > 14 ? [t('... and {n} more', { n: plan.changes.length - 14 })] : [])];
    const warn = plan.warnings.length ? ` ${plan.warnings.join(' ')}` : '';
    if (!plan.commands.length) return flash(plan.warnings.length ? 'warning' : 'info', () => t('{name}: nothing to change, the layout already matches.', { name: source }) + warn);
    show(t('Import layout {name}', { name: source }), {
      text: t('Preview of the import of {name}: {added} added, {moved} changed, {unchanged} unchanged. Accept to apply it as one undo step.', { name: source, added: plan.added, moved: plan.moved, unchanged: plan.unchanged }) + warn,
      claims: [{ text: t('The file is a layout in the documented format; devices are matched to the schematic by designation.'), source: { kind: 'project', ref: source } }],
      proposal: { label: 'Import layout', commands: plan.commands, summary: lines, page: plan.page },
    });
  };
  return {
    tab: 'devices',
    templates: [],
    folder: null,
    setTab: (tab) => set({ tab }),

    suggest: async () => {
      const ed = useEditor.getState();
      const sug = suggestLayout(ed.project(), ed.lib, { newId: () => newId('c') });
      if (!sug.commands.length) return flash('info', () => t('Every device is placed and nothing is left to arrange.'));
      const claims = sug.rules;
      show(t('Suggest a layout'), {
        text: t('Preview of a suggested layout: {summary}. Accept it, then edit it with the normal tools; what you move or lock stays put when you suggest again.', { summary: sug.summary.join('; ') }) + (sug.issues.length ? ` ${sug.issues.join(' ')}` : ''),
        claims,
        proposal: { label: 'Suggested layout', commands: sug.commands, summary: sug.summary.concat(sug.issues), page: sug.page },
      });
      ed.setDialog(null);
    },

    loadTemplates: async () => {
      const r = await window.cablepilot.company.list('layouts');
      if (!r.ok) return;
      const out: LayoutTemplate[] = [];
      for (const f of r.value) { try { const d = JSON.parse(f.text) as unknown; if (isTemplate(d)) out.push(d); } catch { /* A damaged file is skipped. */ } }
      set({ templates: out });
    },
    saveTemplate: async (title) => {
      const ed = useEditor.getState();
      const clean = title.trim() || t('Layout template');
      const slug = clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'layout';
      const tpl = templateFromLayout(ed.project(), ed.lib, `company-layout-${slug}`, clean);
      if (!tpl) return flash('warning', () => t('There is no enclosure on the layout to save as a template.'));
      const r = await window.cablepilot.company.save('layouts', tpl.id, JSON.stringify(tpl, null, 2));
      if (!r.ok) return errMsg(r.error);
      flash('info', () => t('Saved the layout "{name}" to the company library.', { name: clean }));
      await get().loadTemplates();
    },
    useTemplate: (id) => {
      const ed = useEditor.getState();
      const tpl = get().templates.find((x) => x.id === id);
      if (!tpl) return;
      const load = loadTemplate(ed.project(), ed.lib, tpl, () => newId('c'));
      if (!load.commands.length) return flash('warning', () => load.warnings.join(' '));
      ed.exec({ type: 'batch', label: 'Load layout template', commands: load.commands });
      ed.patch({ pageId: load.page, selection: [], dialog: null });
      flash('info', () => t('Layout template "{name}" loaded: {filled} devices took their place, {empty} places stay empty. Suggest a layout for the rest.', { name: tpl.title[getLanguage()], filled: load.filled, empty: load.empty }));
    },

    exportFile: async (kind) => {
      const ed = useEditor.getState();
      const file = exportLayout(ed.project(), ed.lib);
      if (!file.items.length) return flash('warning', () => t('There is no layout to export yet.'));
      const lang = ed.project().settings.drawingLanguage;
      const r = await window.cablepilot.files.exportText(kind === 'json' ? layoutJson(file) : layoutCsv(file, lang), `${base()}-layout.${kind}`);
      if (!r.ok) return errMsg(r.error);
      if (r.value) { const n = r.value.name; flash('info', () => t('Layout exported to {name}.', { name: n })); }
    },
    exportDxf: async (kind) => {
      const ed = useEditor.getState();
      const p = ed.project();
      const cab = cabinetOf(p);
      if (!cab.enclosure) return flash('warning', () => t('There is no layout to export yet.'));
      const page = ed.page();
      const text = kind === 'drilling' ? drillingDxf(p, ed.lib) : kind === 'views' || !page ? layoutViewsDxf(p, ed.lib) : layoutPageDxf(p, page, ed.lib);
      const r = await window.cablepilot.files.exportText(text, `${base()}-${kind === 'drilling' ? 'drilling' : 'layout'}.dxf`);
      if (!r.ok) return errMsg(r.error);
      if (r.value) { const n = r.value.name; flash('info', () => t('DXF exported to {name}.', { name: n })); }
    },

    importFile: async () => {
      const r = await window.cablepilot.layout.pick('layout');
      if (!r.ok) return errMsg(r.error);
      if (r.value) preview(r.value, r.value.name);
    },
    importItemMaster: async () => {
      const r = await window.cablepilot.layout.pick('itemMaster');
      if (!r.ok) return errMsg(r.error);
      if (!r.value) return;
      const ed = useEditor.getState();
      const plan = planDimsImport(ed.project(), ed.lib, r.value.rows, mappingFor(r.value.rows), useStock.getState().stock?.links ?? {});
      if (!plan.mapped) return flash('warning', () => t('The file needs columns for the part code, width, height and depth. Map them in the Warehouse window (the same mapping as the stock list).'));
      if (!plan.commands.length) return flash('info', () => t('No part changes: the sizes in the file match the parts ({skipped} rows skipped, {unmatched} codes not in the library).', { skipped: plan.skipped, unmatched: plan.unmatched.length }));
      const name = r.value.name;
      show(t('Sizes from {name}', { name }), {
        text: t('Preview of the sizes from the item master {name}: {n} parts change. {skipped} rows were skipped and {unmatched} codes match no part. Accept to apply it as one undo step.', { name, n: plan.changes.length, skipped: plan.skipped, unmatched: plan.unmatched.length }),
        claims: [{ text: t('Dimensions come from your item master through the column mapping of the warehouse.'), source: { kind: 'project', ref: name } }],
        proposal: { label: 'Sizes from the item master', commands: plan.commands, summary: plan.changes.slice(0, 14), page: cabinetOf(ed.project()).front?.id },
      });
    },
    loadFolder: async () => {
      const r = await window.cablepilot.layout.folder();
      if (r.ok) set({ folder: r.value });
    },
    pickFolder: async () => {
      const r = await window.cablepilot.layout.pickFolder();
      if (!r.ok) return errMsg(r.error);
      await get().loadFolder();
      if (r.value) preview(r.value, r.value.name);
    },
    refreshFolder: async (auto = false) => {
      const r = await window.cablepilot.layout.refresh();
      if (!r.ok) return errMsg(r.error);
      if (!r.value) return flash('info', () => t('No folder is chosen.'));
      if (auto) flash('info', () => t('The watched folder changed: {name}.', { name: r.value?.name ?? '' }));
      preview(r.value, r.value.name);
    },
    watch: async (on) => {
      const r = await window.cablepilot.layout.watch(on);
      if (r.ok) await get().loadFolder();
    },
  };
});
