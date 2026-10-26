// The trial and licence keys (LICENSE.md, sections 2 and 3; app/main/license).
import { describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeLicenseKey, verifyLicenseKey } from '../app/main/license/keys';
import { LicenseService } from '../app/main/license/license';

const pair = () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { pub: publicKey.export({ type: 'spki', format: 'pem' }).toString(), priv: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() };
};
const { pub, priv } = pair();
const dir = () => mkdtempSync(join(tmpdir(), 'cp-lic-'));

describe('licence keys', () => {
  it('verifies a signed key and rejects tampering, other signers and other products', () => {
    const key = makeLicenseKey({ n: 'Ada', p: 'commercial', s: 5, i: '2026-10-26' }, priv);
    expect(key.startsWith('CP1-')).toBe(true);
    expect(verifyLicenseKey(key, pub)).toMatchObject({ n: 'Ada', p: 'commercial', s: 5 });
    // Pasted with line breaks and spaces, it still reads.
    expect(verifyLicenseKey(`  ${key.slice(0, 20)}\n${key.slice(20)} `, pub)?.n).toBe('Ada');
    const [head, sig] = key.split('.');
    const forged = Buffer.from(JSON.stringify({ n: 'Mallory', p: 'commercial', i: '2026-10-26' })).toString('base64url');
    expect(verifyLicenseKey(`CP1-${forged}.${sig}`, pub)).toBeNull();
    expect(verifyLicenseKey(`${head}.AAAA`, pub)).toBeNull();
    expect(verifyLicenseKey(key, pair().pub)).toBeNull();
    expect(verifyLicenseKey(key.replace('CP1-', 'BP1-'), pub)).toBeNull();
    expect(verifyLicenseKey('hello', pub)).toBeNull();
  });
  it('honours expiry dates', () => {
    const key = makeLicenseKey({ n: 'Ada', p: 'personal', i: '2026-01-01', x: '2026-06-01' }, priv);
    expect(verifyLicenseKey(key, pub, new Date('2026-05-01'))).not.toBeNull();
    expect(verifyLicenseKey(key, pub, new Date('2026-07-01'))).toBeNull();
  });
});

describe('trial', () => {
  it('starts on the first run and counts down to the end', () => {
    const d = dir();
    const lic = new LicenseService(d, 30, pub);
    expect(lic.status(new Date('2026-10-01T09:00:00Z'))).toEqual({ state: 'trial', daysLeft: 30, trialDays: 30 });
    expect(JSON.parse(readFileSync(join(d, 'license.json'), 'utf8')).firstRun).toBe('2026-10-01T09:00:00.000Z');
    const again = new LicenseService(d, 30, pub);
    expect(again.status(new Date('2026-10-11T10:00:00Z'))).toMatchObject({ state: 'trial', daysLeft: 20 });
    expect(again.status(new Date('2026-10-31T10:00:00Z')).state).toBe('expired');
  });
  it('a damaged licence file starts a new first run instead of failing', () => {
    const d = dir();
    writeFileSync(join(d, 'license.json'), '{not json');
    expect(new LicenseService(d, 30, pub).status(new Date('2026-10-01')).state).toBe('trial');
  });
  it('a valid key unlocks the app after the trial and is remembered', () => {
    const d = dir();
    writeFileSync(join(d, 'license.json'), JSON.stringify({ firstRun: '2026-01-01T00:00:00Z' }));
    const lic = new LicenseService(d, 30, pub);
    const now = new Date('2026-10-26');
    expect(lic.status(now).state).toBe('expired');
    const r = lic.activate(makeLicenseKey({ n: 'Ada', p: 'personal', i: '2026-10-26' }, priv), now);
    expect(r.ok && r.value).toMatchObject({ state: 'licensed', licensee: 'Ada', plan: 'personal' });
    expect(new LicenseService(d, 30, pub).status(now).state).toBe('licensed');
  });
  it('rejects keys not signed with CablePilot\'s key, with a plain message and a hint', () => {
    const lic = new LicenseService(dir(), 30);
    const r = lic.activate(makeLicenseKey({ n: 'Ada', p: 'personal', i: '2026-10-26' }, priv));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatchObject({ code: 'license.badKey', message: 'This licence key is not valid.' });
    expect(lic.status().state).toBe('trial');
  });
  it('the shipped public key matches the private key the owner signs with, when it is on this computer', () => {
    const file = join(process.env.HOME ?? '', '.cablepilot', 'license-private.pem');
    let privPem: string;
    try { privPem = readFileSync(file, 'utf8'); } catch { return; }
    const lic = new LicenseService(dir(), 30);
    expect(lic.activate(makeLicenseKey({ n: 'Owner check', p: 'personal', i: '2026-10-26' }, privPem)).ok).toBe(true);
  });
});
