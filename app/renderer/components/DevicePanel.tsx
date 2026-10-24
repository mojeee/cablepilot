// Device data in the properties panel: the representations of the selected device and where each
// is drawn (cross-references), main and auxiliary functions, the assembly it sits in, its parts and
// user fields; box and connector pins; grouping into an assembly; saving a macro. Every change is a
// command (rule 4).
import { useMemo, useState } from 'react';
import { t, getLanguage } from '@shared/i18n';
import { deviceFunctions, deviceIndex, keyOf, type Device, type DeviceRepr } from '@shared/devices';
import { withPin } from '@shared/draw/box';
import { newId } from '@shared/ids';
import type { PartDef } from '@shared/library/types';
import { findPart } from '@shared/library/types';
import type { BoxEl, BoxPin, LoadData, Page, PartUse, PlcType, Project, SymbolEl } from '@shared/model/types';
import { loadCurrent } from '@shared/sizing';
import { PLC_TYPES } from '@shared/plc';
import { aspectsOf, parseDesignation } from '@shared/numbering';
import { useEditor } from '../state/editor';
import { NumField, Select, TextField } from './fields';

const exec = (c: Parameters<ReturnType<typeof useEditor.getState>['exec']>[0]) => useEditor.getState().exec(c);
const patchEl = (page: string, id: string, patch: Record<string, unknown>) => exec({ type: 'el/update', page, id, patch });

const roleLabel = (r: DeviceRepr): string => {
  if (r.kind === 'assembly') return t('Assembly outline');
  if (r.kind === 'box') return t('Box');
  if (r.role === 'coil') return t('Coil');
  if (r.role === 'aux') return r.contact === 'nc' ? t('Auxiliary contact (NC)') : t('Auxiliary contact (NO)');
  return t('Power part');
};

/** A library part to add to a device or to the project, or a custom one typed in. */
export function PartPicker({ onAdd, testid }: { onAdd: (def: PartDef, qty: number) => void; testid: string }) {
  const lib = useEditor((s) => s.lib);
  const project = useEditor((s) => s.history.present);
  const [query, setQuery] = useState('');
  const [id, setId] = useState('');
  const [qty, setQty] = useState(1);
  const [custom, setCustom] = useState(false);
  const [c, setC] = useState({ code: '', description: '', manufacturer: '' });
  const lang = getLanguage();
  const parts = useMemo(() => {
    const all = [...lib.parts.values(), ...project.parts.filter((p) => !lib.parts.has(p.id))];
    const q = query.trim().toLowerCase();
    return all.filter((p) => !q || p.code.toLowerCase().includes(q) || p.title[lang].toLowerCase().includes(q) || p.category.includes(q)).sort((a, b) => a.category.localeCompare(b.category) || a.code.localeCompare(b.code, 'en', { numeric: true }));
  }, [lib, project.parts, query, lang]);
  const chosen = parts.find((p) => p.id === id) ?? parts[0];
  const add = () => {
    if (custom) {
      if (!c.code.trim()) return;
      const text = c.description.trim() || c.code.trim();
      onAdd({ id: newId('cp'), kind: 'part', title: { en: text, it: text }, category: 'accessories', code: c.code.trim(), manufacturer: c.manufacturer.trim(), description: { en: text, it: text }, data: {}, source: 'Entered by the user', verification: 'secondary', verifiedFrom: 'Typed by the user in this project' }, qty);
      setC({ code: '', description: '', manufacturer: '' });
    } else if (chosen) onAdd(chosen, qty);
  };
  return (
    <div className="part-picker">
      <label className="prop"><input type="checkbox" checked={custom} onChange={(e) => setCustom(e.target.checked)} /> <span>{t('Custom part (not in the library)')}</span></label>
      {custom ? (
        <>
          <TextField label={t('Part code')} value={c.code} onCommit={(v) => setC({ ...c, code: v })} mono testid={`${testid}-code`} />
          <TextField label={t('Description')} value={c.description} onCommit={(v) => setC({ ...c, description: v })} />
          <TextField label={t('Manufacturer')} value={c.manufacturer} onCommit={(v) => setC({ ...c, manufacturer: v })} />
        </>
      ) : (
        <>
          <input type="search" aria-label={t('Search parts')} placeholder={t('Search parts')} value={query} onChange={(e) => setQuery(e.target.value)} />
          <select aria-label={t('Part')} data-testid={`${testid}-select`} value={chosen?.id ?? ''} onChange={(e) => setId(e.target.value)}>
            {parts.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.title[lang]}</option>)}
          </select>
        </>
      )}
      <NumField label={t('Quantity')} value={qty} min={1} step={1} onCommit={setQty} />
      <button type="button" data-testid={`${testid}-add`} onClick={add}>{t('Add part')}</button>
    </div>
  );
}

