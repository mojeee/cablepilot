// The layer palette: on/off, lock, colour and line type per layer, with the number of objects on the page,
// new layers, and moving the selection to another layer. The built-in layers map the drawing style's groups
// (shared/layers.ts); changes are commands, so they undo.
import { useState } from 'react';
import { t } from '@shared/i18n';
import { newId } from '@shared/ids';
import { BUILTIN_LAYER_IDS, layerCounts, layersOf } from '@shared/layers';
import type { Layer, StyleColourKey } from '@shared/model/types';
import { useEditor } from '../state/editor';
import { useUi } from '../state/ui';

const STYLE_COLOUR: Record<string, StyleColourKey> = { symbols: 'symbol', wires: 'wire', text: 'text', annotation: 'annotation', reports: 'text' };

export function LayersPanel() {
  const project = useEditor((s) => s.history.present);
  const pageId = useEditor((s) => s.pageId);
  const selection = useEditor((s) => s.selection);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('annotation');
  useUi((s) => s.language);
  const layers = layersOf(project);
  const counts = layerCounts(project, project.pages.find((p) => p.id === pageId));
  const st = useEditor.getState;
  const set = (l: Layer) => st().exec({ type: 'layer/set', layer: l });
  const isBuiltin = (id: string) => (BUILTIN_LAYER_IDS as readonly string[]).includes(id);
  const add = () => {
    const n = name.trim();
    if (!n) return;
    set({ id: `u-${newId()}`, name: n, on: true, locked: false, lineType: 'continuous' });
    setName('');
  };
  const moveSelection = () => {
    if (!selection.length) return;
    st().exec({ type: 'batch', label: 'Move to layer', commands: selection.map((id) => ({ type: 'el/update' as const, page: pageId, id, patch: { layer: target } })) });
  };
  return (
    <aside className="panel layers" aria-label={t('Layers')}>
      <h2>{t('Layers')}</h2>
      <table className="layer-table" data-testid="layer-table">
        <thead><tr><th>{t('On')}</th><th>{t('Lock')}</th><th>{t('Colour')}</th><th>{t('Line type')}</th><th>{t('Name')}</th><th>{t('Objects')}</th><th /></tr></thead>
        <tbody>
          {layers.map((l) => {
            const styleColour = project.settings.style.colours[STYLE_COLOUR[l.id] ?? 'annotation'];
            return (
              <tr key={l.id} data-testid={`layer-${l.id}`}>
                <td><button type="button" className={`toggle${l.on ? ' on' : ''}`} data-testid={`layer-on-${l.id}`} aria-pressed={l.on} aria-label={`${t('On')}: ${l.name}`} title={l.on ? t('Switch off (not drawn, not printed)') : t('Switch on')} onClick={() => set({ ...l, on: !l.on })}>{l.on ? '●' : '○'}</button></td>
                <td><button type="button" className={`toggle${l.locked ? ' on' : ''}`} data-testid={`layer-lock-${l.id}`} aria-pressed={l.locked} aria-label={`${t('Lock')}: ${l.name}`} title={l.locked ? t('Unlock') : t('Lock (cannot be selected or changed)')} onClick={() => set({ ...l, locked: !l.locked })}>{l.locked ? '🔒' : '·'}</button></td>
                <td>
                  <input type="color" aria-label={`${t('Colour')}: ${l.name}`} data-testid={`layer-colour-${l.id}`} value={l.colour ?? styleColour} onChange={(e) => { /* committed on blur */ void e; }} onBlur={(e) => e.target.value !== (l.colour ?? styleColour) && set({ ...l, colour: e.target.value })} />
                  {l.colour && <button type="button" className="link" title={t('Back to the drawing style colour')} onClick={() => set({ ...l, colour: undefined })}>×</button>}
                </td>
                <td>
                  <select aria-label={`${t('Line type')}: ${l.name}`} data-testid={`layer-linetype-${l.id}`} value={l.lineType} onChange={(e) => set({ ...l, lineType: e.target.value === 'dashed' ? 'dashed' : 'continuous' })}>
                    <option value="continuous">{t('Continuous')}</option>
                    <option value="dashed">{t('Dashed')}</option>
                  </select>
                </td>
                <td>{l.name}</td>
                <td className="num">{counts.get(l.id) ?? 0}</td>
                <td>{!isBuiltin(l.id) && <button type="button" className="link" aria-label={`${t('Delete layer')}: ${l.name}`} onClick={() => st().exec({ type: 'layer/remove', id: l.id })}>🗑</button>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="inline">
        <input type="text" aria-label={t('New layer name')} data-testid="layer-new-name" placeholder={t('New layer name')} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button type="button" data-testid="layer-add" onClick={add}>{t('Add layer')}</button>
      </div>
      <div className="inline">
        <select aria-label={t('Layer for the selection')} data-testid="layer-target" value={target} onChange={(e) => setTarget(e.target.value)}>
          {layers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <button type="button" data-testid="layer-assign" disabled={!selection.length} onClick={moveSelection}>{t('Move selection here')}</button>
      </div>
      <p className="hint">{t('A layer that is off is neither drawn nor printed; a locked layer cannot be selected.')}</p>
    </aside>
  );
}
