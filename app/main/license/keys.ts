// Licence keys: "CP1-<payload>.<signature>", both base64url. The payload is JSON signed with Ed25519
// and verified offline, so activating a key needs no network and no account.

import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';

export interface LicensePayload {
  /** licensee name */
  n: string;
  /** plan */
  p: 'personal' | 'commercial' | 'education';
  /** issued, ISO date */
  i: string;
  /** seats, for commercial and education plans */
  s?: number;
  /** optional expiry, ISO date */
  x?: string;
}

const PREFIX = 'CP1-';

export function makeLicenseKey(payload: LicensePayload, privateKeyPem: string): string {
  const data = Buffer.from(JSON.stringify(payload));
  const sig = sign(null, data, createPrivateKey(privateKeyPem));
  return `${PREFIX}${data.toString('base64url')}.${sig.toString('base64url')}`;
}

/** The payload of a valid, unexpired key signed with the matching private key; null for anything else. */
export function verifyLicenseKey(key: string, publicKeyPem: string, now = new Date()): LicensePayload | null {
  const m = /^CP1-([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(key.trim().replace(/\s+/g, ''));
  if (!m) return null;
  try {
    const data = Buffer.from(m[1], 'base64url');
    if (!verify(null, data, createPublicKey(publicKeyPem), Buffer.from(m[2], 'base64url'))) return null;
    const p = JSON.parse(data.toString('utf8')) as LicensePayload;
    if (typeof p.n !== 'string' || typeof p.i !== 'string') return null;
    if (p.x && new Date(p.x) < now) return null;
    return p;
  } catch {
    return null;
  }
}
