// The status bar: cursor coordinates, the drafting aids (grid F7, ortho F8, snap F9, object snap F3 with its
// modes, polar tracking F10, dynamic input), zoom, the sheet, the hint for the active tool, and which
// assistant is connected.
import { PROVIDER_INFO } from '@shared/ai/types';
import { t } from '@shared/i18n';
import { OSNAP_MODES } from '@shared/cad/snap';
import { snapLabel } from '../cad/labels';
import { view } from '../cad/viewBridge';
import { useCad } from '../state/cad';
import { useChat } from '../state/chat';
import { useUi } from '../state/ui';

export function StatusBar() {
  const { aids, cursor, zoom, hint, sheetText } = useCad();
  const { toggle, setAids } = useCad.getState();
  const ai = useChat((s) => s.status);
  useUi((s) => s.language);
  const aid = (name: 'grid' | 'ortho' | 'snap' | 'osnap' | 'polar' | 'dyn', label: string, key?: string) => (
    <button type="button" className={`aid${aids[name] ? ' on' : ''}`} data-testid={`aid-${name}`} aria-pressed={aids[name]} title={key ? `${label} (${key})` : label} onClick={() => toggle(name)}>{label}</button>
  );
  return (
    <div className="statusbar" data-testid="statusbar">
      <span className="mono readout" data-testid="readout">{cursor ? `${cursor.x.toFixed(1)}, ${cursor.y.toFixed(1)} mm${cursor.zone ? ` · ${cursor.zone}` : ''}${snapLabel(cursor.on) ? ` · ${snapLabel(cursor.on)}` : ''}` : '—'}</span>
      <div className="aids" role="group" aria-label={t('Drafting aids')}>
        {aid('grid', t('GRID'), 'F7')}
        {aid('ortho', t('ORTHO'), 'F8')}
        {aid('snap', t('SNAP'), 'F9')}
        {aid('osnap', t('OSNAP'), 'F3')}
        <details className="osnap-modes">
          <summary aria-label={t('Object snap modes')} title={t('Object snap modes')}>▾</summary>
          <div className="popover" role="group" aria-label={t('Object snap modes')}>
            {OSNAP_MODES.map((m) => (
              <label key={m} className="field check">
                <input type="checkbox" data-testid={`osnap-mode-${m}`} checked={aids.modes.includes(m)} onChange={(e) => setAids({ modes: e.target.checked ? [...aids.modes, m] : aids.modes.filter((x) => x !== m) })} />
                <span>{snapLabel(m)}</span>
              </label>
            ))}
          </div>
        </details>
        {aid('polar', t('POLAR'), 'F10')}
        {aid('dyn', t('DYN'))}
      </div>
      <span>{t('Zoom')} {zoom}%</span>
      <button type="button" onClick={() => view()?.fit()}>{t('Fit page')}</button>
      <span className="sheet">{sheetText}</span>
      <span className="status-msg" data-testid="status-message">{hint}</span>
      <span className="ai-status" data-testid="ai-status" title={t('The assistant needs an API key for free-form requests: AI settings.')}>{ai ? (ai.active === 'built-in' ? t('Assistant: built-in (no API key)') : t('Assistant: {name}', { name: PROVIDER_INFO[ai.active].name })) : ''}</span>
    </div>
  );
}
