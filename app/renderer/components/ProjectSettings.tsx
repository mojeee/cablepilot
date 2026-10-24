// Project settings: general (drawing language, symbol standard, potentials), project and assembly
// data, drawing style, and frame / title-block templates. Every change is a command.
import { useEffect, useState } from 'react';
import { t, getLanguage } from '@shared/i18n';
import { ASSEMBLY_FIELDS, PROJECT_FIELDS, type DataField } from '@shared/forms';
import { newId } from '@shared/ids';
import type { DrawingStyle, Potential, StyleColourKey, Template } from '@shared/model/types';
import { parseZoneLabels, zoneRange } from '@shared/model/zones';
import { SHEET_SIZES, type SheetSize } from '@shared/sheets';
import { readImageFile } from '../render/svg';
import { useEditor } from '../state/editor';
import { useUi } from '../state/ui';
import { NumField, Select, TextField } from './fields';
import { Modal } from './Modal';

type Tab = 'general' | 'data' | 'style' | 'frame';

const COLOUR_LABELS: Record<StyleColourKey, () => string> = {
  symbol: () => t('Symbols'),
  wire: () => t('Wires'),
  designation: () => t('Designations'),
  wireNumber: () => t('Wire numbers'),
  text: () => t('Text'),
  annotation: () => t('Annotation lines and tables'),
  frame: () => t('Frame'),
  titleBlock: () => t('Title block'),
};

