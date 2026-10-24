import { useEffect } from "react";
import { t, getLanguage } from '@shared/i18n';
import { usesValue } from '@shared/draw/symbol';
import { SHEET_SIZES, type SheetSize } from '@shared/sheets';
import type { El, Page, Project, SymbolEl, TableEl, WarningSign } from '@shared/model/types';
import { useEditor } from '../state/editor';
import { useUi } from '../state/ui';
import { Check, NumField, Select, TextField } from './fields';
import { BoxProps, DeviceSection, SelectionTools } from './DevicePanel';
import { pageTypeLabel } from './PageNavigator';

const patchEl = (page: string, id: string, patch: Record<string, unknown>) => useEditor.getState().exec({ type: 'el/update', page, id, patch });

function SymbolProps({ el, page, project }: { el: SymbolEl; page: Page; project: Project }) {
  const lib = useEditor((s) => s.lib);
  const def = lib.symbols.get(el.symbolId) ?? project.symbols.find((s) => s.id === el.symbolId);
  const valueInside = def ? usesValue(def.graphics) : false;
  const isPotentialTag = def?.function === 'potential-tag';
  const isInterruption = def?.function === 'interruption';
  const up = (patch: Record<string, unknown>) => patchEl(page.id, el.id, patch);
  const lang = getLanguage();
  return (
    <>
      <h3>{def ? def.title[lang] : el.symbolId}</h3>
      <TextField label={t('Designation')} testid="prop-designation" value={el.designation} onCommit={(v) => up({ designation: v })} mono />
      <TextField label={t('Location (+)')} value={el.location ?? ''} placeholder={page.location ?? ''} onCommit={(v) => up({ location: v || undefined })} mono />
      <TextField label={t('Function text (English)')} value={el.functionText?.en ?? ''} onCommit={(v) => up({ functionText: { ...el.functionText, en: v } })} multiline />
      <TextField label={t('Function text (Italian)')} value={el.functionText?.it ?? ''} onCommit={(v) => up({ functionText: { ...el.functionText, it: v } })} multiline />
      {isPotentialTag ? (
        <Select label={t('Potential')} value={el.value ?? ''} options={[{ value: '', label: t('None') }, ...project.potentials.map((p) => ({ value: p.id, label: p.label }))]} onChange={(v) => up({ value: v || undefined })} />
      ) : (
        <TextField label={isInterruption ? t('Signal or potential name') : valueInside ? t('Address') : t('Value')} testid={isInterruption ? 'prop-signal' : undefined} value={el.value ?? ''} onCommit={(v) => up({ value: v || undefined })} mono />
      )}
      <Select label={t('Rotation')} value={String(el.rot)} options={['0', '90', '180', '270'].map((r) => ({ value: r, label: `${r}°` }))} onChange={(v) => up({ rot: Number(v) })} />
      <Check label={t('Mirrored')} checked={el.mirror} onChange={(v) => up({ mirror: v })} />
      {def && !isPotentialTag && !isInterruption && <DeviceSection el={el} page={page} project={project} />}
    </>
  );
}

