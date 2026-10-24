import { useRef } from 'react';
import { t } from '@shared/i18n';
import { newId } from '@shared/ids';
import type { WarningSign } from '@shared/model/types';
import { useEditor, type Tool } from '../state/editor';
import { useUi } from '../state/ui';
import { readImageFile } from '../render/svg';

const TOOLS: { tool: Tool; key: string; label: () => string }[] = [
  { tool: 'select', key: 'V', label: () => t('Select') },
  { tool: 'wire', key: 'W', label: () => t('Wire') },
  { tool: 'text', key: 'T', label: () => t('Text') },
  { tool: 'line', key: 'L', label: () => t('Line') },
  { tool: 'rect', key: 'B', label: () => t('Rectangle') },
  { tool: 'dashed', key: 'D', label: () => t('Dashed outline') },
  { tool: 'table', key: 'G', label: () => t('Table') },
  { tool: 'warning', key: 'N', label: () => t('Warning sign') },
];

const SIGNS: { id: WarningSign; label: () => string }[] = [
  { id: 'general', label: () => t('General warning') },
  { id: 'electric', label: () => t('Electrical hazard') },
  { id: 'hot', label: () => t('Hot surface') },
  { id: 'autostart', label: () => t('Automatic start') },
];

export function Toolbar() {
  const tool = useEditor((s) => s.tool);
  const potential = useEditor((s) => s.wirePotential);
  const conductors = useEditor((s) => s.wireConductors);
  const sign = useEditor((s) => s.warningSign);
  const printPreview = useEditor((s) => s.printPreview);
  const potentials = useEditor((s) => s.history.present.potentials);
  const pageType = useEditor((s) => s.history.present.pages.find((p) => p.id === s.pageId)?.type);
  const file = useRef<HTMLInputElement>(null);
  useUi((s) => s.language);
  const st = useEditor.getState;

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const r = await readImageFile(f);
    if ('error' in r) {
      useUi.getState().addMessage('error', () => t('That file is not a PNG, JPEG or SVG image, or it could not be read.'));
      return;
    }
    const assetId = newId('as');
    st().exec({ type: 'asset/add', id: assetId, asset: r.asset });
    st().patch({ pendingImage: { assetId, w: r.asset.w, h: r.asset.h }, tool: 'image', selection: [] });
  };

  return (
    <div className="tools" role="toolbar" aria-label={t('Tools')}>
      {TOOLS.map((x) => (
        <button key={x.tool} type="button" data-testid={`tool-${x.tool}`} className={tool === x.tool ? 'on' : ''} aria-pressed={tool === x.tool} title={`${x.label()} (${x.key})`} onClick={() => st().setTool(x.tool)}>
          {x.label()}
        </button>
      ))}
      <button type="button" data-testid="tool-image" className={tool === 'image' ? 'on' : ''} title={`${t('Image')} (I)`} onClick={() => file.current?.click()}>
        {t('Image')}
      </button>
      <input ref={file} type="file" accept="image/png,image/jpeg,image/svg+xml,.svg" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
      <span className="sep" />
      {tool === 'wire' && (
        <>
          <label className="field">
            <span>{t('Potential')}</span>
            <select aria-label={t('Potential')} value={potential} onChange={(e) => st().patch({ wirePotential: e.target.value })}>
              <option value="">{t('None')}</option>
              {potentials.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          {pageType === 'singleLine' && (
            <label className="field">
              <span>{t('Conductors')}</span>
              <input type="number" min={1} max={99} aria-label={t('Conductors')} value={conductors} onChange={(e) => st().patch({ wireConductors: Math.max(1, Math.round(Number(e.target.value) || 1)) })} />
            </label>
          )}
        </>
      )}
      {tool === 'warning' && (
        <label className="field">
          <span>{t('Sign')}</span>
          <select aria-label={t('Sign')} value={sign} onChange={(e) => st().patch({ warningSign: e.target.value as WarningSign })}>
            {SIGNS.map((s) => <option key={s.id} value={s.id}>{s.label()}</option>)}
          </select>
        </label>
      )}
      <span className="grow" />
      <label className="field check">
        <input type="checkbox" data-testid="print-preview" checked={printPreview} onChange={(e) => st().patch({ printPreview: e.target.checked })} />
        <span>{t('Print preview (white)')}</span>
      </label>
    </div>
  );
}
