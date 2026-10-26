#!/usr/bin/env node
// Issues a CablePilot licence key (LICENSE.md, section 3). The private key lives outside the repository:
//   ~/.cablepilot/license-private.pem   (back it up: without it no key can be issued, and a new one
//                                         would invalidate every key already sold)
// Usage: node scripts/make-license.mjs --name "Ada Lovelace" [--plan personal|commercial|education] [--seats 5] [--expires 2027-12-31]
// The key format and the check are in app/main/license/keys.ts.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createPrivateKey, sign } from 'node:crypto';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), []),
);
if (!args.name) {
  console.error('Usage: node scripts/make-license.mjs --name "Full Name" [--plan personal|commercial|education] [--seats n] [--expires YYYY-MM-DD]');
  process.exit(1);
}
const plan = args.plan ?? 'personal';
if (!['personal', 'commercial', 'education'].includes(plan)) {
  console.error(`Unknown plan "${plan}".`);
  process.exit(1);
}
const keyPath = process.env.CABLEPILOT_LICENSE_KEY ?? join(homedir(), '.cablepilot', 'license-private.pem');
const payload = { n: args.name, p: plan, i: new Date().toISOString().slice(0, 10) };
if (args.seats) payload.s = Number(args.seats);
if (args.expires) payload.x = args.expires;
const data = Buffer.from(JSON.stringify(payload));
const sig = sign(null, data, createPrivateKey(readFileSync(keyPath, 'utf8')));
console.log(`CP1-${data.toString('base64url')}.${sig.toString('base64url')}`);
