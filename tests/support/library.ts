// Loads the built-in symbol and part libraries from /library for tests and generators.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeLibrary, type Library, type MacroDef, type PartDef, type SymbolDef } from '@shared/library/types';

const root = join(__dirname, '..', '..', 'library');
const read = <T>(dir: string): T[] => {
  const d = join(root, dir);
  try {
    return readdirSync(d).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(join(d, f), 'utf8')) as T);
  } catch {
    return [];
  }
};
let cached: Library | null = null;
export function loadLibrary(): Library {
  cached ??= makeLibrary(read<SymbolDef>('symbols'), read<PartDef>('parts'));
  return cached;
}
export const loadMacros = (): MacroDef[] => read<MacroDef>('macros');
