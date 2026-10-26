// The warehouse state in the renderer (Zustand): the company's stock list, the saved column mapping and an
// import waiting for the user's column choices. Files are read by the main process (app/main/warehouse.ts); the
// renderer only gets rows. The list and the mapping are saved there, per company.
import { create } from 'zustand';
import { t } from '@shared/i18n';
import type { WarehouseFile } from '@shared/api';
import { applyMapping, columnIndex, guessMapping, newStockList, REQUIRED_FIELDS, type ColumnMapping, type StockList } from '@shared/stock';
import { useUi } from './ui';

const flash = (severity: 'info' | 'warning' | 'error', text: () => string) => useUi.getState().addMessage(severity, text);
const errMsg = (e: { message: string; hint: string }) => flash('error', () => `${e.message} ${e.hint}`);
export const today = (): string => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

interface StockState {
  stock: StockList | null;
  mapping: ColumnMapping | null;
  source: { kind: 'file' | 'folder'; name: string } | null;
  watching: boolean;
  /** A file read and waiting for the column mapping to be confirmed (the wizard). */
  pending: { file: WarehouseFile; mapping: ColumnMapping } | null;
  load(): Promise<void>;
  pickFile(): Promise<void>;
  pickFolder(): Promise<void>;
  refresh(auto?: boolean): Promise<void>;
  useSample(): Promise<void>;
  /** Rows pulled from the ERP (M8 part 1): applied with the saved mapping when it fits, else the wizard opens. */
  receive(file: WarehouseFile): Promise<void>;
  setPendingMapping(m: ColumnMapping): void;
  cancelPending(): void;
  /** Applies the pending file with the chosen mapping, saves the mapping per company and the new stock list. */
  confirmImport(): Promise<void>;
  link(code: string, partId: string | null): Promise<void>;
  setStockDate(date: string): Promise<void>;
  setStaleDays(n: number): Promise<void>;
  watch(on: boolean): Promise<void>;
}

const resolves = (rows: string[][], m: ColumnMapping): boolean => REQUIRED_FIELDS.every((f) => columnIndex(rows, m, f) >= 0);

export const useStock = create<StockState>((set, get) => {
  const persist = async () => {
    const { stock, mapping } = get();
    const r = await window.cablepilot.warehouse.save({ stock, mapping });
    if (!r.ok) errMsg(r.error);
  };
  const apply = async (file: WarehouseFile, mapping: ColumnMapping) => {
    const result = applyMapping(file.rows, mapping);
    const stock = newStockList(result, get().stock, { stockDate: file.modified, sourceName: file.name });
    set({ stock, mapping, pending: null });
    await persist();
    flash(result.skipped.length ? 'warning' : 'info', () => t('Stock list {name}: {n} items imported, {skipped} rows skipped.', { name: file.name, n: result.items.length, skipped: result.skipped.length }));
  };
  /** A freshly read file: apply it when the saved mapping fits (always on an automatic refresh), else ask. */
  const received = async (file: WarehouseFile, auto: boolean) => {
    const saved = get().mapping;
    if (saved && resolves(file.rows, saved) && (auto || !get().stock)) return apply(file, saved);
    set({ pending: { file, mapping: saved && resolves(file.rows, saved) ? saved : guessMapping(file.rows) } });
    if (auto && saved) flash('warning', () => t('The stock file {name} has columns that do not match the saved mapping. Open the warehouse to map them.', { name: file.name }));
  };
  return {
    stock: null, mapping: null, source: null, watching: false, pending: null,
    load: async () => {
      const r = await window.cablepilot.warehouse.load();
      if (r.ok) set({ stock: r.value.stock, mapping: r.value.mapping, source: r.value.source, watching: r.value.watching });
    },
    pickFile: async () => {
      const r = await window.cablepilot.warehouse.pickFile();
      if (!r.ok) return errMsg(r.error);
      if (r.value) { set({ source: { kind: 'file', name: r.value.name } }); await received(r.value, false); }
    },
    pickFolder: async () => {
      const r = await window.cablepilot.warehouse.pickFolder();
      if (!r.ok) return errMsg(r.error);
      if (r.value) { set({ source: { kind: 'folder', name: r.value.name } }); await received(r.value, false); }
    },
    refresh: async (auto = false) => {
      const r = await window.cablepilot.warehouse.refresh();
      if (!r.ok) return errMsg(r.error);
      if (!r.value) return flash('info', () => t('There is no stock file to refresh: choose a file or a folder first.'));
      await received(r.value, true);
      if (!auto) flash('info', () => t('Stock list refreshed.'));
    },
    useSample: async () => {
      const r = await window.cablepilot.warehouse.sample();
      if (!r.ok) return errMsg(r.error);
      set({ source: null });
      const m = guessMapping(r.value.rows);
      await apply(r.value, m);
    },
    receive: (file) => received(file, true),
    setPendingMapping: (mapping) => set((s) => (s.pending ? { pending: { ...s.pending, mapping } } : {})),
    cancelPending: () => set({ pending: null }),
    confirmImport: async () => {
      const p = get().pending;
      if (p && resolves(p.file.rows, p.mapping)) await apply(p.file, p.mapping);
    },
    link: async (code, partId) => {
      const s = get().stock;
      if (!s) return;
      const links = { ...s.links };
      if (partId) links[code] = partId; else delete links[code];
      set({ stock: { ...s, links } });
      await persist();
    },
    setStockDate: async (stockDate) => {
      const s = get().stock;
      if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(stockDate)) return;
      set({ stock: { ...s, stockDate } });
      await persist();
    },
    setStaleDays: async (staleDays) => {
      const s = get().stock;
      if (!s || staleDays < 1) return;
      set({ stock: { ...s, staleDays: Math.round(staleDays) } });
      await persist();
    },
    watch: async (on) => {
      const r = await window.cablepilot.warehouse.watch(on);
      if (!r.ok) return errMsg(r.error);
      set({ watching: r.value });
      if (on && !r.value) flash('warning', () => t('The stock file could not be watched. Choose a file or a folder first.'));
    },
  };
});

/** Starts listening for changes of the watched stock file; call once at startup. */
export function listenForStockChanges(): () => void {
  return window.cablepilot?.warehouse.onChanged(() => void useStock.getState().refresh(true)) ?? (() => undefined);
}