export function partTitle(project: Project, lib: ReturnType<typeof useEditor.getState>['lib'], id: string): string {
  const p = findPart(lib, project.parts, id);
  return p ? `${p.code} · ${p.title[getLanguage()]}` : id;
}

/** The parts list of one device with quantities, and the picker to add more. */
function DeviceParts({ device, project }: { device: Device; project: Project }) {
  const lib = useEditor((s) => s.lib);
  const parts = device.rec?.parts ?? [];
  const set = (next: PartUse[]) => exec({ type: 'device/update', key: device.key, patch: { parts: next } });
  return (
    <>
      <h4>{t('Parts')}</h4>
      {parts.length === 0 && <p className="hint">{t('No part assigned yet. The BOM lists this device without a part code.')}</p>}
      <ul className="parts" data-testid="device-parts">
        {parts.map((u, i) => (
          <li key={u.part}>
            <span title={partTitle(project, lib, u.part)}>{partTitle(project, lib, u.part)}</span>
            <NumField label={t('Quantity')} value={u.qty} min={1} step={1} onCommit={(v) => set(parts.map((x, j) => (j === i ? { ...x, qty: v } : x)))} />
            <button type="button" aria-label={t('Remove')} onClick={() => set(parts.filter((_, j) => j !== i))}>✕</button>
          </li>
        ))}
      </ul>
      <PartPicker
        testid="part"
        onAdd={(def, qty) => {
          const same = parts.find((x) => x.part === def.id);
          const next = same ? parts.map((x) => (x.part === def.id ? { ...x, qty: x.qty + qty } : x)) : [...parts, { part: def.id, qty }];
          exec({ type: 'batch', label: 'assign part', commands: [{ type: 'part/embed', def }, { type: 'device/update', key: device.key, patch: { parts: next } }] });
        }}
      />
    </>
  );
}

/**
 * Load and feeder data for sizing (rule 12): motor nameplate (power, cos φ, efficiency or current), starter and tripping
 * curve, or a load current. The sizing dialog computes everything else from these and the supply data.
 */
