// The built-in library: every JSON file under /library/symbols, /library/parts and /library/macros,
// bundled with the renderer.
import { makeLibrary, type MacroDef, type PartDef, type SymbolDef } from '@shared/library/types';

const load = <T>(files: Record<string, T>): T[] => Object.keys(files).sort().map((k) => files[k]);
export const BUILTIN_SYMBOLS: SymbolDef[] = load(import.meta.glob('@library/symbols/*.json', { eager: true, import: 'default' }) as Record<string, SymbolDef>);
export const BUILTIN_PARTS: PartDef[] = load(import.meta.glob('@library/parts/*.json', { eager: true, import: 'default' }) as Record<string, PartDef>);
export const BUILTIN_MACROS: MacroDef[] = load(import.meta.glob('@library/macros/*.json', { eager: true, import: 'default' }) as Record<string, MacroDef>);
export const BUILTIN_LIBRARY = makeLibrary(BUILTIN_SYMBOLS, BUILTIN_PARTS);
