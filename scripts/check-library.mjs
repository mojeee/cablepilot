#!/usr/bin/env node
// Validates every data file under library/: valid JSON, an `id` equal to the file name, a `kind`, a
// `source` (standard and clause, or catalogue), a `verification`, and the fields its kind requires
// (library/README.md). Run: npm run check:library
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const libDir = join(root, 'library');

function* jsonFiles(dir) {
  for (const f of readdirSync(dir).sort()) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) yield* jsonFiles(p);
    else if (f.endsWith('.json')) yield p;
  }
}

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Required fields per kind: each checker receives the data and an error callback. */
const KINDS = {
  'colour-codes': (d, err) => {
    if (!Array.isArray(d.colours) || d.colours.length === 0) return err('colours must be a non-empty array');
    const seen = new Set();
    for (const c of d.colours) {
      if (!isObj(c) || !/^[A-Z]{2,4}$/.test(c.code ?? '')) err(`bad colour code ${JSON.stringify(c?.code)}`);
      else if (seen.has(c.code)) err(`duplicate colour code ${c.code}`);
      else seen.add(c.code);
      if (!isObj(c?.name) || !isStr(c.name.en) || !isStr(c.name.it)) err(`colour ${c?.code}: name needs en and it`);
    }
  },
};

const problems = [];
let count = 0;
for (const file of jsonFiles(libDir)) {
  count++;
  const rel = relative(root, file);
  const err = (m) => problems.push(`${rel}: ${m}`);
  let d;
  try {
    d = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    err(`not valid JSON (${e.message})`);
    continue;
  }
  if (!isObj(d)) {
    err('must be a JSON object');
    continue;
  }
  if (d.id !== basename(file, '.json')) err(`id must be "${basename(file, '.json')}"`);
  if (!isStr(d.source)) err('missing source (standard and clause, or catalogue)');
  if (!['primary', 'secondary'].includes(d.verification)) err('verification must be "primary" or "secondary"');
  if (d.verification === 'secondary' && !isStr(d.verifiedFrom)) err('a secondary verification needs verifiedFrom');
  const check = KINDS[d.kind];
  if (!check) err(`unknown kind ${JSON.stringify(d.kind)} (add it to scripts/check-library.mjs)`);
  else check(d, err);
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`library/ checked: ${count} file(s), no problems`);
