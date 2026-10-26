// Trial and licence state (LICENSE.md, sections 2 and 3). The app is free to use for the trial days
// from the first start on this computer; after that it asks for a licence key. Keys are verified
// offline with the public key in shared/brand.ts. The state lives in license.json in the app's data.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LicenseStatus } from '@shared/api';
import { LICENSE_PUBLIC_KEY_PEM } from '@shared/brand';
import { fail, ok, type Result } from '@shared/result';
import { t } from '@shared/i18n';
import { verifyLicenseKey } from './keys';

interface Stored {
  firstRun: string;
  key?: string;
}

const DAY = 24 * 60 * 60 * 1000;

export class LicenseService {
  private stored: Stored | null = null;

  constructor(
    private readonly dir: string,
    private readonly trialDays: number,
    private readonly publicKeyPem = LICENSE_PUBLIC_KEY_PEM,
  ) {}

  private get file(): string {
    return join(this.dir, 'license.json');
  }

  private read(now: Date): Stored {
    if (this.stored) return this.stored;
    try {
      const s = JSON.parse(readFileSync(this.file, 'utf8')) as Stored;
      if (typeof s.firstRun !== 'string' || Number.isNaN(Date.parse(s.firstRun))) throw new Error('no first run');
      this.stored = s;
    } catch {
      this.stored = { firstRun: now.toISOString() };
      this.write();
    }
    return this.stored;
  }

  private write(): void {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.file, `${JSON.stringify(this.stored, null, 2)}\n`);
  }

  status(now = new Date()): LicenseStatus {
    const s = this.read(now);
    const p = s.key ? verifyLicenseKey(s.key, this.publicKeyPem, now) : null;
    const used = Math.max(0, Math.floor((now.getTime() - Date.parse(s.firstRun)) / DAY));
    const daysLeft = Math.max(0, this.trialDays - used);
    if (p) return { state: 'licensed', daysLeft, trialDays: this.trialDays, licensee: p.n, plan: p.p };
    return { state: daysLeft > 0 ? 'trial' : 'expired', daysLeft, trialDays: this.trialDays };
  }

  activate(key: string, now = new Date()): Result<LicenseStatus> {
    if (!verifyLicenseKey(key, this.publicKeyPem, now)) {
      return fail('license.badKey', t('This licence key is not valid.'), t('Copy the whole key, starting with CP1-. If it still fails, ask on GitHub Discussions.'));
    }
    const s = this.read(now);
    s.key = key.trim().replace(/\s+/g, '');
    this.write();
    return ok(this.status(now));
  }
}
