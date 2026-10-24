// The cabinet layout window (M6 part 3): the devices not yet placed, the enclosure, plate, rail and duct parts of
// the library, the layout suggestion with the rules it applies, templates, exchange files and the duct fill rate.
// Everything it changes goes through the editor's commands (undo) or the proposal preview (Accept / Reject).
import { useEffect, useMemo, useState } from 'react';
import { t, getLanguage } from '@shared/i18n';
import { layoutIssues } from '@shared/cabinet/check';
import { ductFills } from '@shared/cabinet/fill';
import { cabinetOf } from '@shared/cabinet/model';
import { layoutPageCommands } from '@shared/cabinet/pages';
import { unplacedDevices } from '@shared/cabinet/place';
import { shortDesignation } from '@shared/cabinet/draw';
import { suggestLayout } from '@shared/cabinet/suggest';
import { routerOf } from '@shared/cabinet/route';
import { wireRows } from '@shared/reports';
import { newId } from '@shared/ids';
import type { LayoutSettings } from '@shared/model/types';
import { enclosureParts, plateParts, placeDevices, placeFramePart, ductParts, railPart, lineItemSession } from '../cad/layoutCmds';
import { useCad } from '../state/cad';
import { useEditor } from '../state/editor';
import { useLayout, type LayoutTab } from '../state/layout';
import { Check, NumField } from './fields';
import { Modal } from './Modal';

const TABS: { id: LayoutTab; label: () => string }[] = [
  { id: 'devices', label: () => t('Devices') },
  { id: 'structure', label: () => t('Enclosure and parts') },
  { id: 'suggestion', label: () => t('Suggestion') },
  { id: 'templates', label: () => t('Templates') },
  { id: 'exchange', label: () => t('Exchange') },
  { id: 'ducts', label: () => t('Ducts and wires') },
];
const MOUNT: Record<string, () => string> = { rail: () => t('DIN rail'), plate: () => t('Plate'), door: () => t('Door') };
const size = (d: { w: number; h: number; d: number }) => `${d.w} x ${d.h} x ${d.d} mm`;

function Devices({ close }: { close: () => void }) {
  const project = useEditor((s) => s.history.present);
  const lib = useEditor((s) => s.lib);
  const un = useMemo(() => unplacedDevices(project, lib), [project, lib]);
  const issues = useMemo(() => layoutIssues(project, lib).filter((i) => i.kind !== 'unplaced'), [project, lib]);
  const place = (keys: string[]) => { close(); setTimeout(() => placeDevices(keys), 30); };
  return (
    <div data-testid="layout-devices">
      <h3>{t('Not yet placed')} ({un.length})</h3>
      {un.length === 0 ? <p className="hint" data-testid="all-placed">{t('Every device of the schematic that belongs in the cabinet is placed.')}</p> : (
        <>
          <div className="bom-controls"><button type="button" className="primary" data-testid="place-all" onClick={() => place([])}>{t('Place them one after the other')}</button></div>
          <table className="bom" data-testid="unplaced">
            <thead><tr><th scope="col">{t('Designation')}</th><th scope="col">{t('Part code')}</th><th scope="col">{t('Size')}</th><th scope="col">{t('Mounting')}</th><th scope="col" /></tr></thead>
            <tbody>{un.map((d) => (
              <tr key={d.key}><td className="mono">{d.key}</td><td className="mono">{d.part?.code}</td><td>{d.w} x {d.h} x {d.d} mm{d.assumed ? ` (${t('assumed')})` : ''}</td><td>{MOUNT[d.mount]()}</td>
                <td><button type="button" data-testid={`place-${shortDesignation(d.key)}`} onClick={() => place([d.key])}>{t('Place')}</button></td></tr>
            ))}</tbody>
          </table>
        </>
      )}
      <h3>{t('Checks of the layout')} ({issues.length})</h3>
      {issues.length === 0 ? <p className="hint">{t('No problems found on the layout.')}</p> : (
        <ul data-testid="layout-issues">{issues.map((i, n) => (
          <li key={n}>{i.text}{i.element && i.page ? <> <button type="button" onClick={() => { useEditor.getState().patch({ pageId: i.page as string, selection: [i.element as string], dialog: null }); }}>{t('Show')}</button></> : null}</li>
        ))}</ul>
      )}
    </div>
  );
}

