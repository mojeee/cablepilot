/// <reference types="vite/client" />
// The built-in library for the main process (the provider reads symbols and parts to build proposals).
import { makeLibrary, type PartDef, type SymbolDef } from '@shared/library/types';

const load = <T>(files: Record<string, T>): T[] => Object.keys(files).sort().map((k) => files[k]);
export const MAIN_LIBRARY = makeLibrary(
  load(import.meta.glob('@library/symbols/*.json', { eager: true, import: 'default' }) as Record<string, SymbolDef>),
  load(import.meta.glob('@library/parts/*.json', { eager: true, import: 'default' }) as Record<string, PartDef>),
);
import type { MacroDef as MacroDefT } from '@shared/library/types';
/** The library macros (the assistant places them: the star-delta starter). */
export const MAIN_MACROS: MacroDefT[] = load(import.meta.glob('@library/macros/*.json', { eager: true, import: 'default' }) as Record<string, MacroDefT>);