function LoadSection({ device, project }: { device: Device; project: Project }) {
  const load = device.rec?.load;
  const set = (patch: Partial<LoadData> | null) => exec({ type: 'device/update', key: device.key, patch: { load: patch === null ? null : { kind: 'motor', ...load, ...patch } } });
  const clean = (v: number, p: keyof LoadData) => (v > 0 ? set({ [p]: v }) : set({ [p]: undefined }));
  const lc = loadCurrent(load, project.settings.supply);
  return (
    <section className="load-data" data-testid="load-section">
      <h4>{t('Load and feeder data (sizing)')}</h4>
      <Select<'' | LoadData['kind']> label={t('Kind of load')} testid="load-kind" value={load?.kind ?? ''} options={[{ value: '', label: t('None') }, { value: 'motor', label: t('Motor (nameplate)') }, { value: 'load', label: t('Other load (current or power)') }]} onChange={(v) => (v ? set({ kind: v }) : set(null))} />
      {load && (
        <>
          <NumField label={load.kind === 'motor' ? t('Rated power (kW)') : t('Power (kW)')} testid="load-power" value={load.powerKw ?? 0} min={0} step={0.1} onCommit={(v) => clean(v, 'powerKw')} />
          <NumField label={t('Rated current (A), overrides the computed one')} testid="load-current" value={load.current ?? 0} min={0} step={0.1} onCommit={(v) => clean(v, 'current')} />
          <NumField label={t('cos φ')} testid="load-cosphi" value={load.cosPhi ?? 0} min={0} max={1} step={0.01} onCommit={(v) => clean(v, 'cosPhi')} />
          {load.kind === 'motor' && <NumField label={t('Efficiency (%)')} testid="load-efficiency" value={load.efficiency ?? 0} min={0} max={100} step={0.1} onCommit={(v) => clean(v, 'efficiency')} />}
          {load.kind === 'motor' && <Select<NonNullable<LoadData['starter']>> label={t('Starter')} value={load.starter ?? 'dol'} options={[{ value: 'dol', label: t('Direct on line') }, { value: 'star-delta', label: t('Star-delta') }]} onChange={(v) => set({ starter: v })} />}
          <Select<NonNullable<LoadData['curve']>> label={t('Breaker curve')} value={load.curve ?? 'C'} options={[{ value: 'B', label: 'B' }, { value: 'C', label: 'C' }, { value: 'D', label: 'D' }]} onChange={(v) => set({ curve: v })} />
          <NumField label={t('Feeder length (m), when no cable or wire states one')} value={load.length ?? 0} min={0} step={1} onCommit={(v) => clean(v, 'length')} />
          <p className="hint" data-testid="load-ib">{lc.ib !== undefined ? t('Design current Ib {ib} A ({source})', { ib: lc.ib, source: lc.source === 'nameplate' ? t('nameplate') : t('computed') }) : t('Design current: data missing')}</p>
        </>
      )}
      <button type="button" data-testid="device-sizing" onClick={() => { const s = useEditor.getState(); s.patch({ sizingFocus: device.key }); s.setDialog('sizing'); }}>{t('Size this feeder...')}</button>
    </section>
  );
}

/** Device section for a selected symbol or box: representations, functions, links, parent, parts, fields. */
export function DeviceSection({ el, page, project }: { el: SymbolEl | BoxEl; page: Page; project: Project }) {
  const lib = useEditor((s) => s.lib);
  const lang = project.settings.drawingLanguage;
  const idx = deviceIndex(project, lib);
  if (!el.designation) return <p className="hint">{t('Give this element a designation to make it a device with cross-references and parts.')}</p>;
  const hit = idx.byEl.get(`${page.id}/${el.id}`);
  if (!hit) return null;
  const d = hit.device;
  const fn = deviceFunctions(d);
  const asp = aspectsOf(page, el);
  const linkable = idx.devices.filter((o) => {
    const p = parseDesignation(o.key);
    return o.key !== d.key && (p.function ?? '') === asp.function && (p.location ?? '') === asp.location && p.letters;
  });
  const product = (k: string) => { const p = parseDesignation(k); return `-${p.letters}${p.number}${p.suffix ?? ''}`; };
  return (
    <section className="device" data-testid="device-section">
      <h3>{t('Device {key}', { key: d.key })}</h3>
      <p className="hint">{t('{coils} coil, {main} power parts, {aux} auxiliary contacts', { coils: fn.coils, main: fn.main, aux: fn.aux })}</p>
      <ul className="reps" data-testid="device-reps">
        {d.reps.map((r) => (
          <li key={`${r.page}/${r.el}`} className={r.el === el.id && r.page === page.id ? 'self' : ''}>
            <button type="button" onClick={() => { const s = useEditor.getState(); s.setPage(r.page); s.select([r.el]); }}>{roleLabel(r)}: {r.position}</button>
          </li>
        ))}
      </ul>
      {el.kind === 'symbol' && lib.symbols.get(el.symbolId)?.function === 'coil' && (
        <TextField label={t('Note on the contact state shown')} testid="prop-state-note" value={el.stateNote?.[lang] ?? ''} multiline onCommit={(v) => patchEl(page.id, el.id, { stateNote: { ...el.stateNote, [lang]: v } })} />
      )}
      <Select
        label={t('Link to device')}
        testid="device-link"
        value=""
        options={[{ value: '', label: '-' }, ...linkable.map((o) => ({ value: product(o.key), label: o.key }))]}
        onChange={(v) => v && exec({ type: 'device/relink', page: page.id, id: el.id, designation: v })}
      />
      <Select
        label={t('Mounted on or in assembly')}
        testid="device-parent"
        value={d.rec?.parent ?? ''}
        options={[{ value: '', label: t('None') }, ...idx.devices.filter((o) => o.key !== d.key).map((o) => ({ value: o.key, label: o.key }))]}
        onChange={(v) => exec({ type: 'device/update', key: d.key, patch: { parent: v || null } })}
      />
      <DeviceParts device={d} project={project} />
      <LoadSection device={d} project={project} />
      {project.settings.bom.userFields.map((f) => (
        <TextField key={f.id} label={f.label[lang] || f.id} value={d.rec?.fields[f.id] ?? ''} onCommit={(v) => exec({ type: 'device/update', key: d.key, patch: { fields: { [f.id]: v } } })} />
      ))}
    </section>
  );
}

