// The reservation request (M8 part 1, docs/erp-link.md): what this project needs from the warehouse, line by line,
// with where it would come from and what is short. It is shown first and only goes to the ERP when the user presses
// Send; it can also be saved as JSON or CSV. Nothing in the project changes.
import { useMemo, useState } from 'react';
import { t, getLanguage } from '@shared/i18n';
import { computeBom } from '@shared/bom';
import { reservation, reservationCsv, reservationFileBase } from '@shared/erp';
import { useEditor } from '../state/editor';
import { useErp } from '../state/erp';
import { useStock } from '../state/stock';
import { useUi } from '../state/ui';
import { Modal } from './Modal';

const MAX_ROWS = 400;

export function ReservationDialog() {
  const project = useEditor((s) => s.history.present);
  const lib = useEditor((s) => s.lib);
  const stock = useStock((s) => s.stock);
  const { status, busy } = useErp();
  const [sent, setSent] = useState(false);
  const [createdAt] = useState(() => new Date().toISOString());
  const parts = useMemo(() => [...lib.parts.values(), ...project.parts.filter((p) => !lib.parts.has(p.id))], [lib, project.parts]);
  const doc = useMemo(() => reservation(project, computeBom(project, lib), stock, parts, createdAt), [project, lib, stock, parts, createdAt]);
  const close = () => useEditor.getState().setDialog(null);
  const sendTo = status?.config.sendTo ?? 'none';
  const short = doc.lines.filter((l) => l.short > 0).length;
  const saveAs = async (ext: 'json' | 'csv') => {
    const text = ext === 'json' ? `${JSON.stringify(doc, null, 2)}\n` : reservationCsv(doc, getLanguage());
    const r = await window.cablepilot.files.exportText(text, `${reservationFileBase(doc)}.${ext}`);
    if (!r.ok) useUi.getState().addMessage('error', () => `${r.error.message} ${r.error.hint}`);
  };
  return (
    <Modal title={t('Reservation request for the ERP')} wide onClose={close}>
      <p className="hint">{t('What this project needs from the warehouse ({units} units to build), taken from the rows with the most free stock first. Check it, then send it: the ERP decides what to reserve.', { units: doc.units })}</p>
      {!stock && <p className="hint warn" data-testid="res-no-stock">{t('There is no stock list yet: every line counts as not in stock. Pull the stock from the ERP first.')}</p>}
      <p className="hint" data-testid="res-summary">{t('{n} lines, {short} short.', { n: doc.lines.length, short })}</p>
      <table className="bom" data-testid="res-table">
        <thead><tr>{[t('Part code'), t('Description'), t('Quantity'), t('Unit'), t('From'), t('Short'), t('Devices')].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>
          {doc.lines.slice(0, MAX_ROWS).map((l) => (
            <tr key={l.code} className={l.short > 0 ? 'missing' : ''}>
              <td className="mono">{l.code}</td><td>{l.description}</td><td className="num">{l.qty}</td><td>{l.unit}</td>
              <td>{l.from.map((f) => `${f.warehouse} ${f.location}: ${f.qty}`).join('; ') || (l.inStock ? '' : t('not in stock'))}</td>
              <td className="num">{l.short || ''}</td><td>{l.devices.join(' ')}</td>
            </tr>
          ))}
          {doc.lines.length > MAX_ROWS && <tr><td colSpan={7}>{t('and {n} more', { n: doc.lines.length - MAX_ROWS })}</td></tr>}
        </tbody>
      </table>
      {sendTo === 'none' && <p className="hint">{t('The ERP settings do not say where reservations go: save the request as a file, or choose a destination in the ERP settings.')}</p>}
      <div className="row-buttons">
        <button type="button" data-testid="res-send" disabled={busy || sent || sendTo === 'none' || doc.lines.length === 0} onClick={() => void useErp.getState().send(doc).then((done) => done && setSent(true))}>
          {sendTo === 'folder' ? t('Write to the outbox folder') : t('Send to the ERP')}
        </button>
        <button type="button" onClick={() => void saveAs('json')}>{t('Save as JSON...')}</button>
        <button type="button" onClick={() => void saveAs('csv')}>{t('Save as CSV...')}</button>
        <button type="button" onClick={() => useEditor.getState().setDialog('erp')}>{t('ERP settings...')}</button>
      </div>
      {sent && <p className="hint" data-testid="res-sent">{status?.config.itemsUrl ? t('Sent. The stock has been pulled again, so the reserved quantities the ERP set are shown.') : t('Sent.')}</p>}
    </Modal>
  );
}
