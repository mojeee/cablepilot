#!/usr/bin/env node
// Validates every data file under library/ (or the folder given as an argument, e.g. a company
// library): valid JSON, an `id` equal to the file name, a `kind`, a `source`, a `verification`, and
// the fields its kind requires (library/README.md; rules in scripts/library-validate.mjs).
// Run: npm run check:library [-- <folder>]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateLibraryFile } from './library-validate.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const libDir = process.argv[2] ? resolve(process.argv[2]) : join(root, 'library');

function* jsonFiles(dir) {
  for (const f of readdirSync(dir).sort()) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) yield* jsonFiles(p);
    else if (f.endsWith('.json')) yield p;
  }
}

const problems = [];
let count = 0;
for (const file of jsonFiles(libDir)) {
  count++;
  const rel = relative(process.cwd(), file);
  let d;
  try {
    d = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    problems.push(`${rel}: not valid JSON (${e.message})`);
    continue;
  }
  for (const m of validateLibraryFile(d, basename(file, '.json'))) problems.push(`${rel}: ${m}`);
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`${relative(process.cwd(), libDir) || '.'}/ checked: ${count} file(s), no problems`);
