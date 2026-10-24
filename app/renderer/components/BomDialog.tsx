// The bill of materials, live from the schematic: configurable columns and user fields, quantity
// times the number of units to build, project-level parts, CSV export. Every setting is a command.
import { useMemo, useState } from 'react';
import { t, getLanguage } from '@shared/i18n';
import { BOM_BASE_COLUMNS, BOM_STOCK_COLUMNS, bomCell, computeBom } from '@shared/bom';
import { stockIssues, withStock } from '@shared/stock';
import { newId } from '@shared/ids';
import type { BomSettings } from '@shared/model/types';
import { pick } from '@shared/drawingText';
import { useEditor } from '../state/editor';
import { useStock } from '../state/stock';
import { Check, NumField, Select, TextField } from './fields';
import { PartPicker, partTitle } from './DevicePanel';
import { Modal } from './Modal';

const BASE_LABEL: Record<(typeof BOM_BASE_COLUMNS)[number] | (typeof BOM_STOCK_COLUMNS)[number], () => string> = {
  onHand: () => t('On hand'),
  available: () => t('Available'),
  short: () => t('Short'),
  location: () => t('Location'),
  designation: () => t('Designation'),
  position: () => t('Position'),
  qty: () => t('Qty'),
  code: () => t('Part code'),
  description: () => t('Description'),
  manufacturer: () => t('Manufacturer'),
};

export function BomDialog() {
  const project = useEditor((s) => s.history.present);
  const lib = useEditor((s) => s.lib);
  const exec = useEditor.getState().exec;
  const stock = useStock((x) => x.stock);
  const [showStock, setShowStock] = useState(true);
  const parts = useMemo(() => [...lib.parts.values(), ...project.parts.filter((p) => !lib.parts.has(p.id))], [lib, project.parts]);
  const plain = useMemo(() => computeBom(project, lib), [project, lib]);
  const withStockCols = !!stock && showStock;
  const bom = useMemo(() => (withStockCols ? withStock(plain, stock, parts) : plain), [plain, stock, parts, withStockCols]);
  const shortCount = stock ? stockIssues(plain, stock, parts).shortages.length : 0;
  const [field, setField] = useState('');
  const s = project.settings.bom;
  const lang = getLanguage();
  const set = (patch: Partial<BomSettings>) => exec({ type: 'project/settings', settings: { bom: { ...s, ...patch } } });
  const all = [...BOM_BASE_COLUMNS.map((c) => ({ id: c as string, label: BASE_LABEL[c]() })), ...s.userFields.map((f) => ({ id: `field:${f.id}`, label: pick(f.label, lang) || f.id }))];
  const shown = [...all.filter((c) => s.columns.includes(c.id)), ...(withStockCols ? BOM_STOCK_COLUMNS.map((c) => ({ id: c as string, label: BASE_LABEL[c]() })) : [])];
  const toggle = (id: string, on: boolean) => set({ columns: all.map((c) => c.id).filter((c) => (c === id ? on : s.columns.includes(c))) });
  const addField = () => {
    const name = field.trim();
    if (!name) return;
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || newId('f');
    if (s.userFields.some((f) => f.id === id)) return;
    set({ userFields: [...s.userFields, { id, label: { en: name, it: name } }], columns: [...s.columns, `field:${id}`] });
    setField('');
  };
  return (
    <Modal title={t('Bill of materials')} wide onClose={() => useEditor.getState().setDialog(null)}>
      <div className="bom-controls">
        <NumField label={t('Units to build')} testid="bom-units" value={s.units} min={1} step={1} onCommit={(v) => set({ units: Math.round(v) })} />
        <Select<BomSettings['group']> label={t('Rows')} value={s.group} options={[{ value: 'device', label: t('One row per device part') }, { value: 'part', label: t('Merged by part') }]} onChange={(v) => set({ group: v })} />
        <button type="button" data-testid="bom-export" onClick={() => void useEditor.getState().exportBom(withStockCols)}>{t('Export CSV')}</button>
        {stock && <Check label={t('Show stock columns')} checked={showStock} onChange={setShowStock} testid="bom-show-stock" />}
        <button type="button" data-testid="bom-pick-csv" onClick={() => void useEditor.getState().exportPicking('csv')}>{t('Picking list (CSV)')}</button>
        <button type="button" data-testid="bom-pick-xlsx" onClick={() => void useEditor.getState().exportPicking('xlsx')}>{t('Picking list (XLSX)')}</button>
      </div>
      <fieldset className="bom-columns">
        <legend>{t('Columns')}</legend>
        {all.map((c) => (
          <label key={c.id} className="prop check"><input type="checkbox" checked={s.columns.includes(c.id)} onChange={(e) => toggle(c.id, e.target.checked)} /><span>{c.label}</span></label>
        ))}
        <TextField label={t('New user column')} value={field} onCommit={setField} testid="bom-new-field" />
        <button type="button" data-testid="bom-add-field" onClick={addField}>{t('Add column')}</button>
      </fieldset>
      {shortCount > 0 && <p className="hint warn" data-testid="bom-short">{t('{n} parts are short in the warehouse for this project.', { n: shortCount })}</p>}
      {bom.missing > 0 && <p className="hint warn" data-testid="bom-missing">{t('{n} devices have no part yet.', { n: bom.missing })}</p>}
      <table className="bom" data-testid="bom-table">
        <thead><tr>{shown.map((c) => <th key={c.id} scope="col">{c.label}</th>)}</tr></thead>
        <tbody>
          {bom.rows.length === 0 && <tr><td colSpan={Math.max(1, shown.length)}>{t('No devices yet. Give symbols a designation and assign parts to them.')}</td></tr>}
          {bom.rows.map((r, i) => (
            <tr key={i} className={r.missing ? 'missing' : r.assembly ? 'assembly' : ''}>
              {shown.map((c, j) => <td key={c.id} className={c.id === 'qty' ? 'num' : ''} style={j === 0 ? { paddingLeft: 6 + r.level * 14 } : undefined}>{bomCell(r, c.id)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <h3>{t('Parts without a designation')}</h3>
      <p className="hint">{t('Mounting plate, wiring kit and other parts that are not drawn.')}</p>
      <ul className="parts" data-testid="project-parts">
        {project.projectParts.map((pp) => (
          <li key={pp.id}>
            <span>{partTitle(project, lib, pp.part)}</span>
            <NumField label={t('Quantity')} value={pp.qty} min={1} step={1} onCommit={(v) => exec({ type: 'projectPart/set', part: { ...pp, qty: v } })} />
            <button type="button" aria-label={t('Remove')} onClick={() => exec({ type: 'projectPart/remove', id: pp.id })}>✕</button>
          </li>
        ))}
      </ul>
      <PartPicker testid="project-part" onAdd={(def, qty) => exec({ type: 'batch', label: 'add project part', commands: [{ type: 'part/embed', def }, { type: 'projectPart/set', part: { id: newId('pp'), part: def.id, qty, fields: {} } }] })} />
    </Modal>
  );
}
