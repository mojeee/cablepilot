// Wires and cables: how wires are numbered, the company wire-class table, wire types and cables.
// Every change is a command, so it undoes like any edit.
import { useState } from 'react';
import { t } from '@shared/i18n';
import type { CableKind, CableRec, NumberingSettings, WireClass, WireType } from '@shared/model/types';
import { NUMBERING_PRESETS, WIRE_COLOURS } from '@shared/wires';
import { useEditor } from '../state/editor';
import { Check, NumField, Select, TextField } from './fields';
import { Modal } from './Modal';

type Tab = 'numbering' | 'classes' | 'types' | 'cables';

const ColourSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)}>
    {WIRE_COLOURS.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
  </select>
);
const Cell = ({ value, onCommit, width }: { value: string; onCommit: (v: string) => void; width?: number }) => (
  <input type="text" style={{ width }} defaultValue={value} key={value} onBlur={(e) => e.target.value !== value && onCommit(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
);

export function WiresDialog() {
  const project = useEditor((s) => s.history.present);
  const lib = useEditor((s) => s.lib);
  const st = useEditor.getState();
  const [tab, setTab] = useState<Tab>('numbering');
  const cfg = project.settings.numbering;
  const setNum = (patch: Partial<NumberingSettings>) => st.exec({ type: 'project/settings', settings: { numbering: { ...cfg, ...patch } } });
  const setClass = (id: string, patch: Partial<WireClass>) => st.exec({ type: 'project/wires', wireClasses: project.wireClasses.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const setType = (id: string, patch: Partial<WireType>) => st.exec({ type: 'project/wires', wireTypes: project.wireTypes.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const [typeId, setTypeId] = useState('');
  const [cab, setCab] = useState<CableRec>({ id: '-W1', kind: 'multicore' });
  const cableParts = [...lib.parts.values()].filter((p) => p.category === 'cables');
  const connectors = [...new Set(project.pages.flatMap((p) => p.elements.flatMap((e) => (e.kind === 'box' && e.designation ? [e.designation] : []))))].sort();
  const tabs: { id: Tab; label: string }[] = [{ id: 'numbering', label: t('Numbering') }, { id: 'classes', label: t('Wire classes') }, { id: 'types', label: t('Wire types') }, { id: 'cables', label: t('Cables') }];
  return (
    <Modal title={t('Wires and cables')} wide onClose={() => st.setDialog(null)}>
      <div className="tabs" role="tablist">
        {tabs.map((x) => <button key={x.id} type="button" role="tab" data-testid={`wires-tab-${x.id}`} aria-selected={tab === x.id} className={tab === x.id ? 'selected' : ''} onClick={() => setTab(x.id)}>{x.label}</button>)}
      </div>
      {tab === 'numbering' && (
        <>
          <Select<NumberingSettings['scheme']> label={t('Numbering scheme')} testid="num-scheme" value={cfg.scheme} options={[{ value: 'potential', label: t('By potential (one counter per potential)') }, { value: 'page-column', label: t('By page and column') }, { value: 'sequential', label: t('Sequential') }, { value: 'rung', label: t('By rung line number (ladder pages)') }]} onChange={(v) => setNum({ scheme: v, pattern: NUMBERING_PRESETS[v] })} />
          <TextField label={t('Pattern ({n:3} counter, {page}, {col}, {row}, {potential}, {suffix})')} testid="num-pattern" value={cfg.pattern} onCommit={(v) => v.trim() && setNum({ pattern: v.trim() })} mono />
          <div className="bom-controls">
            <NumField label={t('Start at')} value={cfg.start} min={0} step={1} onCommit={(v) => setNum({ start: Math.round(v) })} />
            <NumField label={t('Step')} value={cfg.step} min={1} step={1} onCommit={(v) => setNum({ step: Math.round(v) })} />
          </div>
          <Check label={t('Draw conductors in the colour of their wire class')} testid="wire-colours" checked={project.settings.wireColours} onChange={(v) => st.exec({ type: 'project/settings', settings: { wireColours: v } })} />
          <div className="bom-controls">
            <button type="button" data-testid="wires-number-now" onClick={() => st.renumberWires()}>{t('Number wires now')}</button>
            <button type="button" data-testid="terminals-number-now" onClick={() => st.exec({ type: 'terminal/renumber' })}>{t('Number terminals now')}</button>
          </div>
          <p className="hint">{t('Wires on one net, and nets joined by interruption points, share one number. Numbers typed by hand stay.')}</p>
        </>
      )}
      {tab === 'classes' && (
        <>
          <p className="hint">{t('The company wire-class table: what a wire of each potential looks like. Defaults follow common practice (IEC 60204-1 clause 13.2) and must be set to your company standard.')}</p>
          <table className="bom" data-testid="class-table">
            <thead><tr><th>{t('Function')}</th><th>{t('Colour')}</th><th>{t('Cross-section (mm²)')}</th><th>{t('Wire type')}</th><th>{t('Suffix')}</th></tr></thead>
            <tbody>
              {project.wireClasses.map((c) => (
                <tr key={c.id}>
                  <td>{project.potentials.find((p) => p.id === c.id)?.label ?? c.id}</td>
                  <td><ColourSelect value={c.colour} onChange={(v) => setClass(c.id, { colour: v })} /></td>
                  <td><Cell width={60} value={c.crossSection} onCommit={(v) => setClass(c.id, { crossSection: v })} /></td>
                  <td><Cell width={110} value={c.type} onCommit={(v) => setClass(c.id, { type: v })} /></td>
                  <td><Cell width={60} value={c.suffix} onCommit={(v) => setClass(c.id, { suffix: v })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {tab === 'types' && (
        <>
          <p className="hint">{t('Single-core wire types. A wire can pick one instead of the class of its potential.')}</p>
          <table className="bom">
            <thead><tr><th>{t('Name')}</th><th>{t('Colour')}</th><th>{t('Cross-section (mm²)')}</th><th>{t('Wire type')}</th><th /></tr></thead>
            <tbody>
              {project.wireTypes.map((w) => (
                <tr key={w.id}>
                  <td>{w.id}</td>
                  <td><ColourSelect value={w.colour} onChange={(v) => setType(w.id, { colour: v })} /></td>
                  <td><Cell width={60} value={w.crossSection} onCommit={(v) => setType(w.id, { crossSection: v })} /></td>
                  <td><Cell width={110} value={w.type} onCommit={(v) => setType(w.id, { type: v })} /></td>
                  <td><button type="button" aria-label={t('Remove')} onClick={() => st.exec({ type: 'project/wires', wireTypes: project.wireTypes.filter((x) => x.id !== w.id) })}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="bom-controls">
            <TextField label={t('New wire type name')} testid="new-wire-type" value={typeId} onCommit={setTypeId} />
            <button type="button" data-testid="add-wire-type" onClick={() => { const id = typeId.trim(); if (id && !project.wireTypes.some((w) => w.id === id)) { st.exec({ type: 'project/wires', wireTypes: [...project.wireTypes, { id, type: 'H07V-K', crossSection: '1.5', colour: 'BK' }] }); setTypeId(''); } }}>{t('Add wire type')}</button>
          </div>
        </>
      )}
      {tab === 'cables' && (
        <>
          <p className="hint">{t('Multicore cables take their cores from the wires that name the cable. Flat ribbon and patch cables run between two connectors, pin to pin.')}</p>
          <table className="bom" data-testid="cable-table">
            <thead><tr><th>{t('Cable')}</th><th>{t('Type')}</th><th>{t('Part')}</th><th>{t('From')}</th><th>{t('To')}</th><th>{t('Length')}</th><th /></tr></thead>
            <tbody>
              {project.cables.map((c) => (
                <tr key={c.id}>
                  <td>{c.id}</td><td>{kindLabel(c.kind)}</td><td>{c.part ?? ''}</td><td>{c.from ?? ''}</td><td>{c.to ?? ''}</td>
                  <td><Cell width={70} value={c.length ?? ''} onCommit={(v) => st.exec({ type: 'cable/set', cable: { ...c, length: v || undefined } })} /></td>
                  <td><button type="button" aria-label={t('Remove')} onClick={() => st.exec({ type: 'cable/remove', id: c.id })}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="bom-controls">
            <TextField label={t('Designation')} testid="cable-id" value={cab.id} onCommit={(v) => setCab({ ...cab, id: v.trim() })} mono />
            <Select<CableKind> label={t('Type')} testid="cable-kind" value={cab.kind} options={[{ value: 'multicore', label: kindLabel('multicore') }, { value: 'ribbon', label: kindLabel('ribbon') }, { value: 'patch', label: kindLabel('patch') }]} onChange={(v) => setCab({ ...cab, kind: v })} />
            <Select label={t('Part')} testid="cable-part" value={cab.part ?? ''} options={[{ value: '', label: t('None') }, ...cableParts.map((p) => ({ value: p.id, label: p.code }))]} onChange={(v) => setCab({ ...cab, part: v || undefined })} />
            {cab.kind !== 'multicore' && <Select label={t('From')} testid="cable-from" value={cab.from ?? ''} options={[{ value: '', label: t('None') }, ...connectors.map((c) => ({ value: c, label: c }))]} onChange={(v) => setCab({ ...cab, from: v || undefined })} />}
            {cab.kind !== 'multicore' && <Select label={t('To')} testid="cable-to" value={cab.to ?? ''} options={[{ value: '', label: t('None') }, ...connectors.map((c) => ({ value: c, label: c }))]} onChange={(v) => setCab({ ...cab, to: v || undefined })} />}
            <button type="button" data-testid="add-cable" onClick={() => { if (cab.id && !project.cables.some((c) => c.id === cab.id)) { const part = cab.part; st.exec({ type: 'batch', label: 'add cable', commands: [...(part && lib.parts.get(part) ? [{ type: 'part/embed' as const, def: lib.parts.get(part)! }] : []), { type: 'cable/set', cable: cab }] }); setCab({ id: nextCableId(cab.id), kind: cab.kind }); } }}>{t('Add cable')}</button>
          </div>
        </>
      )}
    </Modal>
  );
}

function kindLabel(k: CableKind): string {
  return k === 'multicore' ? t('Multicore cable') : k === 'ribbon' ? t('Flat ribbon cable') : t('Patch cable');
}
const nextCableId = (id: string): string => id.replace(/(\d+)$/, (n) => String(Number(n) + 1));
