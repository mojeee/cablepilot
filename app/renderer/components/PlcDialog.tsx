// PLC I/O overview (M5): every channel with its address, tag, comment, what it is wired to and where it
// is drawn, live from the schematic. Address, tag and comment are editable here, and the same fields are
// edited on the card in the properties panel; every edit is a command, so it is undoable. The addressing
// scheme, tag-list export and import (previewed before anything changes) are here too.
import { useMemo, useState } from 'react';
import { t } from '@shared/i18n';
import { assignEdits, plcCards, plcChannels, restyleEdits, TAG_FORMATS, type ChannelRow, type ImportPlan, type TagFormat } from '@shared/plc';
import type { PlcSettings } from '@shared/model/types';
import { useEditor } from '../state/editor';
import { NumField, Select } from './fields';
import { Modal } from './Modal';

function Cell({ value, onCommit, testid, label }: { value: string; onCommit: (v: string) => void; testid: string; label: string }) {
  const [v, setV] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) { setSeen(value); setV(value); }
  const commit = () => v !== value && onCommit(v);
  return <input type="text" className="mono" aria-label={label} data-testid={testid} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />;
}

const formatLabel = (f: TagFormat) => (f === 'tia' ? t('TIA Portal (XML)') : t('CODESYS (global variable list)'));
const statusLabel = (s: ImportPlan['rows'][number]['status']) => (s === 'set' ? t('will be set') : s === 'same' ? t('already the same') : s === 'unmatched' ? t('no channel with this address') : t('not an address'));

