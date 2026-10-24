// The in-app symbol editor: draw graphics on a 2.5 mm grid, place connection points, fill in the
// symbol's data and save it to the company library (a plain JSON file, validated with the same
// rules as /library by scripts/library-validate.mjs).
import { useState } from 'react';
import { t } from '@shared/i18n';
import { SYMBOL_CATEGORIES, type Gfx, type PinDef, type SymbolDef } from '@shared/library/types';
import { useEditor } from '../state/editor';
import { useUi } from '../state/ui';
import { Modal } from './Modal';
import { SymbolSvg, categoryLabel } from './SymbolBrowser';

type EdTool = 'line' | 'rect' | 'circle' | 'pin' | 'text';
const RANGE = 20; // mm each side of the anchor
const PX = 11; // pixels per mm
const snap = (v: number) => Math.round(v / 2.5) * 2.5;

export function SymbolEditorDialog() {
  const [tool, setTool] = useState<EdTool>('line');
  const [gfx, setGfx] = useState<Gfx[]>([]);
  const [pins, setPins] = useState<PinDef[]>([]);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [pinId, setPinId] = useState('1');
  const [pinDir, setPinDir] = useState<PinDef['dir']>('up');
  const [textValue, setTextValue] = useState('A');
  const [meta, setMeta] = useState({ id: '', en: '', it: '', category: 'switching', fn: '', letter: '', auto: true });
  const [error, setError] = useState('');
  const close = () => useEditor.getState().setDialog(null);

  const toLocal = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: snap((e.clientX - r.left) / PX - RANGE), y: snap((e.clientY - r.top) / PX - RANGE) };
  };
  const click = (e: React.MouseEvent<SVGSVGElement>) => {
    const p = toLocal(e);
    if (tool === 'pin') {
      if (!pinId.trim() || pins.some((x) => x.id === pinId.trim())) return setError(t('Give every connection point its own name.'));
      setError('');
      setPins([...pins, { id: pinId.trim(), x: p.x, y: p.y, dir: pinDir }]);
      setPinId(String(Number(pinId) + 1 || ''));
      return;
    }
    if (tool === 'text') return setGfx([...gfx, { t: 'text', x: p.x, y: p.y, text: textValue, size: 3 }]);
    if (!start) return setStart(p);
    if (tool === 'line' && (p.x !== start.x || p.y !== start.y)) setGfx([...gfx, { t: 'line', x1: start.x, y1: start.y, x2: p.x, y2: p.y }]);
    if (tool === 'rect' && p.x !== start.x && p.y !== start.y) setGfx([...gfx, { t: 'rect', x: Math.min(p.x, start.x), y: Math.min(p.y, start.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) }]);
    if (tool === 'circle') { const r = Math.hypot(p.x - start.x, p.y - start.y); if (r > 0) setGfx([...gfx, { t: 'circle', cx: start.x, cy: start.y, r: Math.round(r * 100) / 100 }]); }
    setStart(null);
  };

  const save = async () => {
    const id = meta.id.trim();
    const def: SymbolDef = {
      id, kind: 'symbol', title: { en: meta.en.trim(), it: meta.it.trim() || meta.en.trim() }, category: meta.category, function: meta.fn.trim() || id,
      ...(meta.letter.trim() ? { designationLetter: meta.letter.trim().toUpperCase() } : {}), ...(meta.auto ? {} : { autoNumber: false }),
      source: 'Company symbol (own drawing)', verification: 'primary', pins, graphics: gfx, label: { x: 6, y: 0 },
    };
    if (!id || !def.title.en) return setError(t('Give the symbol an id and an English name.'));
    if (pins.length === 0) return setError(t('Add at least one connection point.'));
    const r = await window.cablepilot.company.save('symbols', id, JSON.stringify(def, null, 2));
    if (!r.ok) return setError(`${r.error.message} ${r.error.hint}`);
    await useEditor.getState().loadCompany();
    useUi.getState().addMessage('info', () => t('Symbol {id} saved to the company library.', { id }));
    close();
  };

  const lines = Array.from({ length: (RANGE * 2) / 2.5 + 1 }, (_, i) => i * 2.5 - RANGE);
  const tools: { id: EdTool; label: string }[] = [{ id: 'line', label: t('Line') }, { id: 'rect', label: t('Rectangle') }, { id: 'circle', label: t('Circle') }, { id: 'text', label: t('Text') }, { id: 'pin', label: t('Connection point') }];
  return (
    <Modal title={t('Symbol editor')} wide onClose={close}>
      <div className="symed">
        <div>
          <div className="tools">{tools.map((x) => <button key={x.id} type="button" className={tool === x.id ? 'on' : ''} data-testid={`ed-${x.id}`} onClick={() => { setTool(x.id); setStart(null); }}>{x.label}</button>)}
            <button type="button" onClick={() => (pins.length && !gfx.length ? setPins(pins.slice(0, -1)) : setGfx(gfx.slice(0, -1)))}>{t('Remove last')}</button>
            <button type="button" onClick={() => { setGfx([]); setPins([]); }}>{t('Clear')}</button></div>
          <svg width={RANGE * 2 * PX} height={RANGE * 2 * PX} viewBox={`${-RANGE} ${-RANGE} ${RANGE * 2} ${RANGE * 2}`} className="symed-canvas" data-testid="symed-canvas" onClick={click} onMouseMove={(e) => setHover(toLocal(e))} onMouseLeave={() => setHover(null)}>
            {lines.map((v) => <g key={v} stroke="currentColor" strokeOpacity={v === 0 ? 0.5 : 0.12} strokeWidth={v === 0 ? 0.15 : 0.08}><line x1={v} y1={-RANGE} x2={v} y2={RANGE} /><line x1={-RANGE} y1={v} x2={RANGE} y2={v} /></g>)}
            <g stroke="currentColor" fill="none" strokeWidth={0.5} strokeLinecap="round">
              {gfx.map((g, i) => (g.t === 'line' ? <line key={i} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} /> : g.t === 'rect' ? <rect key={i} x={g.x} y={g.y} width={g.w} height={g.h} /> : g.t === 'circle' ? <circle key={i} cx={g.cx} cy={g.cy} r={g.r} /> : g.t === 'text' ? <text key={i} x={g.x} y={g.y + g.size * 0.36} fontSize={g.size} textAnchor="middle" fill="currentColor" stroke="none">{g.text}</text> : null))}
            </g>
            {pins.map((p) => <g key={p.id}><circle cx={p.x} cy={p.y} r={0.9} fill="#52c98b" /><text x={p.x + 1.2} y={p.y - 1} fontSize={2.2} fill="#52c98b">{p.id}</text></g>)}
            {start && hover && <line x1={start.x} y1={start.y} x2={hover.x} y2={hover.y} stroke="#4da3ff" strokeWidth={0.3} strokeDasharray="1 1" />}
            {hover && <circle cx={hover.x} cy={hover.y} r={0.5} fill="#4da3ff" />}
          </svg>
          <p className="hint">{t('Click on the grid. Lines, rectangles and circles take two clicks. Place connection points where wires attach.')}</p>
        </div>
        <div className="symed-side">
          <div className="symed-preview"><SymbolSvg gfx={gfx.length ? gfx : [{ t: 'circle', cx: 0, cy: 0, r: 0.1 }]} size={72} /></div>
          <TextInput label={t('Id (file name)')} value={meta.id} testid="symed-id" onChange={(v) => setMeta({ ...meta, id: v.replace(/[^A-Za-z0-9._-]/g, '-') })} />
          <TextInput label={t('Name (English)')} value={meta.en} testid="symed-en" onChange={(v) => setMeta({ ...meta, en: v })} />
          <TextInput label={t('Name (Italian)')} value={meta.it} onChange={(v) => setMeta({ ...meta, it: v })} />
          <label className="prop"><span>{t('Category')}</span><select value={meta.category} onChange={(e) => setMeta({ ...meta, category: e.target.value })}>{SYMBOL_CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}</select></label>
          <TextInput label={t('Function type')} value={meta.fn} onChange={(v) => setMeta({ ...meta, fn: v })} />
          <TextInput label={t('Designation letter (IEC 81346)')} value={meta.letter} onChange={(v) => setMeta({ ...meta, letter: v.slice(0, 2) })} />
          <label className="prop check"><input type="checkbox" checked={meta.auto} onChange={(e) => setMeta({ ...meta, auto: e.target.checked })} /><span>{t('Number automatically')}</span></label>
          {tool === 'pin' && (
            <div className="inline">
              <input type="text" aria-label={t('Connection point name')} value={pinId} size={4} onChange={(e) => setPinId(e.target.value)} />
              <select aria-label={t('Wire direction')} value={pinDir} onChange={(e) => setPinDir(e.target.value as PinDef['dir'])}>{(['up', 'down', 'left', 'right'] as const).map((d) => <option key={d} value={d}>{{ up: t('Up'), down: t('Down'), left: t('Left'), right: t('Right') }[d]}</option>)}</select>
            </div>
          )}
          {tool === 'text' && <TextInput label={t('Text')} value={textValue} onChange={setTextValue} />}
          {error && <p className="err" role="alert">{error}</p>}
          <div className="modal-actions"><button type="button" onClick={close}>{t('Cancel')}</button><button type="button" className="primary" data-testid="symed-save" onClick={() => void save()}>{t('Save to the company library')}</button></div>
        </div>
      </div>
    </Modal>
  );
}

function TextInput({ label, value, onChange, testid }: { label: string; value: string; onChange: (v: string) => void; testid?: string }) {
  return <label className="prop"><span>{label}</span><input type="text" data-testid={testid} value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}
