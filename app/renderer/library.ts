// The built-in symbol library: every JSON file under /library/symbols, bundled with the renderer.
import { makeLibrary, type SymbolDef } from '@shared/library/types';

const files = import.meta.glob('@library/symbols/*.json', { eager: true, import: 'default' }) as Record<string, SymbolDef>;
export const BUILTIN_SYMBOLS: SymbolDef[] = Object.keys(files).sort().map((k) => files[k]);
export const BUILTIN_LIBRARY = makeLibrary(BUILTIN_SYMBOLS);
