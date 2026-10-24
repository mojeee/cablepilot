// Loads the built-in symbol library from /library for tests and generators.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeLibrary, type Library, type SymbolDef } from '@shared/library/types';

const dir = join(__dirname, '..', '..', 'library', 'symbols');
let cached: Library | null = null;
export function loadLibrary(): Library {
  cached ??= makeLibrary(readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as SymbolDef));
  return cached;
}