function Structure({ close }: { close: () => void }) {
  const project = useEditor((s) => s.history.present);
  const lang = getLanguage();
  const cab = cabinetOf(project);
  const run = (fn: () => void) => { close(); setTimeout(fn, 30); };
  const label = (p: { title: { en: string; it: string }; code: string }) => `${p.title[lang]} (${p.code})`;
  const addPages = (kind: 'front' | 'door' | 'side') => {
    const ed = useEditor.getState();
    if (kind === 'front') return ed.addPage('layout', t('Cabinet layout, mounting plate'), ed.project().settings.defaultSize);
    const enc = cab.enclosure;
    if (!enc) return;
    const r = layoutPageCommands(ed.project(), enc, kind === 'door');
    if (kind === 'door' && !cab.doors.length) ed.exec({ type: 'batch', label: 'Add layout page', commands: [...r.cmds, { type: 'el/add', page: r.ids.door, elements: [{ ...enc, id: newId('c'), auto: undefined }] }] });
    else if (r.cmds.length) ed.exec({ type: 'batch', label: 'Add layout page', commands: r.cmds });
    ed.patch({ pageId: kind === 'door' ? r.ids.door : r.ids.side, selection: [], dialog: null });
  };
  return (
    <div data-testid="layout-structure">
      <h3>{t('Layout pages')}</h3>
      <div className="bom-controls">
        <button type="button" data-testid="add-front-page" onClick={() => addPages('front')}>{t('Add front view page')}</button>
        <button type="button" disabled={!cab.enclosure || cab.doors.length > 0} onClick={() => addPages('door')}>{t('Add door page')}</button>
        <button type="button" disabled={!cab.enclosure || cab.sides.length > 0} onClick={() => addPages('side')}>{t('Add side view page')}</button>
      </div>
      <p className="hint">{t('Open a front view page, then place the enclosure and the plate from the library, and draw rails and ducts. All of it can be moved and resized with grips, typed coordinates and snaps.')}</p>
      <h3>{t('Enclosures')}</h3>
      <ul className="parts-list">{enclosureParts().map((p) => <li key={p.id}><span>{label(p)}</span> <span className="hint">{p.dimensions && size(p.dimensions)}</span> <button type="button" data-testid={`place-part-${p.id}`} onClick={() => run(() => placeFramePart(p.id))}>{t('Place')}</button></li>)}</ul>
      <h3>{t('Mounting plates')}</h3>
      <ul className="parts-list">{plateParts().map((p) => <li key={p.id}><span>{label(p)}</span> <button type="button" data-testid={`place-part-${p.id}`} onClick={() => run(() => placeFramePart(p.id))}>{t('Place')}</button></li>)}</ul>
      <h3>{t('Rails and ducts')}</h3>
      <ul className="parts-list">
        {railPart() && <li><span>{label(railPart()!)}</span> <button type="button" data-testid="draw-rail" onClick={() => run(() => useCad.getState().go(lineItemSession('rail')))}>{t('Draw')}</button></li>}
        {ductParts().map((p) => <li key={p.id}><span>{label(p)}</span> <button type="button" onClick={() => run(() => useCad.getState().go(lineItemSession('duct', p.id)))}>{t('Draw')}</button></li>)}
      </ul>
    </div>
  );
}

