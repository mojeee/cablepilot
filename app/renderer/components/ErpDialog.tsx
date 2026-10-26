// ERP settings (M8 part 1, docs/erp-link.md): where items and stock come from (REST or OData v4 JSON with paging),
// how to sign in, where reservation requests go (HTTP POST or an outbox folder), the automatic pull, and the demo
// ERP. The password or token goes to the main process (safeStorage) and never comes back: this window only learns
// whether one is stored.
import { useEffect, useState } from 'react';
import { t } from '@shared/i18n';
import { checkUrl, MIN_AUTO_MINUTES, type ErpAuth, type ErpConfig, type ErpSendTo } from '@shared/erp';
import { useEditor } from '../state/editor';
import { useErp } from '../state/erp';
import { NumField, Select, TextField } from './fields';
import { Modal } from './Modal';

export function ErpDialog() {
  const { status, busy, lastTest } = useErp();
  const st = useErp.getState();
  const [secret, setSecret] = useState('');
  useEffect(() => { void st.load(); }, [st]);
  const close = () => useEditor.getState().setDialog('warehouse');
  if (!status) return <Modal title={t('ERP link')} onClose={close}><p>…</p></Modal>;
  const cfg = status.config;
  const save = (patch: Partial<ErpConfig>) => void st.saveConfig({ ...cfg, ...patch });
  const insecure = cfg.auth !== 'none' && [cfg.itemsUrl, cfg.reservationUrl].some((u) => u && checkUrl(u) === 'insecure');
  return (
    <Modal title={t('ERP link')} wide onClose={close}>
      <p className="hint">{t('CablePilot reads items and stock from your ERP over HTTP (REST or OData v4 JSON) and sends back the parts a project needs as a reservation request, which you see before it is sent. The requests run on this computer; the password or token is stored encrypted by the operating system and is never shown again.')}</p>
      <div className="bom-controls">
        <button type="button" data-testid="erp-demo" onClick={() => void st.useDemo()}>{t('Try the demo ERP')}</button>
        {status.demo && <span className="badge" data-testid="erp-demo-on">{t('Demo ERP on this computer')}</span>}
      </div>

      <h3>{t('Items and stock')}</h3>
      <TextField label={t('Items address (URL)')} value={cfg.itemsUrl} onCommit={(v) => save({ itemsUrl: v })} mono testid="erp-items-url" placeholder="https://erp.example.com/odata/Items" />
      <TextField label={t('Rows path ("value" for OData, empty for a plain list)')} value={cfg.rowsPath} onCommit={(v) => save({ rowsPath: v })} mono testid="erp-rows-path" />
      <TextField label={t('Next page path ("@odata.nextLink" for OData, empty for no paging)')} value={cfg.nextPath} onCommit={(v) => save({ nextPath: v })} mono testid="erp-next-path" />
      <NumField label={t('Pull automatically every (minutes, 0 = off)')} value={cfg.autoMinutes} min={0} step={MIN_AUTO_MINUTES} onCommit={(v) => save({ autoMinutes: v })} testid="erp-auto" />

      <h3>{t('Sign-in')}</h3>
      <Select<ErpAuth> label={t('Authentication')} value={cfg.auth} testid="erp-auth" options={[{ value: 'none', label: t('None') }, { value: 'basic', label: t('User name and password (basic)') }, { value: 'bearer', label: t('Bearer token') }, { value: 'header', label: t('API key in a header') }]} onChange={(auth) => save({ auth })} />
      {cfg.auth === 'basic' && <TextField label={t('User name')} value={cfg.user} onCommit={(v) => save({ user: v })} testid="erp-user" />}
      {cfg.auth === 'header' && <TextField label={t('Header name')} value={cfg.headerName} onCommit={(v) => save({ headerName: v })} mono testid="erp-header" />}
      {cfg.auth !== 'none' && (
        <div className="rev-form">
          <label className="prop">
            <span>{cfg.auth === 'basic' ? t('Password') : t('Token or key')}</span>
            <input type="password" data-testid="erp-secret" autoComplete="off" value={secret} placeholder={status.hasSecret ? t('Saved (hidden)') : ''} onChange={(e) => setSecret(e.target.value)} />
          </label>
          <button type="button" data-testid="erp-secret-save" disabled={!secret.trim()} onClick={() => void st.setSecret(secret).then((done) => done && setSecret(''))}>{t('Save')}</button>
          {status.hasSecret && <button type="button" onClick={() => void st.clearSecret()}>{t('Remove')}</button>}
        </div>
      )}
      {cfg.auth !== 'none' && !status.secureStorage && <p className="hint warn">{t('This computer offers no secure storage, so a password cannot be saved. On Linux, install and unlock a keyring.')}</p>}
      {insecure && <p className="hint warn" data-testid="erp-insecure">{t('This address uses plain http to another computer: the password or token would travel unencrypted. Use https if the ERP offers it.')}</p>}

      <h3>{t('Reservations')}</h3>
      <Select<ErpSendTo> label={t('Send reservations to')} value={cfg.sendTo} testid="erp-send-to" options={[{ value: 'none', label: t('Nowhere (preview and save as a file only)') }, { value: 'http', label: t('The ERP, by HTTP POST') }, { value: 'folder', label: t('An outbox folder the ERP imports from') }]} onChange={(sendTo) => save({ sendTo })} />
      {cfg.sendTo === 'http' && <TextField label={t('Reservation address (URL)')} value={cfg.reservationUrl} onCommit={(v) => save({ reservationUrl: v })} mono testid="erp-res-url" />}
      {cfg.sendTo === 'folder' && (
        <div className="bom-controls">
          <button type="button" data-testid="erp-outbox" onClick={() => void st.pickOutbox()}>{t('Choose outbox folder...')}</button>
          <span className="hint">{status.outbox ? t('Outbox: {name}', { name: status.outbox }) : t('No folder chosen yet.')}</span>
        </div>
      )}

      <div className="row-buttons">
        <button type="button" data-testid="erp-test" disabled={busy || !cfg.itemsUrl} onClick={() => void st.test()}>{t('Test connection')}</button>
        <button type="button" data-testid="erp-pull" disabled={busy || !cfg.itemsUrl} onClick={() => void st.pull().then((done) => done && close())}>{t('Pull stock now')}</button>
      </div>
      {lastTest && <p className="hint" data-testid="erp-test-result">{t('{n} items on the first page. Fields: {fields}', { n: lastTest.records, fields: lastTest.fields.join(', ') })}</p>}
    </Modal>
  );
}