const plcTypeLabel = (v: PlcType): string => (v === 'cpu' ? t('CPU') : v === 'di' ? t('Digital inputs') : v === 'do' ? t('Digital outputs') : v === 'ai' ? t('Analog inputs') : t('Analog outputs'));

/** Properties of a black box or connector: names, size, mate and the numbered, named pins. */
export function BoxProps({ el, page, project }: { el: BoxEl; page: Page; project: Project }) {
  const up = (patch: Record<string, unknown>) => patchEl(page.id, el.id, patch);
  const lang = project.settings.drawingLanguage;
  const [side, setSide] = useState<BoxPin['side']>('right');
  const setPin = (i: number, patch: Partial<BoxPin>) => up({ pins: el.pins.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const sides: { value: BoxPin['side']; label: string }[] = [{ value: 'left', label: t('Left') }, { value: 'right', label: t('Right') }, { value: 'top', label: t('Top') }, { value: 'bottom', label: t('Bottom') }];
  return (
    <>
      <h3>{el.variant === 'connector' ? t('Connector') : t('Black box')}</h3>
      <TextField label={t('Designation')} testid="prop-designation" value={el.designation} onCommit={(v) => up({ designation: v })} mono />
      <TextField label={t('Location (+)')} value={el.location ?? ''} placeholder={page.location ?? ''} onCommit={(v) => up({ location: v || undefined })} mono />
      <TextField label={lang === 'it' ? t('Function text (Italian)') : t('Function text (English)')} value={el.functionText?.[lang] ?? ''} onCommit={(v) => up({ functionText: { ...el.functionText, [lang]: v } })} />
      <Select<BoxEl['variant']> label={t('Kind')} value={el.variant} options={[{ value: 'blackbox', label: t('Black box') }, { value: 'connector', label: t('Connector') }]} onChange={(v) => up({ variant: v })} />
      {el.variant === 'connector' && (
        <>
          <Select<'plug' | 'socket' | ''> label={t('Plug or socket')} value={el.gender ?? ''} options={[{ value: '', label: '-' }, { value: 'plug', label: t('Plug') }, { value: 'socket', label: t('Socket') }]} onChange={(v) => up({ gender: v || undefined })} />
          <TextField label={t('Mating connector (designation)')} value={el.mate ?? ''} onCommit={(v) => up({ mate: v || undefined })} mono />
        </>
      )}
      <NumField label={t('Width (mm)')} value={el.w} min={5} onCommit={(v) => up({ w: v })} />
      <NumField label={t('Height (mm)')} value={el.h} min={5} onCommit={(v) => up({ h: v })} />
      {el.plc && (
        <>
          <h4>{t('PLC card')}</h4>
          <Select<PlcType> label={t('Card type')} testid="plc-type" value={el.plc.type} options={PLC_TYPES.map((v) => ({ value: v, label: plcTypeLabel(v) }))} onChange={(v) => up({ plc: { ...el.plc, type: v } })} />
          <TextField label={t('Rack')} value={el.plc.rack} onCommit={(v) => v && up({ plc: { ...el.plc, rack: v } })} mono />
          <NumField label={t('Slot')} value={el.plc.slot} min={0} step={1} onCommit={(v) => up({ plc: { ...el.plc, slot: v } })} />
        </>
      )}
      <h4>{t('Pins')}</h4>
      <ul className="pins" data-testid="box-pins">
        {el.pins.map((p, i) => (
          <li key={i}>
            <TextField label={t('Pin number')} value={p.id} onCommit={(v) => v && setPin(i, { id: v })} mono />
            {el.plc ? (
              <>
                <TextField label={t('Address')} testid={`pin-address-${i}`} value={p.address ?? ''} onCommit={(v) => setPin(i, { address: v || undefined })} mono />
                <TextField label={t('Tag')} value={p.tag ?? ''} onCommit={(v) => setPin(i, { tag: v || undefined })} mono />
                <TextField label={t('Comment')} value={p.comment ?? ''} onCommit={(v) => setPin(i, { comment: v || undefined })} />
              </>
            ) : <TextField label={t('Pin name')} value={p.name ?? ''} onCommit={(v) => setPin(i, { name: v || undefined })} />}
            <Select<BoxPin['side']> label={t('Side')} value={p.side} options={sides} onChange={(v) => setPin(i, { side: v })} />
            <NumField label={t('Offset (mm)')} value={p.offset} min={0} step={2.5} onCommit={(v) => setPin(i, { offset: v })} />
            <button type="button" aria-label={t('Remove')} onClick={() => up({ pins: el.pins.filter((_, j) => j !== i) })}>✕</button>
          </li>
        ))}
      </ul>
      <div className="row-buttons">
        <select aria-label={t('Side')} value={side} onChange={(e) => setSide(e.target.value as BoxPin['side'])}>{sides.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
        <button type="button" data-testid="add-pin" onClick={() => { const next = withPin(el, side, String(el.pins.length + 1)); up({ pins: next.pins, w: next.w, h: next.h }); }}>{t('Add pin')}</button>
      </div>
    </>
  );
}

/** Multi-selection tools: group the devices into a nested assembly; save the selection as a macro. */
export function SelectionTools({ page, selection }: { page: Page; selection: string[] }) {
  const [assembly, setAssembly] = useState('');
  const [name, setName] = useState('');
  const els = page.elements.filter((e) => selection.includes(e.id));
  const devs = els.filter((e): e is SymbolEl | BoxEl => (e.kind === 'symbol' || e.kind === 'box') && !!e.designation);
  const group = () => {
    if (!assembly.trim() || devs.length === 0) return;
    const xs = els.flatMap((e) => ('x' in e ? [e.x, e.kind === 'box' ? e.x + e.w : e.x] : []));
    const ys = els.flatMap((e) => ('y' in e ? [e.y, e.kind === 'box' ? e.y + e.h : e.y] : []));
    const x = Math.min(...xs) - 12, y = Math.min(...ys) - 14;
    const children = [...new Set(devs.map((e) => keyOf(page, e.designation, e.location)))];
    const id = newId('as');
    exec({ type: 'assembly/create', page: page.id, rect: { id, kind: 'rect', x, y, w: Math.max(...xs) + 12 - x, h: Math.max(...ys) + 14 - y, dashed: true, assembly: assembly.trim() }, children });
    useEditor.getState().patch({ selection: [id] });
    setAssembly('');
  };
  return (
    <section className="selection-tools">
      <h4>{t('Nested assembly')}</h4>
      <p className="hint">{t('Draws a dashed outline around the selected devices and mounts them on the assembly.')}</p>
      <TextField label={t('Assembly designation')} testid="assembly-designation" value={assembly} onCommit={setAssembly} mono />
      <button type="button" data-testid="group-assembly" disabled={devs.length === 0} onClick={group}>{t('Group as assembly')}</button>
      <h4>{t('Macro')}</h4>
      <p className="hint">{t('Saves the selected symbols, boxes and wires to the company library to place them again.')}</p>
      <TextField label={t('Macro name')} testid="macro-name" value={name} onCommit={setName} />
      <button type="button" data-testid="save-macro" disabled={!name.trim()} onClick={() => { void useEditor.getState().saveMacro(name); setName(''); }}>{t('Save as macro')}</button>
    </section>
  );
}