function Suggestion() {
  const project = useEditor((s) => s.history.present);
  const lib = useEditor((s) => s.lib);
  const cfg = project.settings.layout;
  const set = (patch: Partial<LayoutSettings>) => useEditor.getState().exec({ type: 'project/settings', settings: { layout: { ...cfg, ...patch } } });
  const dry = useMemo(() => suggestLayout(project, lib), [project, lib]);
  return (
    <div data-testid="layout-suggestion">
      <p>{t('The suggestion proposes the enclosure and plate, rails and ducts and a place for every device. You see it as a preview, accept it, and then edit it freely. Items you moved or locked stay where they are when you suggest again.')}</p>
      <div className="grid-2">
        <NumField label={t('Spare space on the plate (%)')} testid="cfg-spare" value={cfg.sparePct} min={0} max={500} step={5} onCommit={(v) => set({ sparePct: v })} />
        <NumField label={t('Largest duct fill rate (%)')} testid="cfg-duct" value={cfg.ductFillMax} min={1} max={100} step={5} onCommit={(v) => set({ ductFillMax: v })} />
        <NumField label={t('Gap between devices (mm)')} value={cfg.gap} min={0} step={1} onCommit={(v) => set({ gap: v })} />
        <NumField label={t('Clearance above and below a row (mm)')} value={cfg.rowClearance} min={0} step={1} onCommit={(v) => set({ rowClearance: v })} />
        <NumField label={t('Extra wire length per end (mm)')} value={cfg.slack} min={0} step={10} onCommit={(v) => set({ slack: v })} />
      </div>
      <p className="hint">{t('These are company choices, not requirements of a standard.')}</p>
      <div className="bom-controls"><button type="button" className="primary" data-testid="suggest-layout" disabled={dry.commands.length === 0} onClick={() => void useLayout.getState().suggest()}>{t('Suggest a layout')}</button></div>
      {dry.commands.length === 0 && <p className="hint">{t('Every device is placed and nothing is left to arrange.')}</p>}
      {dry.issues.map((i, n) => <p key={n} className="warn" role="status">{i}</p>)}
      <h3>{t('Rules applied')}</h3>
      <ul className="claims" data-testid="layout-rules">{dry.rules.map((r, n) => <li key={n}><span>{r.text}</span> <em className={`src src-${r.source.kind}`}>{r.source.ref}</em></li>)}</ul>
    </div>
  );
}

function Templates() {
  const templates = useLayout((s) => s.templates);
  const [name, setName] = useState('');
  const lang = getLanguage();
  const hasLayout = !!cabinetOf(useEditor((s) => s.history.present)).enclosure;
  return (
    <div data-testid="layout-templates">
      <p>{t('A layout template keeps the enclosure, the plate, the rails, ducts and zones and the standard device groups. It is saved to the company library and can be loaded into a new project.')}</p>
      <div className="bom-controls">
        <label className="prop"><span>{t('Name')}</span><input type="text" data-testid="template-name" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <button type="button" data-testid="save-template" disabled={!hasLayout} onClick={() => void useLayout.getState().saveTemplate(name)}>{t('Save the layout as a template')}</button>
      </div>
      <h3>{t('Company templates')} ({templates.length})</h3>
      {templates.length === 0 ? <p className="hint">{t('No template saved yet.')}</p> : (
        <ul className="parts-list" data-testid="template-list">{templates.map((x) => (
          <li key={x.id}><span>{x.title[lang]}</span> <span className="hint">{size(x.enclosure)}, {x.slots.length} {t('device places')}</span> <button type="button" data-testid={`load-template-${x.id}`} onClick={() => useLayout.getState().useTemplate(x.id)}>{t('Load into this project')}</button></li>
        ))}</ul>
      )}
    </div>
  );
}

function Exchange() {
  const folder = useLayout((s) => s.folder);
  const L = useLayout.getState;
  return (
    <div data-testid="layout-exchange">
      <h3>{t('Export')}</h3>
      <div className="bom-controls">
        <button type="button" data-testid="export-layout-json" onClick={() => void L().exportFile('json')}>{t('Layout as JSON')}</button>
        <button type="button" data-testid="export-layout-csv" onClick={() => void L().exportFile('csv')}>{t('Layout as CSV')}</button>
        <button type="button" data-testid="export-layout-dxf" onClick={() => void L().exportDxf('views')}>{t('2D views as DXF')}</button>
        <button type="button" data-testid="export-drilling-dxf" onClick={() => void L().exportDxf('drilling')}>{t('Mounting plate for drilling (DXF)')}</button>
      </div>
      <p className="hint">{t('The formats are described in docs/layout-format.md: designation, part code, enclosure, plate or door, rail, x, y, z, rotation and size per item, in millimetres.')}</p>
      <h3>{t('Import')}</h3>
      <div className="bom-controls">
        <button type="button" data-testid="import-layout" onClick={() => void L().importFile()}>{t('Layout file (JSON or CSV)...')}</button>
        <button type="button" data-testid="import-item-master" onClick={() => void L().importItemMaster()}>{t('Sizes from an ERP item master (CSV or XLSX)...')}</button>
      </div>
      <p className="hint">{t('An import is shown as a preview first: Accept it in the assistant panel, or Reject it. Accepted, it is one undo step. The item master uses the column mapping of the warehouse; map the width, height and depth columns there.')}</p>
      <h3>{t('Watched folder')}</h3>
      <div className="bom-controls">
        <button type="button" data-testid="layout-folder" onClick={() => void L().pickFolder()}>{t('Choose a folder...')}</button>
        <button type="button" disabled={!folder} onClick={() => void L().refreshFolder()}>{t('Read the newest file now')}</button>
        <Check label={t('Watch the folder for new files')} checked={!!folder?.watching} onChange={(v) => void L().watch(v)} />
      </div>
      <p className="hint">{folder ? t('Folder: {name}. The newest JSON or CSV layout file in it is read when you ask or when it changes; you still accept the preview.', { name: folder.name }) : t('No folder chosen. A live connection to a specific ERP system is decided with the owner; files and a watched folder work today.')}</p>
    </div>
  );
}

