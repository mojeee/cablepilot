// The warehouse (rule 12): import the company's stock list from a CSV or XLSX file (a column-mapping wizard, saved
// per company), refresh it from the file or a watched folder, and link stock items to library parts. Items with no
// technical data are shown as "data missing" and are never suggested. The file is read by the main process.
// M8 part 1: the stock can also be pulled from the ERP, a stock item can be picked for the selected device (one
// undoable command), and the project's needs go back to the ERP as a reservation request.
import { useMemo, useState } from 'react';
import { t, getLanguage } from '@shared/i18n';
import { columnIndex, dataMissing, isStale, linkedPart, REQUIRED_FIELDS, STOCK_FIELDS, type ColumnMapping, type StockField, type StockItem } from '@shared/stock';
import { partFromStockItem } from '@shared/erp';
import { newId } from '@shared/ids';
import type { PartDef } from '@shared/library/types';
import { useEditor } from '../state/editor';
import { useErp } from '../state/erp';
import { useUi } from '../state/ui';
import { today, useStock } from '../state/stock';
import { Check, NumField } from './fields';
import { Modal } from './Modal';

const FIELD_LABEL: Record<StockField, () => string> = {
  code: () => t('Part code'), manufacturer: () => t('Manufacturer'), description: () => t('Description'), onHand: () => t('On hand'),
  reserved: () => t('Reserved'), location: () => t('Location'), warehouse: () => t('Warehouse'), unit: () => t('Unit'),
  width: () => t('Width (mm, item master)'), height: () => t('Height (mm, item master)'), depth: () => t('Depth (mm, item master)'),
};
const MAX_ROWS = 300;

