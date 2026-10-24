// Small dialogs: add a page, keyboard shortcuts, crash recovery.
import { useState } from 'react';
import { t } from '@shared/i18n';
import { FORM_PRESETS } from '@shared/forms';
import { SHEET_SIZES, PAGE_TYPES, type PageType, type SheetSize } from '@shared/sheets';
import { useEditor } from '../state/editor';
import { SHORTCUTS } from '../shortcuts';
import { Modal } from './Modal';
import { pageTypeLabel } from './PageNavigator';

export function AddPageDialog() {
  const lang = useEditor((s) => s.history.present.settings.drawingLanguage);
  const defaultSize = useEditor((s) => s.history.present.settings.defaultSize);
  const [type, setType] = useState<PageType>('power');
  const [title, setTitle] = useState('');
  const [size, setSize] = useState<SheetSize>(defaultSize);
  const [preset, setPreset] = useState(FORM_PRESETS[0].id);
  const close = () => useEditor.getState().setDialog(null);
  const add = () => {
    const p = FORM_PRESETS.find((x) => x.id === preset);
    useEditor.getState().addPage(type, title.trim() || (type === 'data' && p ? p.title[lang] : pageTypeLabel(type)), size, preset);
    close();
  };
  return (
    <Modal title={t('Add a page')} onClose={close}>
      <label className="prop"><span>{t('Page type')}</span>
        <select data-testid="new-page-type" value={type} onChange={(e) => setType(e.target.value as PageType)}>
          {PAGE_TYPES.map((x) => <option key={x} value={x}>{pageTypeLabel(x)}</option>)}
        </select>
      </label>
      {type === 'data' && (
        <label className="prop"><span>{t('Form')}</span>
          <select value={preset} onChange={(e) => setPreset(e.target.value)}>
            {FORM_PRESETS.map((x) => <option key={x.id} value={x.id}>{x.title[useEditor.getState().history.present.settings.drawingLanguage]}</option>)}
          </select>
        </label>
      )}
      <label className="prop"><span>{t('Sheet title')}</span><input type="text" data-testid="new-page-title" value={title} placeholder={pageTypeLabel(type)} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} /></label>
      <label className="prop"><span>{t('Sheet size')}</span>
        <select value={size} onChange={(e) => setSize(e.target.value as SheetSize)}>{SHEET_SIZES.map((x) => <option key={x}>{x}</option>)}</select>
      </label>
      <div className="modal-actions"><button type="button" onClick={close}>{t('Cancel')}</button><button type="button" className="primary" data-testid="confirm-add-page" onClick={add}>{t('Add')}</button></div>
    </Modal>
  );
}

export function ShortcutsDialog() {
  return (
    <Modal title={t('Keyboard shortcuts')} onClose={() => useEditor.getState().setDialog(null)}>
      <table className="shortcuts"><tbody>
        {SHORTCUTS.map((s) => <tr key={s.keys}><th scope="row"><kbd>{s.keys}</kbd></th><td>{s.action()}</td></tr>)}
      </tbody></table>
    </Modal>
  );
}

export function RecoveryBanner() {
  const recovery = useEditor((s) => s.recovery);
  const { recover, discardRecovery } = useEditor.getState();
  const r = recovery[0];
  if (!r) return null;
  return (
    <div className="banner" role="alert" data-testid="recovery">
      <span>{t('CablePilot closed before "{name}" was saved. An autosaved copy from {time} exists.', { name: r.name, time: new Date(r.savedAt).toLocaleString() })}</span>
      <button type="button" data-testid="recover" onClick={() => void recover(r.id)}>{t('Recover')}</button>
      <button type="button" onClick={() => void discardRecovery(r.id)}>{t('Discard')}</button>
    </div>
  );
}