function Ducts() {
  const project = useEditor((s) => s.history.present);
  const lib = useEditor((s) => s.lib);
  const fills = useMemo(() => ductFills(project, lib), [project, lib]);
  const rows = useMemo(() => wireRows(project, lib), [project, lib]);
  const est = rows.filter((r) => r[7].startsWith('~')).length, typed = rows.filter((r) => r[7] && !r[7].startsWith('~')).length;
  const cab = cabinetOf(project);
  return (
    <div data-testid="layout-ducts">
      <h3>{t('Duct fill rate')}</h3>
      {fills.length === 0 ? <p className="hint">{cab.ducts.length ? t('No wire is routed through a duct yet: place the devices first.') : t('There are no ducts on the layout.')}</p> : (
        <table className="bom" data-testid="duct-fill">
          <thead><tr><th scope="col">{t('Duct')}</th><th scope="col">{t('Section (mm²)')}</th><th scope="col">{t('Wires')}</th><th scope="col">{t('Fill rate')}</th><th scope="col">{t('Limit')}</th></tr></thead>
          <tbody>{fills.map((f) => <tr key={f.id} className={f.over ? 'over' : ''}><td>{f.label}</td><td>{Math.round(f.innerMm2)}</td><td>{f.wires}</td><td>{f.pct} %{f.over ? ` (${t('over the limit')})` : ''}</td><td>{f.max} %</td></tr>)}</tbody>
        </table>
      )}
      <p className="hint">{t('The fill rate counts the wires routed through each duct, from their outer diameter (typical values, to verify) over the inner section of the duct. It is a planning estimate.')}</p>
      <h3>{t('Wire lengths')}</h3>
      <p data-testid="wire-length-summary">{routerOf(project) ? t('{est} wires have a length estimated along the ducts (marked ~ in the wire list), {typed} have a length you typed, which always wins.', { est, typed }) : t('Place the devices to get wire lengths estimated along the ducts.')}</p>
    </div>
  );
}

export function LayoutDialog() {
  const tab = useLayout((s) => s.tab);
  const close = () => useEditor.getState().setDialog(null);
  useEffect(() => { void useLayout.getState().loadTemplates(); void useLayout.getState().loadFolder(); }, []);
  const project = useEditor((s) => s.history.present);
  const hasPage = project.pages.some((p) => p.layout);
  return (
    <Modal title={t('Cabinet layout')} wide onClose={close}>
      <div className="tabs" role="tablist">
        {TABS.map((x) => <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} data-testid={`layout-tab-${x.id}`} className={tab === x.id ? 'selected' : ''} onClick={() => useLayout.getState().setTab(x.id)}>{x.label()}</button>)}
      </div>
      {!hasPage && tab === 'devices' && <p className="hint" data-testid="no-layout">{t('There is no layout yet. Suggest a layout, load a template, or add a layout page and draw it.')}</p>}
      {tab === 'devices' && <Devices close={close} />}
      {tab === 'structure' && <Structure close={close} />}
      {tab === 'suggestion' && <Suggestion />}
      {tab === 'templates' && <Templates />}
      {tab === 'exchange' && <Exchange />}
      {tab === 'ducts' && <Ducts />}
      <div className="bom-controls">
        <button type="button" data-testid="open-3d" onClick={() => useEditor.getState().setDialog('layout3d')}>{t('3D view')}</button>
      </div>
    </Modal>
  );
}