export function PlcDialog() {
  const project = useEditor((s) => s.history.present);
  const lib = useEditor((s) => s.lib);
  const st = useEditor.getState();
  const rows = useMemo(() => plcChannels(project, lib), [project, lib]);
  const cards = useMemo(() => plcCards(project), [project]);
  const s = project.settings.plc;
  const [preview, setPreview] = useState<{ format: TagFormat; name: string; plan: ImportPlan } | null>(null);
  const setScheme = (patch: Partial<PlcSettings>) => st.exec({ type: 'project/settings', settings: { plc: { ...s, ...patch } } });
  const edit = (r: ChannelRow, patch: { address?: string; tag?: string; comment?: string }) => st.exec({ type: 'plc/channels', edits: [{ page: r.page, el: r.el, pin: r.pin, patch }] });
  const go = (r: ChannelRow) => { useEditor.setState({ pageId: r.page, selection: [r.el] }); st.setDialog(null); };
  const missing = useMemo(() => assignEdits(project, false).length, [project]);
  const applyImport = () => {
    if (!preview) return;
    st.exec({ type: 'plc/channels', edits: preview.plan.edits });
    setPreview(null);
  };
  return (
    <Modal title={t('PLC I/O')} wide onClose={() => st.setDialog(null)}>
      <p className="hint">{t('Every channel of the PLC cards, generated from the schematic. Edit address, tag and comment here or on the card; both change the same data.')}</p>
      <div className="rev-form" data-testid="plc-scheme">
        <Select<PlcSettings['style']> label={t('Address style')} testid="plc-style" value={s.style} options={[{ value: 'siemens', label: t('Siemens: I0.0, Q0.1, IW64') }, { value: 'iec', label: t('IEC 61131-3: %IX0.0, %QX0.1, %IW32') }]} onChange={(v) => st.exec({ type: 'batch', label: 'Address style', commands: [{ type: 'project/settings', settings: { plc: { ...s, style: v } } }, { type: 'plc/channels', edits: restyleEdits(project, v) }] })} />
        <NumField label={t('First byte of digital inputs')} value={s.start.di} min={0} step={1} onCommit={(v) => setScheme({ start: { ...s.start, di: v } })} />
        <NumField label={t('First byte of digital outputs')} value={s.start.do} min={0} step={1} onCommit={(v) => setScheme({ start: { ...s.start, do: v } })} />
        <NumField label={t('First byte of analog inputs')} value={s.start.ai} min={0} step={1} onCommit={(v) => setScheme({ start: { ...s.start, ai: v } })} />
        <NumField label={t('First byte of analog outputs')} value={s.start.ao} min={0} step={1} onCommit={(v) => setScheme({ start: { ...s.start, ao: v } })} />
      </div>
      <div className="bom-controls">
        <button type="button" data-testid="plc-assign" disabled={missing === 0} onClick={() => st.exec({ type: 'plc/assign' })}>{t('Assign missing addresses')}</button>
        <button type="button" data-testid="plc-reassign" disabled={cards.length === 0} onClick={() => st.exec({ type: 'plc/assign', all: true })}>{t('Reassign all addresses')}</button>
        <button type="button" data-testid="plc-add-pages" onClick={() => st.addReportPages(['plcIo'])}>{t('Add as report pages')}</button>
      </div>
      <p className="hint">{t('{n} channels on {cards} cards', { n: rows.length, cards: cards.filter((c) => c.el.plc!.type !== 'cpu').length })}</p>
      <table className="bom" data-testid="plc-table">
        <thead><tr><th scope="col">{t('Address')}</th><th scope="col">{t('Tag')}</th><th scope="col">{t('Comment')}</th><th scope="col">{t('Card')}</th><th scope="col">{t('Connected to')}</th><th scope="col">{t('Page-column')}</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={6}>{t('No PLC cards yet: place a card from "PLC cards" in the symbol browser.')}</td></tr>}
          {rows.map((r, i) => (
            <tr key={r.id}>
              <td><Cell value={r.address} label={t('Address')} testid={`plc-address-${i}`} onCommit={(v) => edit(r, { address: v })} /></td>
              <td>{r.pin ? <Cell value={r.tag} label={t('Tag')} testid={`plc-tag-${i}`} onCommit={(v) => edit(r, { tag: v })} /> : ''}</td>
              <td>{r.pin ? <Cell value={r.comment} label={t('Comment')} testid={`plc-comment-${i}`} onCommit={(v) => edit(r, { comment: v })} /> : ''}</td>
              <td>{r.card ? `${r.card}:${r.pin}` : ''}</td>
              <td>{r.connected}</td>
              <td><button type="button" className="link" title={t('Show on the page')} onClick={() => go(r)}>{r.position}</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>{t('Tag lists')}</h3>
      <p className="hint">{t('Export the channels as tags for the PLC programming tool, or import tag names and comments back: tags are matched to channels by address and nothing is created.')}</p>
      <ul className="tag-formats">
        {TAG_FORMATS.map((f) => (
          <li key={f.id}>
            <strong>{formatLabel(f.id)}</strong>{' '}
            {!f.verified && <span className="badge warn" data-testid={`tags-unverified-${f.id}`}>{t('unverified')}</span>}
            <div className="bom-controls">
              <button type="button" data-testid={`tags-export-${f.id}`} disabled={rows.every((r) => !r.address)} onClick={() => void st.exportTags(f.id)}>{t('Export')}</button>
              <button type="button" data-testid={`tags-import-${f.id}`} disabled={cards.length === 0} onClick={() => void st.readTags(f.id).then((r) => r && setPreview({ format: f.id, name: r.name, plan: r.plan }))}>{t('Import...')}</button>
            </div>
            {!f.verified && <p className="hint">{t('This format could not be checked against the vendor documentation. Try a small export in your tool before relying on it.')}</p>}
          </li>
        ))}
      </ul>
      {preview && (
        <div data-testid="tags-preview">
          <h4>{t('Import preview: {name}', { name: preview.name })}</h4>
          {preview.plan.rows.length === 0 ? <p className="hint">{t('No tags could be read from this file.')}</p> : (
            <table className="bom">
              <thead><tr><th scope="col">{t('Tag')}</th><th scope="col">{t('Address')}</th><th scope="col">{t('Comment')}</th><th scope="col">{t('Result')}</th></tr></thead>
              <tbody>{preview.plan.rows.slice(0, 300).map((r, i) => <tr key={i}><td>{r.tag.name}</td><td>{r.address ?? r.tag.address}</td><td>{r.tag.comment}</td><td>{statusLabel(r.status)}</td></tr>)}</tbody>
            </table>
          )}
          <div className="bom-controls">
            <button type="button" data-testid="tags-apply" disabled={preview.plan.edits.length === 0} onClick={applyImport}>{t('Apply {n} changes', { n: preview.plan.edits.length })}</button>
            <button type="button" onClick={() => setPreview(null)}>{t('Cancel')}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
