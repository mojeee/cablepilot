// The typed API the preload script exposes to the renderer as window.cablepilot. The renderer has
// no Node, no file system and no network of its own (CLAUDE.md, Security).

import type { Result } from './result';
import type { Settings } from './settings';
import type { WarehouseData } from './stock';
import type { ErpConfig } from './erp';
import type { AiAnswer, AiProgress, AiProviderId, AiRequest, AiStatus } from './ai/types';

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
/** The ERP link as the renderer sees it (M8 part 1): the settings, never the password or token. */
export interface ErpStatus {
  config: ErpConfig;
  hasSecret: boolean;
  /** Whether the OS can encrypt a password (safeStorage); without it none is stored. */
  secureStorage: boolean;
  /** The outbox folder's name (the path stays in the main process). */
  outbox: string | null;
  /** Whether the settings point at the running demo ERP. */
  demo: boolean;
}
export interface ErpTest {
  records: number;
  /** Field names of the first page, as the column mapping will see them. */
  fields: string[];
}
export interface ErpReceipt {
  to: 'http' | 'folder';
  /** The ERP's reference for the request, or the file written. */
  reference: string;
}
/** A daily backup or a named version of a project (M8 part 2). */
export interface HistoryEntry {
  id: string;
  kind: 'daily' | 'version';
  name: string;
  createdAt: string;
}
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
  /** Project history (M8 part 2): daily backups and named versions, kept in the app's data folder. */
  history: {
    list(projectId: string): Promise<Result<HistoryEntry[]>>;
    /** Writes today's backup unless there is one; true when it wrote one. */
    backup(projectId: string, name: string, text: string): Promise<Result<boolean>>;
    saveVersion(projectId: string, name: string, text: string): Promise<Result<HistoryEntry>>;
    read(projectId: string, entryId: string): Promise<Result<string>>;
    remove(projectId: string, entryId: string): Promise<Result<null>>;
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
  /** The live ERP link (M8 part 1): requests and credentials stay in the main process. */
  erp: {
    status(): Promise<Result<ErpStatus>>;
    setConfig(config: ErpConfig): Promise<Result<ErpStatus>>;
    setSecret(secret: string): Promise<Result<ErpStatus>>;
    clearSecret(): Promise<Result<ErpStatus>>;
    /** Asks for the outbox folder; null when the user cancels. */
    pickOutbox(): Promise<Result<ErpStatus | null>>;
    /** Starts the demo ERP on this computer and points the settings at it. */
    useDemo(): Promise<Result<ErpStatus>>;
    /** Reads the first page only. */
    test(): Promise<Result<ErpTest>>;
    /** Items and stock as rows, like a stock file. */
    pull(): Promise<Result<WarehouseFile>>;
    /** Sends a reservation request the user has confirmed. */
    send(doc: unknown): Promise<Result<ErpReceipt>>;
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
  /** The assistant (M7): providers run here in the main process, API keys never reach the renderer. Without a stored key the built-in assistant answers. */
  ai: {
    status(): Promise<Result<AiStatus>>;
    /** Provider and model id (an empty model id goes back to the default); never a key. */
    setSettings(patch: { provider?: AiProviderId; model?: string }): Promise<Result<AiStatus>>;
    setKey(provider: AiProviderId, key: string): Promise<Result<AiStatus>>;
    clearKey(provider: AiProviderId): Promise<Result<AiStatus>>;
    /** One cheap call that proves the key and the model work. */
    testKey(provider: AiProviderId): Promise<Result<{ model: string }>>;
    ask(req: AiRequest): Promise<Result<AiAnswer>>;
    cancel(): Promise<Result<null>>;
    onProgress(cb: (p: AiProgress) => void): () => void;
  };
  /** The company library: plain data files in the app's data folder, same format as /library. */
  company: {
    list(kind: CompanyKind): Promise<Result<{ id: string; text: string }[]>>;
    /** Validates with the library rules, then writes. */
    save(kind: CompanyKind, id: string, text: string): Promise<Result<SavedFile>>;
    folder(): Promise<Result<string>>;
  };
}