function ColourField({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  useEffect(() => {
    if (v === value) return;
    const id = setTimeout(() => onCommit(v), 400);
    return () => clearTimeout(id);
  }, [v, value, onCommit]);
  return (
    <label className="prop colour">
      <span>{label}</span>
      <input type="color" value={v} onChange={(e) => setV(e.target.value)} />
      <code>{v}</code>
    </label>
  );
}

function DataFieldInput({ f, value, onCommit }: { f: DataField; value: string; onCommit: (v: string) => void }) {
  const lang = useEditor.getState().history.present.settings.drawingLanguage;
  const label = `${f.label[lang]}${f.unit ? ` (${f.unit})` : ''}`;
  if (f.kind === 'choice') return <Select label={label} value={value} options={[{ value: '', label: '-' }, ...(f.options ?? []).map((o) => ({ value: o, label: o }))]} onChange={onCommit} />;
  return <TextField label={label} value={value} onCommit={onCommit} testid={`field-${f.key}`} />;
}

function General() {
  const p = useEditor((s) => s.history.present);
  const exec = useEditor.getState().exec;
  const s = p.settings;
  const [pot, setPot] = useState({ id: '', label: '' });
  return (
    <>
      <TextField label={t('Project name')} testid="project-name-field" value={p.name} onCommit={(v) => exec({ type: 'project/set', name: v || p.name })} />
      <Select label={t('Drawing language (texts printed on the drawings)')} testid="drawing-language" value={s.drawingLanguage} options={[{ value: 'en', label: 'English' }, { value: 'it', label: 'Italiano' }]} onChange={(v) => exec({ type: 'project/settings', settings: { drawingLanguage: v } })} />
      <Select label={t('Symbol standard')} value={s.symbolStandard} options={[{ value: 'iec', label: t('IEC 60617') }, { value: 'nfpa', label: t('NFPA 79 / ANSI (where a symbol has an alternative)') }]} onChange={(v) => exec({ type: 'project/settings', settings: { symbolStandard: v } })} />
      <Select<SheetSize> label={t('Default sheet size')} value={s.defaultSize} options={SHEET_SIZES.map((x) => ({ value: x, label: x }))} onChange={(v) => exec({ type: 'project/settings', settings: { defaultSize: v } })} />
      <h3>{t('Potentials')}</h3>
      <ul className="chips">
        {p.potentials.map((x) => (
          <li key={x.id}>{x.label}{' '}
            <button type="button" aria-label={t('Remove')} onClick={() => exec({ type: 'project/potentials', potentials: p.potentials.filter((q) => q.id !== x.id) })}>✕</button>
          </li>
        ))}
      </ul>
      <div className="inline">
        <input type="text" aria-label={t('Potential name')} placeholder={t('Potential name')} value={pot.id} onChange={(e) => setPot({ id: e.target.value, label: e.target.value })} />
        <button type="button" disabled={!pot.id.trim() || p.potentials.some((x) => x.id === pot.id.trim())} onClick={() => { const n: Potential = { id: pot.id.trim(), label: pot.label.trim(), kind: 'other' }; exec({ type: 'project/potentials', potentials: [...p.potentials, n] }); setPot({ id: '', label: '' }); }}>{t('Add')}</button>
      </div>
    </>
  );
}

function Data() {
  const p = useEditor((s) => s.history.present);
  const exec = useEditor.getState().exec;
  return (
    <>
      <h3>{t('Project data (title block)')}</h3>
      {PROJECT_FIELDS.map((f) => <DataFieldInput key={f.key} f={f} value={p.properties[f.key] ?? ''} onCommit={(v) => exec({ type: 'project/set', properties: { [f.key]: v } })} />)}
      <h3>{t('Assembly data (IEC 61439)')}</h3>
      {ASSEMBLY_FIELDS.map((f) => <DataFieldInput key={f.key} f={f} value={p.assembly[f.key] ?? ''} onCommit={(v) => exec({ type: 'project/set', assembly: { [f.key]: v } })} />)}
    </>
  );
}

function Style() {
  const p = useEditor((s) => s.history.present);
  const exec = useEditor.getState().exec;
  const st = p.settings.style;
  const set = (patch: Partial<DrawingStyle>) => exec({ type: 'project/settings', settings: { style: { ...st, ...patch } } });
  return (
    <>
      <h3>{t('Colours per element type')}</h3>
      {(Object.keys(COLOUR_LABELS) as StyleColourKey[]).map((k) => (
        <ColourField key={k} label={COLOUR_LABELS[k]()} value={st.colours[k]} onCommit={(v) => set({ colours: { ...st.colours, [k]: v } })} />
      ))}
      <p className="hint">{t('The print preview and the PDF are always on white paper; dark drawing colours are shown lighter on a dark canvas only.')}</p>
      <h3>{t('Line weights (mm)')}</h3>
      {(['symbol', 'wire', 'frame', 'annotation'] as const).map((k) => (
        <NumField key={k} label={{ symbol: t('Symbols'), wire: t('Wires'), frame: t('Frame'), annotation: t('Annotation lines and tables') }[k]} value={st.weights[k]} min={0.1} max={2} step={0.05} onCommit={(v) => set({ weights: { ...st.weights, [k]: v } })} />
      ))}
      <h3>{t('Text')}</h3>
      <Select label={t('Font')} value={st.font} options={[{ value: 'sans', label: t('Sans-serif') }, { value: 'serif', label: t('Serif') }, { value: 'mono', label: t('Monospace') }]} onChange={(v) => set({ font: v })} />
      {(['designation', 'wireNumber', 'text'] as const).map((k) => (
        <NumField key={k} label={{ designation: t('Designation height (mm)'), wireNumber: t('Wire number height (mm)'), text: t('Text height (mm)') }[k]} value={st.textSizes[k]} min={1} max={10} step={0.5} onCommit={(v) => set({ textSizes: { ...st.textSizes, [k]: v } })} />
      ))}
    </>
  );
}

function ZoneEditor({ label, labels, onChange }: { label: string; labels: string[]; onChange: (l: string[]) => void }) {
  const [range, setRange] = useState({ from: labels[0] ?? 'A', to: labels[labels.length - 1] ?? 'H', skip: '' });
  return (
    <div className="zone-editor">
      <TextField label={label} value={labels.join(' ')} onCommit={(v) => onChange(parseZoneLabels(v))} mono />
      <div className="inline">
        <input type="text" aria-label={t('From')} value={range.from} size={3} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        <span>–</span>
        <input type="text" aria-label={t('To')} value={range.to} size={3} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        <input type="text" aria-label={t('Skip')} placeholder={t('Skip, e.g. I O')} value={range.skip} onChange={(e) => setRange({ ...range, skip: e.target.value })} />
        <button type="button" onClick={() => { const l = zoneRange(range.from, range.to, parseZoneLabels(range.skip)); if (l.length) onChange(l); }}>{t('Fill')}</button>
      </div>
    </div>
  );
}

function Frame() {
  const p = useEditor((s) => s.history.present);
  const exec = useEditor.getState().exec;
  const [tplId, setTplId] = useState(p.settings.defaultTemplateId);
  const tpl = p.templates.find((x) => x.id === tplId) ?? p.templates[0];
  const [company, setCompany] = useState<{ id: string; name: string; template: Template }[]>([]);
  useEffect(() => {
    void window.cablepilot.company.list('templates').then((r) => {
      if (!r.ok) return;
      const out: typeof company = [];
      for (const f of r.value) {
        try {
          const d = JSON.parse(f.text) as { template: Template };
          out.push({ id: f.id, name: d.template.name, template: d.template });
        } catch {
          // skipped
        }
      }
      setCompany(out);
    });
  }, []);
  const up = (patch: Partial<Template>) => exec({ type: 'template/upsert', template: { ...tpl, ...patch } });
  const m = tpl.frame.margins;
  const onLogo = async (f: File | undefined) => {
    if (!f) return;
    const r = await readImageFile(f);
    if ('error' in r) return useUi.getState().addMessage('error', () => t('That file is not a PNG, JPEG or SVG image, or it could not be read.'));
    const id = newId('as');
    exec({ type: 'batch', label: 'logo', commands: [{ type: 'asset/add', id, asset: r.asset }, { type: 'template/upsert', template: { ...tpl, titleBlock: { ...tpl.titleBlock, logoAssetId: id } } }] });
  };
  const saveCompany = async () => {
    const id = `template-${tpl.id}`.replace(/[^A-Za-z0-9._-]/g, '-');
    const text = JSON.stringify({ id, kind: 'template', source: 'Company template saved from CablePilot', verification: 'primary', template: { ...tpl, titleBlock: { ...tpl.titleBlock, logoAssetId: undefined } } }, null, 2);
    const r = await window.cablepilot.company.save('templates', id, text);
    useUi.getState().addMessage(r.ok ? 'info' : 'error', () => (r.ok ? t('Template saved to the company library.') : `${r.error.message} ${r.error.hint}`));
  };
  return (
    <>
      <div className="inline">
        <select aria-label={t('Template')} value={tpl.id} onChange={(e) => setTplId(e.target.value)}>{p.templates.map((x) => <option key={x.id} value={x.id}>{x.name}{x.id === p.settings.defaultTemplateId ? ` (${t('default')})` : ''}</option>)}</select>
        <button type="button" onClick={() => { const n = { ...structuredClone(tpl), id: newId('tpl'), name: `${tpl.name} ${t('copy')}` }; exec({ type: 'template/upsert', template: n }); setTplId(n.id); }}>{t('Duplicate')}</button>
        <button type="button" disabled={tpl.id === p.settings.defaultTemplateId} onClick={() => exec({ type: 'project/settings', settings: { defaultTemplateId: tpl.id } })}>{t('Use as default')}</button>
        <button type="button" disabled={p.templates.length <= 1 || tpl.id === p.settings.defaultTemplateId} onClick={() => { exec({ type: 'template/remove', id: tpl.id }); setTplId(p.settings.defaultTemplateId); }}>{t('Delete')}</button>
      </div>
      <div className="inline">
        <button type="button" onClick={() => void saveCompany()}>{t('Save to the company library')}</button>
        <select aria-label={t('Load from the company library')} value="" onChange={(e) => { const c = company.find((x) => x.id === e.target.value); if (c) { const n = { ...c.template, id: newId('tpl') }; exec({ type: 'template/upsert', template: n }); setTplId(n.id); } }}>
          <option value="">{t('Load from the company library')}</option>
          {company.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <TextField label={t('Template name')} value={tpl.name} onCommit={(v) => up({ name: v || tpl.name })} />
      <h3>{t('Frame margins (mm)')}</h3>
      <div className="grid4">
        {(['l', 't', 'r', 'b'] as const).map((k) => <NumField key={k} label={{ l: t('Left'), t: t('Top'), r: t('Right'), b: t('Bottom') }[k]} value={m[k]} min={0} max={50} onCommit={(v) => up({ frame: { ...tpl.frame, margins: { ...m, [k]: v } } })} />)}
      </div>
      <h3>{t('Zones')}</h3>
      <ZoneEditor label={t('Column labels (left to right)')} labels={tpl.frame.columns} onChange={(columns) => up({ frame: { ...tpl.frame, columns } })} />
      <ZoneEditor label={t('Row labels (top to bottom)')} labels={tpl.frame.rows} onChange={(rows) => up({ frame: { ...tpl.frame, rows } })} />
      <h3>{t('Title block')}</h3>
      <div className="inline">
        <label className="file">{t('Logo image...')}<input type="file" accept="image/png,image/jpeg,image/svg+xml,.svg" hidden onChange={(e) => { void onLogo(e.target.files?.[0]); e.target.value = ''; }} /></label>
        {tpl.titleBlock.logoAssetId && <button type="button" onClick={() => up({ titleBlock: { ...tpl.titleBlock, logoAssetId: undefined } })}>{t('Remove logo')}</button>}
        <span className="hint">{tpl.titleBlock.logoAssetId ? p.assets[tpl.titleBlock.logoAssetId]?.name : t('No logo')}</span>
      </div>
      <TextField label={t('Margin text (copyright notice)')} value={tpl.marginText ?? ''} onCommit={(v) => up({ marginText: v || undefined })} />
      <p className="hint">{t('The title block fills in from the project data and the page; drawing labels follow the drawing language.')}</p>
    </>
  );
}

export function ProjectSettingsDialog() {
  const [tab, setTab] = useState<Tab>('general');
  useUi((s) => s.language);
  void getLanguage;
  const tabs: { id: Tab; label: string }[] = [{ id: 'general', label: t('General') }, { id: 'data', label: t('Project data') }, { id: 'style', label: t('Drawing style') }, { id: 'frame', label: t('Frame and title block') }];
  return (
    <Modal title={t('Project settings')} wide onClose={() => useEditor.getState().setDialog(null)}>
      <div className="tabs" role="tablist">
        {tabs.map((x) => <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} data-testid={`tab-${x.id}`} className={tab === x.id ? 'on' : ''} onClick={() => setTab(x.id)}>{x.label}</button>)}
      </div>
      {tab === 'general' && <General />}
      {tab === 'data' && <Data />}
      {tab === 'style' && <Style />}
      {tab === 'frame' && <Frame />}
    </Modal>
  );
}
