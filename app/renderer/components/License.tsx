// The trial and the licence (LICENSE.md, sections 2 and 3): a chip in the top bar, a dialog to enter a
// key, and a screen that asks for one once the trial has ended. Projects stay readable without the app
// (open JSON format), so the end of the trial never locks anyone out of their drawings.

import { useState } from 'react';
import { create } from 'zustand';
import type { LicenseStatus } from '@shared/api';
import { t } from '@shared/i18n';
import { Modal } from './Modal';

interface LicenseStore {
  status: LicenseStatus | null;
  dialog: boolean;
  refresh(): Promise<void>;
  set(p: Partial<Pick<LicenseStore, 'status' | 'dialog'>>): void;
}

export const useLicense = create<LicenseStore>((set) => ({
  status: null,
  dialog: false,
  refresh: async () => {
    const r = await window.cablepilot?.license.status();
    if (r?.ok) set({ status: r.value });
  },
  set: (p) => set(p),
}));

const planName = (plan: string | undefined): string =>
  plan === 'commercial' ? t('commercial') : plan === 'education' ? t('education') : t('personal');

function KeyForm({ onDone }: { onDone?: () => void }) {
  const [key, setKey] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const activate = async () => {
    const api = window.cablepilot;
    if (!api) return;
    setBusy(true);
    setErr(null);
    const r = await api.license.activate(key);
    setBusy(false);
    if (!r.ok) return setErr(`${r.error.message} ${r.error.hint}`);
    useLicense.getState().set({ status: r.value });
    onDone?.();
  };
  return (
    <div className="key-form">
      <label>
        <span className="key-label">{t('Licence key')}</span>
        <textarea rows={3} className="mono" data-testid="license-key" value={key} spellCheck={false} onChange={(e) => setKey(e.target.value)} placeholder="CP1-…" />
      </label>
      {err && <p className="err" role="alert" data-testid="license-error">{err}</p>}
      <div className="key-actions">
        <button type="button" className="primary" data-testid="license-activate" disabled={busy || !key.trim()} onClick={() => void activate()}>{t('Activate')}</button>
        <button type="button" onClick={() => void window.cablepilot?.license.open('buy')}>{t('Request a licence key')}</button>
        <button type="button" onClick={() => void window.cablepilot?.license.open('license')}>{t('Read the licence')}</button>
      </div>
    </div>
  );
}

export function LicenseChip() {
  const s = useLicense((x) => x.status);
  if (!s) return null;
  const label = s.state === 'licensed' ? t('Licensed') : s.state === 'expired' ? t('Trial ended') : t('Trial: {n} days left', { n: s.daysLeft });
  // On narrow windows the trial shows as "30 days" (styles: .lic-short), with the full text as the tooltip.
  const short = s.state === 'trial' ? t('{n} days', { n: s.daysLeft }) : label;
  return (
    <button type="button" className={`tb lic-chip lic-${s.state}`} data-testid="license-chip" title={label} aria-label={label} onClick={() => useLicense.getState().set({ dialog: true })}>
      <span className="lic-long">{label}</span><span className="lic-short" aria-hidden="true">{short}</span>
    </button>
  );
}

export function LicenseDialog() {
  const open = useLicense((x) => x.dialog);
  const s = useLicense((x) => x.status);
  if (!open || !s) return null;
  const close = () => useLicense.getState().set({ dialog: false });
  return (
    <Modal title={t('Licence')} onClose={close}>
      {s.state === 'licensed' ? (
        <p data-testid="license-licensed">{t('Licensed to {name} ({plan} plan). Thank you for supporting CablePilot.', { name: s.licensee ?? '', plan: planName(s.plan) })}</p>
      ) : (
        <>
          <p>
            {s.state === 'trial'
              ? t('You are using the free trial: {n} of {total} days left.', { n: s.daysLeft, total: s.trialDays })
              : t('The {total}-day trial has ended.', { total: s.trialDays })}{' '}
            {t('CablePilot is source-available: you can read and build the code, and using it after the trial needs a licence key.')}
          </p>
          <KeyForm onDone={close} />
        </>
      )}
    </Modal>
  );
}

export function TrialEndedScreen() {
  const s = useLicense((x) => x.status);
  if (!s || s.state !== 'expired') return null;
  return (
    <div className="lock-screen" role="dialog" aria-modal="true" aria-label={t('Your free trial has ended')} data-testid="trial-ended">
      <div className="lock-card">
        <h1>{t('Your free trial has ended')}</h1>
        <p>{t('Thank you for trying CablePilot for {total} days. To keep using it, enter a licence key.', { total: s.trialDays })}</p>
        <p className="hint">{t('Your projects are safe: they are plain JSON files in an open, documented format, and the PDF, DXF and spreadsheet exports you made are yours to keep.')}</p>
        <KeyForm />
      </div>
    </div>
  );
}