function Wizard() {
  const pending = useStock((s) => s.pending);
  const st = useStock.getState();
  if (!pending) return null;
  const { file, mapping } = pending;
  const head = file.rows[0] ?? [];
  const width = Math.max(0, ...file.rows.slice(0, 6).map((r) => r.length));
  const options = mapping.header ? head.map((h) => h.trim()).filter(Boolean) : Array.from({ length: width }, (_, i) => `#${i + 1}`);
  const set = (m: ColumnMapping) => st.setPendingMapping(m);
  const ready = REQUIRED_FIELDS.every((f) => columnIndex(file.rows, mapping, f) >= 0);
  return (
    <section className="wizard" data-testid="wh-wizard">
      <h3>{t('Map the columns of {name}', { name: file.name })}</h3>
      <p className="hint">{t('Say which column holds each field. The mapping is saved for your company and used again when the file is refreshed. Part code and On hand are required.')}</p>
      <Check label={t('The first row is a header')} checked={mapping.header} onChange={(header) => set({ header, columns: {} })} testid="wh-header" />
      <div className="wizard-grid">
        {STOCK_FIELDS.map((f) => (
          <label key={f} className="prop">
            <span>{FIELD_LABEL[f]()}{REQUIRED_FIELDS.includes(f) ? ' *' : ''}</span>
            <select data-testid={`wh-map-${f}`} value={mapping.columns[f] ?? ''} onChange={(e) => set({ ...mapping, columns: { ...mapping.columns, [f]: e.target.value || undefined } })}>
              <option value="">{t('(not in the file)')}</option>
              {options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
        ))}
      </div>
      <table className="bom wizard-preview">
        <tbody>{file.rows.slice(0, 6).map((r, i) => <tr key={i}>{Array.from({ length: width }, (_, j) => <td key={j}>{r[j] ?? ''}</td>)}</tr>)}</tbody>
      </table>
      <div className="row-buttons">
        <button type="button" data-testid="wh-import" disabled={!ready} onClick={() => void st.confirmImport()}>{t('Import with this mapping')}</button>
        <button type="button" onClick={() => st.cancelPending()}>{t('Cancel')}</button>
      </div>
    </section>
  );
}

/** Assigns a stock item to a device as one undoable command: its linked library part, else a project part made from the ERP item. */
function pickFor(device: string, item: StockItem, parts: readonly PartDef[], links: Record<string, string>): void {
  const ed = useEditor.getState();
  const project = ed.history.present;
  const def = linkedPart(item.code, parts, links) ?? partFromStockItem(item, newId('cp'));
  const cur = project.devices.find((r) => r.designation === device)?.parts ?? [];
  const next = cur.some((x) => x.part === def.id) ? cur : [...cur, { part: def.id, qty: 1 }];
  ed.exec({ type: 'batch', label: 'pick from warehouse', commands: [{ type: 'part/embed', def }, { type: 'device/update', key: device, patch: { parts: next } }] });
  useUi.getState().addMessage('info', () => t('{code} assigned to {device}.', { code: item.code, device }));
}

export function WarehouseDialog() {
  const { stock, source, watching, pending } = useStock();
  const focus = useEditor((s) => s.warehouseFocus);
  const erp = useErp();
  const lib = useEditor((s) => s.lib);
  const project = useEditor((s) => s.history.present);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const st = useStock.getState();
  const lang = getLanguage();
  const parts = useMemo(() => [...lib.parts.values(), ...project.parts.filter((p) => !lib.parts.has(p.id))], [lib, project.parts]);
  const choices = useMemo(() => parts.slice().sort((a, b) => Number(!!b.data.Type) - Number(!!a.data.Type) || a.code.localeCompare(b.code, 'en', { numeric: true })), [parts]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (stock?.items ?? []).filter((i) => !q || i.code.toLowerCase().includes(q) || i.description.toLowerCase().includes(q) || i.location.toLowerCase().includes(q));
  }, [stock, query]);
  const stale = stock ? isStale(stock, today()) : false;
  const missing = stock ? stock.items.filter((i) => dataMissing(i, parts, stock.links)).length : 0;
  return (
    <Modal title={t('Warehouse')} wide onClose={() => { useEditor.getState().patch({ warehouseFocus: null }); useEditor.getState().setDialog(null); }}>
      <p className="hint">{t('The company\'s stock list, from a CSV or XLSX file exported by your ERP or warehouse system. Stock items are linked to library parts, which carry the technical data sizing needs; an item without it is shown as "data missing" and never suggested.')}</p>
      <div className="bom-controls">
        <button type="button" data-testid="wh-pick-file" onClick={() => void st.pickFile()}>{t('Choose stock file...')}</button>
        <button type="button" data-testid="wh-pick-folder" onClick={() => void st.pickFolder()}>{t('Choose watched folder...')}</button>
        <button type="button" data-testid="wh-refresh" disabled={!source} onClick={() => void st.refresh()}>{t('Refresh')}</button>
        <Check label={t('Refresh when the file changes')} checked={watching} onChange={(on) => void st.watch(on)} testid="wh-watch" />
        <button type="button" data-testid="wh-sample" onClick={() => void st.useSample()}>{t('Use the sample stock list')}</button>
      </div>
      <div className="bom-controls" data-testid="wh-erp">
        <button type="button" data-testid="wh-erp-pull" disabled={erp.busy || !erp.status?.config.itemsUrl} onClick={() => void erp.pull()}>{t('Pull from ERP')}</button>
        <button type="button" data-testid="wh-erp-settings" onClick={() => useEditor.getState().setDialog('erp')}>{t('ERP settings...')}</button>
        <button type="button" data-testid="wh-reserve" onClick={() => useEditor.getState().setDialog('reservation')}>{t('Reservation request...')}</button>
        {erp.status?.config.itemsUrl && <span className="hint" data-testid="wh-erp-host">{erp.status.demo ? t('Demo ERP on this computer') : t('ERP: {url}', { url: erp.status.config.itemsUrl })}</span>}
      </div>
      {focus && <p className="hint" data-testid="wh-focus">{t('Choosing a part for {device}: press "Use" on a stock row.', { device: focus })}</p>}
      {source && <p className="hint" data-testid="wh-source">{source.kind === 'folder' ? t('Watched folder, newest file: {name}', { name: source.name }) : t('Source file: {name}', { name: source.name })}</p>}
      {pending && <Wizard />}
      {!stock && !pending && <p className="hint" data-testid="wh-empty">{t('No stock list yet. Choose your file, or load the sample list to try sizing.')}</p>}
      {stock && (
        <>
          <div className="rev-form" data-testid="wh-info">
            <label className="prop"><span>{t('Stock date')}</span><input type="date" data-testid="wh-date" value={stock.stockDate} onChange={(e) => void st.setStockDate(e.target.value)} /></label>
            <NumField label={t('Old after (days)')} value={stock.staleDays} min={1} step={1} onCommit={(v) => void st.setStaleDays(v)} />
            {stale && <span className="badge warn" data-testid="wh-stale">{t('Stock list is old')}</span>}
          </div>
          <p className="hint" data-testid="wh-summary">{t('{n} items from {name}, {missing} without technical data.', { n: stock.items.length, name: stock.sourceName, missing })}</p>
          <input type="search" aria-label={t('Search the stock list')} placeholder={t('Search the stock list')} value={query} onChange={(e) => setQuery(e.target.value)} />
          <table className="bom" data-testid="wh-table">
            <thead><tr>{[t('Part code'), t('Description'), t('On hand'), t('Reserved'), t('Unit'), t('Warehouse'), t('Location'), t('Library part')].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>
              {rows.slice(0, MAX_ROWS).map((i, k) => {
                const part = linkedPart(i.code, parts, stock.links);
                const noData = dataMissing(i, parts, stock.links);
                return (
                  <tr key={`${i.code}-${k}`} className={noData ? 'missing' : ''}>
                    <td className="mono">{i.code}</td><td>{i.description}</td><td className="num">{i.onHand}</td><td className="num">{i.reserved}</td><td>{i.unit}</td><td>{i.warehouse}</td><td>{i.location}</td>
                    <td>
                      {editing === i.code ? (
                        <select aria-label={t('Library part')} data-testid="wh-link-select" autoFocus value={stock.links[i.code] ?? ''} onChange={(e) => { void st.link(i.code, e.target.value || null); setEditing(null); }} onBlur={() => setEditing(null)}>
                          <option value="">{t('By part code')}</option>
                          {choices.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.title[lang]}</option>)}
                        </select>
                      ) : (
                        <>
                          {noData && <span className="badge warn" data-testid="wh-data-missing">{t('data missing')}</span>}{' '}
                          {part ? <span title={part.title[lang]}>{part.code}</span> : null}{' '}
                          <button type="button" className="link" data-testid="wh-link" onClick={() => setEditing(i.code)}>{part ? t('Change link') : t('Link...')}</button>
                          {focus && <button type="button" data-testid="wh-use" onClick={() => pickFor(focus, i, parts, stock.links)}>{t('Use for {device}', { device: focus })}</button>}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length > MAX_ROWS && <tr><td colSpan={8}>{t('and {n} more', { n: rows.length - MAX_ROWS })}</td></tr>}
            </tbody>
          </table>
        </>
      )}
    </Modal>
  );
}
