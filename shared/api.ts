// The typed API the preload script exposes to the renderer as window.cablepilot. The renderer has
// no Node, no file system and no network of its own (CLAUDE.md, Security).

import type { Result } from './result';
import type { Settings } from './settings';
import type { WarehouseData } from './stock';
import type { AiAnswer, AiRequest, AiStatus } from './ai/types';

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
}

/** A project's text with the file it came from (null: it has no file yet). */
export interface OpenedFile {
  text: string;
  path: string | null;
  name: string;
}
export interface SavedFile {
  path: string;
  name: string;
}
export interface SampleInfo {
  id: string;
  name: string;
}
export interface AutosaveInfo {
  id: string;
  name: string;
  /** The project's own file, when it has one. */
  path: string | null;
  savedAt: string;
}
/** A stock file read by the main process: its rows as text, the file's name and its date (yyyy-mm-dd). */
export interface WarehouseFile {
  name: string;
  rows: string[][];
  modified: string;
}
export type WarehouseState = WarehouseData & { source: { kind: 'file' | 'folder'; name: string } | null; watching: boolean };
export type CompanyKind = 'symbols' | 'templates' | 'macros' | 'parts' | 'layouts';
/** A layout exchange file or an ERP item master read by the main process (M6 part 3): JSON text, or CSV and XLSX rows. */
export interface LayoutFileData {
  name: string;
  ext: 'json' | 'csv' | 'xlsx';
  text: string;
  rows: string[][];
}

export interface CablePilotApi {
  app: {
    info(): Promise<Result<AppInfo>>;
  };
  settings: {
    get(): Promise<Result<Settings>>;
    set(patch: Partial<Settings>): Promise<Result<Settings>>;
  };
  files: {
    /** Asks for a project file and reads it; null when the user cancels. */
    open(): Promise<Result<OpenedFile | null>>;
    /** Writes the project; without a path it asks where (Save as). null when the user cancels. */
    save(text: string, path: string | null, suggestedName: string): Promise<Result<SavedFile | null>>;
    /** Asks where to write a PDF and writes it; null when the user cancels. */
    exportPdf(bytes: Uint8Array, suggestedName: string): Promise<Result<SavedFile | null>>;
    /** Asks where to write a text file (CSV, DXF; the filter follows the file name) and writes it; null when the user cancels. */
    exportText(text: string, suggestedName: string): Promise<Result<SavedFile | null>>;
    /** Asks where to write a binary file (XLSX) and writes it; null when the user cancels. */
    exportBinary(bytes: Uint8Array, suggestedName: string): Promise<Result<SavedFile | null>>;
    /** Asks for a DXF file and reads it; null when the user cancels. */
    importDxf(): Promise<Result<{ text: string; name: string } | null>>;
    /** Asks for a tag-list file (TIA Portal XML or CODESYS text) and reads it; null when the user cancels. */
    importTags(ext: 'xml' | 'txt'): Promise<Result<{ text: string; name: string } | null>>;
  };
  samples: {
    list(): Promise<Result<SampleInfo[]>>;
    read(id: string): Promise<Result<string>>;
  };
  autosave: {
    write(id: string, name: string, path: string | null, text: string): Promise<Result<null>>;
    list(): Promise<Result<AutosaveInfo[]>>;
    read(id: string): Promise<Result<string>>;
    clear(id: string): Promise<Result<null>>;
  };
  /** The company's warehouse (M6 part 1): the stock file is read here, never in the renderer. */
  warehouse: {
    load(): Promise<Result<WarehouseState>>;
    /** Saves the column mapping and the stock list. */
    save(data: WarehouseData): Promise<Result<null>>;
    /** Asks for a CSV or XLSX stock file, remembers it as the source and returns its rows; null when the user cancels. */
    pickFile(): Promise<Result<WarehouseFile | null>>;
    /** Asks for a folder; its newest CSV or XLSX file is the stock list. */
    pickFolder(): Promise<Result<WarehouseFile | null>>;
    /** Reads the remembered source again; null when there is none. */
    refresh(): Promise<Result<WarehouseFile | null>>;
    /** The generic sample stock list that ships with the app. */
    sample(): Promise<Result<WarehouseFile>>;
    /** Watches the source: `onChanged` fires when the file changes. Returns whether it is watching. */
    watch(on: boolean): Promise<Result<boolean>>;
    onChanged(cb: () => void): () => void;
  };
  /** Layout exchange (M6 part 3): files and a watched folder are read here, never in the renderer. */
  layout: {
    /** Asks for a layout file (JSON or CSV) or an ERP item master (CSV or XLSX); null when the user cancels. */
    pick(kind: 'layout' | 'itemMaster'): Promise<Result<LayoutFileData | null>>;
    /** Asks for a folder to watch; its newest layout file is read. */
    pickFolder(): Promise<Result<LayoutFileData | null>>;
    /** Reads the newest layout file of the remembered folder again; null when there is none. */
    refresh(): Promise<Result<LayoutFileData | null>>;
    folder(): Promise<Result<{ name: string; watching: boolean } | null>>;
    watch(on: boolean): Promise<Result<boolean>>;
    onChanged(cb: () => void): () => void;
  };
  /** The assistant (M6 part 2): providers run here in the main process, API keys never reach the renderer. */
  ai: {
    status(): Promise<Result<AiStatus>>;
    ask(req: AiRequest): Promise<Result<AiAnswer>>;
  };
  /** The company library: plain data files in the app's data folder, same format as /library. */
  company: {
    list(kind: CompanyKind): Promise<Result<{ id: string; text: string }[]>>;
    /** Validates with the library rules, then writes. */
    save(kind: CompanyKind, id: string, text: string): Promise<Result<SavedFile>>;
    folder(): Promise<Result<string>>;
  };
}
