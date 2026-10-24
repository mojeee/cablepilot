// The typed API the preload script exposes to the renderer as window.cablepilot. The renderer has
// no Node, no file system and no network of its own (CLAUDE.md, Security).

import type { Result } from './result';
import type { Settings } from './settings';

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
export type CompanyKind = 'symbols' | 'templates';

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
  /** The company library: plain data files in the app's data folder, same format as /library. */
  company: {
    list(kind: CompanyKind): Promise<Result<{ id: string; text: string }[]>>;
    /** Validates with the library rules, then writes. */
    save(kind: CompanyKind, id: string, text: string): Promise<Result<SavedFile>>;
    folder(): Promise<Result<string>>;
  };
}
