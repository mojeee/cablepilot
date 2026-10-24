import { useEffect, useState } from 'react';
import { LANGS, t, type Lang } from '@shared/i18n';
import type { SampleInfo } from '@shared/api';
import { useEditor } from '../state/editor';
import { useUi } from '../state/ui';

export function TopBar() {
  const { theme, canvas, language, setTheme, setCanvas, setLang } = useUi();
  const project = useEditor((s) => s.history.present);
  const canUndo = useEditor((s) => s.history.past.length > 0);
  const canRedo = useEditor((s) => s.history.future.length > 0);
  const dirty = useEditor((s) => s.history.present !== s.saved);
  const [samples, setSamples] = useState<SampleInfo[]>([]);
  const [scope, setScope] = useState<'all' | 'page'>('all');
  const st = useEditor.getState;
  useEffect(() => {
    void window.cablepilot?.samples.list().then((r) => r.ok && setSamples(r.value));
  }, []);
  return (
    <header className="topbar" role="banner">
      <div className="brand">CablePilot</div>
      <div className="project-name" data-testid="project-name">{project.name}{dirty ? ' *' : ''}</div>
      <div className="actions">
        <button type="button" data-testid="new" onClick={() => st().newProject()}>{t('New')}</button>
        <button type="button" data-testid="open" onClick={() => void st().openFile()}>{t('Open')}</button>
        <select aria-label={t('Sample projects')} data-testid="samples" value="" onChange={(e) => e.target.value && void st().openSample(e.target.value)}>
          <option value="">{t('Sample projects')}</option>
          {samples.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button type="button" data-testid="save" onClick={() => void st().save()}>{t('Save')}</button>
        <button type="button" data-testid="undo" disabled={!canUndo} onClick={() => st().undo()}>{t('Undo')}</button>
        <button type="button" data-testid="redo" disabled={!canRedo} onClick={() => st().redo()}>{t('Redo')}</button>
        <button type="button" data-testid="export-pdf" onClick={() => void st().exportPdf(scope)}>{t('Export PDF')}</button>
        <select aria-label={t('PDF scope')} value={scope} onChange={(e) => setScope(e.target.value === 'page' ? 'page' : 'all')}>
          <option value="all">{t('All pages')}</option>
          <option value="page">{t('This page')}</option>
        </select>
        <button type="button" data-testid="bom" title={t('Bill of materials')} onClick={() => st().setDialog('bom')}>{t('BOM')}</button>
        <button type="button" data-testid="reports" title={t('Reports')} onClick={() => st().setDialog('reports')}>{t('Reports')}</button>
        <button type="button" data-testid="wires" title={t('Wires and cables')} onClick={() => st().setDialog('wires')}>{t('Wires')}</button>
        <button type="button" data-testid="number-wires" title={t('Number the wires automatically')} onClick={() => st().renumberWires()}>{t('Number wires')}</button>
        <button type="button" data-testid="settings" onClick={() => st().setDialog('settings')}>{t('Project settings...')}</button>
        <button type="button" title={t('Renumber designations automatically')} onClick={() => st().exec({ type: 'designation/renumber' })}>{t('Renumber')}</button>
      </div>
      <div className="spacer" />
      <label className="field">
        <span>{t('Theme')}</span>
        <select aria-label={t('Theme')} value={theme} onChange={(e) => setTheme(e.target.value === 'light' ? 'light' : 'dark')}>
          <option value="dark">{t('Dark')}</option>
          <option value="light">{t('Light')}</option>
        </select>
      </label>
      <label className="field">
        <span>{t('Canvas colour')}</span>
        <select aria-label={t('Canvas colour')} value={canvas} onChange={(e) => setCanvas(e.target.value === 'white' ? 'white' : 'dark')}>
          <option value="dark">{t('Dark canvas')}</option>
          <option value="white">{t('White canvas')}</option>
        </select>
      </label>
      <label className="field">
        <span>{t('Language')}</span>
        <select aria-label={t('Language')} value={language} onChange={(e) => setLang(e.target.value as Lang)}>
          {LANGS.map((l) => (
            <option key={l.id} value={l.id}>{l.label}</option>
          ))}
        </select>
      </label>
      <button type="button" title={t('Keyboard shortcuts (F1)')} aria-label={t('Keyboard shortcuts (F1)')} onClick={() => st().setDialog('shortcuts')}>?</button>
    </header>
  );
}