function TableProps({ el, page }: { el: TableEl; page: string }) {
  const up = (patch: Partial<TableEl>) => patchEl(page, el.id, patch);
  const cols = el.colWidths.length;
  return (
    <>
      <div className="row-buttons">
        <button type="button" onClick={() => up({ cells: [...el.cells, Array(cols).fill('')] })}>{t('Add row')}</button>
        <button type="button" disabled={el.cells.length <= 1} onClick={() => up({ cells: el.cells.slice(0, -1) })}>{t('Remove row')}</button>
        <button type="button" onClick={() => up({ colWidths: [...el.colWidths, 30], cells: el.cells.map((r) => [...r, '']) })}>{t('Add column')}</button>
        <button type="button" disabled={cols <= 1} onClick={() => up({ colWidths: el.colWidths.slice(0, -1), cells: el.cells.map((r) => r.slice(0, -1)) })}>{t('Remove column')}</button>
      </div>
      <NumField label={t('Row height (mm)')} value={el.rowHeight} min={3} onCommit={(v) => up({ rowHeight: v })} />
      <NumField label={t('Text size (mm)')} value={el.size} min={1} onCommit={(v) => up({ size: v })} />
      <Check label={t('Header row in bold')} checked={!!el.headerRow} onChange={(v) => up({ headerRow: v })} />
      <div className="cells" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {el.cells.map((row, r) => row.map((cell, c) => (
          <CellInput key={`${r}-${c}-${cell}`} value={cell} onCommit={(v) => up({ cells: el.cells.map((rr, ri) => (ri === r ? rr.map((cc, ci) => (ci === c ? v : cc)) : rr)) })} />
        )))}
      </div>
    </>
  );
}
function CellInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  return <input type="text" defaultValue={value} aria-label={t('Table cell')} onBlur={(e) => e.target.value !== value && onCommit(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />;
}

function ElementProps({ el, page, project }: { el: El; page: Page; project: Project }) {
  const up = (patch: Record<string, unknown>) => patchEl(page.id, el.id, patch);
  const focusText = useEditor((s) => s.focusText);
  useEffect(() => {
    if (focusText && el.kind === 'text') {
      const a = document.querySelector<HTMLTextAreaElement>('[data-testid="prop-text"]');
      a?.focus();
      a?.select();
      useEditor.getState().patch({ focusText: false });
    }
  }, [focusText, el.kind]);
  switch (el.kind) {
    case 'symbol': return <SymbolProps el={el} page={page} project={project} />;
    case 'wire':
      return (
        <>
          <h3>{t('Wire')}</h3>
          <Select label={t('Potential')} value={el.potential ?? ''} options={[{ value: '', label: t('None') }, ...project.potentials.map((p) => ({ value: p.id, label: p.label }))]} onChange={(v) => up({ potential: v || undefined })} />
          <TextField label={t('Wire number')} testid="prop-wire-number" value={el.number ?? ''} onCommit={(v) => up({ number: v || undefined, numberLocked: v ? true : undefined })} mono />
          <Check label={t('Keep this number when numbering automatically')} checked={!!el.numberLocked} onChange={(v) => up({ numberLocked: v || undefined })} />
          <Select label={t('Wire type')} value={el.wireType ?? ''} options={[{ value: '', label: t('From the potential (wire class)') }, ...project.wireTypes.map((w) => ({ value: w.id, label: `${w.id} · ${w.crossSection} mm² ${w.colour}` }))]} onChange={(v) => up({ wireType: v || undefined })} />
          <TextField label={t('Length (m), for sizing')} testid="prop-wire-length" value={el.length ?? ''} onCommit={(v) => up({ length: v || undefined })} />
          <Check label={t('Bundle of wires (one label)')} checked={!!el.bundle} onChange={(v) => up({ bundle: v || undefined })} />
          <Select label={t('Cable')} value={el.cable ?? ''} options={[{ value: '', label: t('None') }, ...project.cables.map((c) => ({ value: c.id, label: c.id }))]} onChange={(v) => up({ cable: v || undefined })} />
          {el.cable && <TextField label={t('Core (colour code or number)')} value={el.core ?? ''} onCommit={(v) => up({ core: v || undefined })} mono />}
          <NumField label={t('Conductors (single-line ticks)')} value={el.conductors ?? 1} min={1} max={99} step={1} onCommit={(v) => up({ conductors: v > 1 ? v : undefined })} />
        </>
      );
    case 'junction': return <h3>{t('Junction')}</h3>;
    case 'report': return (<><h3>{t('Report')}</h3><p className="hint">{t('A live list drawn from the schematic. Add pages for long lists in the Reports window.')}</p></>);
    case 'box': return (<><BoxProps el={el} page={page} project={project} /><DeviceSection el={el} page={page} project={project} /></>);
    case 'text':
      return (
        <>
          <h3>{t('Text')}</h3>
          <TextField label={t('Text')} testid="prop-text" value={el.text} multiline onCommit={(v) => up({ text: v })} />
          <NumField label={t('Text size (mm)')} value={el.size} min={1} onCommit={(v) => up({ size: v })} />
          <NumField label={t('Rotation (degrees)')} value={el.rot} step={15} onCommit={(v) => up({ rot: ((v % 360) + 360) % 360 })} />
          <Select label={t('Alignment')} value={el.align} options={[{ value: 'left', label: t('Left') }, { value: 'center', label: t('Centre') }, { value: 'right', label: t('Right') }]} onChange={(v) => up({ align: v })} />
          <Check label={t('Bold')} checked={!!el.bold} onChange={(v) => up({ bold: v })} />
        </>
      );
    case 'line':
      return (
        <>
          <h3>{t('Line')}</h3>
          <Check label={t('Dashed')} checked={!!el.dashed} onChange={(v) => up({ dashed: v })} />
        </>
      );
    case 'rect':
      return (
        <>
          <h3>{el.dashed ? t('Dashed outline') : t('Rectangle')}</h3>
          <Check label={t('Dashed')} checked={!!el.dashed} onChange={(v) => up({ dashed: v })} />
          <TextField label={t('Label')} value={el.label ?? ''} onCommit={(v) => up({ label: v || undefined })} />
          <TextField label={t('Assembly designation')} value={el.assembly ?? ''} onCommit={(v) => up({ assembly: v || undefined })} mono />
          <NumField label={t('Width (mm)')} value={el.w} min={1} onCommit={(v) => up({ w: v })} />
          <NumField label={t('Height (mm)')} value={el.h} min={1} onCommit={(v) => up({ h: v })} />
        </>
      );
    case 'table': return (<><h3>{t('Table')}</h3><TableProps el={el} page={page.id} /></>);
    case 'image':
      return (
        <>
          <h3>{t('Image')}</h3>
          <p className="hint">{project.assets[el.assetId]?.name}</p>
          <NumField label={t('Width (mm)')} value={Math.round(el.w * 10) / 10} min={1} onCommit={(v) => up({ w: v, h: (v * el.h) / el.w })} />
          <NumField label={t('Height (mm)')} value={Math.round(el.h * 10) / 10} min={1} onCommit={(v) => up({ h: v, w: (v * el.w) / el.h })} />
        </>
      );
    case 'warning':
      return (
        <>
          <h3>{t('Warning sign')}</h3>
          <Select<WarningSign> label={t('Sign')} value={el.sign} options={[{ value: 'general', label: t('General warning') }, { value: 'electric', label: t('Electrical hazard') }, { value: 'hot', label: t('Hot surface') }, { value: 'autostart', label: t('Automatic start') }]} onChange={(v) => up({ sign: v })} />
          <NumField label={t('Size (mm)')} value={el.size} min={4} onCommit={(v) => up({ size: v })} />
        </>
      );
    case 'form':
      return (
        <>
          <h3>{t('Data form')}</h3>
          <p className="hint">{t('The values come from the project and assembly data. Edit them in Project settings.')}</p>
          <NumField label={t('Width (mm)')} value={el.w} min={60} onCommit={(v) => up({ w: v })} />
        </>
      );
  }
}

export function PropertiesPanel() {
  const project = useEditor((s) => s.history.present);
  const pageId = useEditor((s) => s.pageId);
  const selection = useEditor((s) => s.selection);
  const exec = useEditor.getState().exec;
  useUi((s) => s.language);
  const page = project.pages.find((p) => p.id === pageId);
  const lang = project.settings.drawingLanguage;
  const other = lang === 'en' ? 'it' : 'en';
  const sel = page && selection.length === 1 ? page.elements.find((e) => e.id === selection[0]) : undefined;
  return (
    <aside className="panel properties" aria-label={t('Properties')}>
      <h2>{t('Properties')}</h2>
      {page && sel && <ElementProps el={sel} page={page} project={project} />}
      {page && selection.length > 1 && (
        <>
          <h3>{t('{n} objects selected', { n: selection.length })}</h3>
          <p className="hint">{t('R rotates, M mirrors, Delete removes, arrow keys move.')}</p>
          <SelectionTools page={page} selection={selection} />
        </>
      )}
      {page && selection.length === 0 && (
        <>
          <h3>{t('Page')}</h3>
          <p className="hint">{pageTypeLabel(page.type)}</p>
          <TextField label={lang === 'it' ? t('Sheet title (Italian)') : t('Sheet title (English)')} testid="prop-page-title" value={page.title[lang] ?? ''} onCommit={(v) => exec({ type: 'page/update', id: page.id, patch: { title: { ...page.title, [lang]: v } } })} />
          <TextField label={other === 'it' ? t('Sheet title (Italian)') : t('Sheet title (English)')} value={page.title[other] ?? ''} onCommit={(v) => exec({ type: 'page/update', id: page.id, patch: { title: { ...page.title, [other]: v } } })} />
          <Select<SheetSize> label={t('Sheet size')} value={page.size} options={SHEET_SIZES.map((s) => ({ value: s, label: s }))} onChange={(v) => exec({ type: 'page/update', id: page.id, patch: { size: v } })} />
          <Select label={t('Frame template')} value={page.templateId} options={[{ value: '', label: t('Project default') }, ...project.templates.map((x) => ({ value: x.id, label: x.name }))]} onChange={(v) => exec({ type: 'page/update', id: page.id, patch: { templateId: v } })} />
          <TextField label={t('Function (=)')} value={page.function ?? ''} onCommit={(v) => exec({ type: 'page/update', id: page.id, patch: { function: v || undefined } })} mono />
          <TextField label={t('Location (+)')} testid="prop-page-location" value={page.location ?? ''} onCommit={(v) => exec({ type: 'page/update', id: page.id, patch: { location: v || undefined } })} mono />
          <p className="hint">{t('Select an object on the page to see its properties.')}</p>
        </>
      )}
    </aside>
  );
}
