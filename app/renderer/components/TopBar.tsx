import { useEffect, useState } from 'react';
import { LANGS, t, type Lang } from '@shared/i18n';
import type { SampleInfo } from '@shared/api';
import { useEditor } from '../state/editor';
import { useUi } from '../state/ui';
import { Icon } from './Icons';
import { LicenseChip } from './License';

/** The app's mark: a wire between two terminals (the same drawing as the website's logo). */
function Mark() {
  return (
    <svg className="brand-mark" width="20" height="20" viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="var(--mark-bg)" />
      <path d="M10 40h14v-16h16v16h14" fill="none" stroke="var(--accent)" strokeWidth="6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="10" cy="40" r="5" fill="var(--ok)" />
      <circle cx="54" cy="40" r="5" fill="var(--ok)" />
    </svg>
  );
}

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
      <div className="brand"><Mark />CablePilot</div>
      <div className="project-name" data-testid="project-name" title={project.name}>{project.name}{dirty ? ' *' : ''}</div>
      <div className="tb-group" role="group" aria-label={t('File')}>
        <button type="button" className="tb" data-testid="new" title={t('New')} onClick={() => st().newProject()}><Icon name="new" size={16} /><span>{t('New')}</span></button>
        <button type="button" className="tb" data-testid="open" title={t('Open')} onClick={() => void st().openFile()}><Icon name="open" size={16} /><span>{t('Open')}</span></button>
        <button type="button" className="tb" data-testid="save" title={t('Save')} onClick={() => void st().save()}><Icon name="save" size={16} /><span>{t('Save')}</span></button>
        <select className="tb-select" aria-label={t('Sample projects')} data-testid="samples" value="" onChange={(e) => e.target.value && void st().openSample(e.target.value)}>
          <option value="">{t('Sample projects')}</option>
          {samples.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="tb-group" role="group" aria-label={t('Edit')}>
        <button type="button" className="tb icon-only" data-testid="undo" disabled={!canUndo} title={`${t('Undo')} (Ctrl+Z)`} aria-label={t('Undo')} onClick={() => st().undo()}><Icon name="undo" size={16} /></button>
        <button type="button" className="tb icon-only" data-testid="redo" disabled={!canRedo} title={`${t('Redo')} (Ctrl+Shift+Z)`} aria-label={t('Redo')} onClick={() => st().redo()}><Icon name="redo" size={16} /></button>
      </div>
      <div className="tb-group split" role="group" aria-label={t('Export PDF')}>
        <button type="button" className="tb" data-testid="export-pdf" onClick={() => void st().exportPdf(scope)}><Icon name="pdf" size={16} /><span>{t('Export PDF')}</span></button>
        <select className="tb-select" aria-label={t('PDF scope')} value={scope} onChange={(e) => setScope(e.target.value === 'page' ? 'page' : 'all')}>
          <option value="all">{t('All pages')}</option>
          <option value="page">{t('This page')}</option>
        </select>
      </div>
      <div className="spacer" />
      <LicenseChip />
      <div className="tb-group prefs" role="group" aria-label={t('Display')}>
        <select className="tb-select" aria-label={t('Theme')} title={t('Theme')} value={theme} onChange={(e) => setTheme(e.target.value === 'light' ? 'light' : 'dark')}>
          <option value="dark">{t('Dark')}</option>
          <option value="light">{t('Light')}</option>
        </select>
        <select className="tb-select" aria-label={t('Canvas colour')} title={t('Canvas colour')} value={canvas} onChange={(e) => setCanvas(e.target.value === 'white' ? 'white' : 'dark')}>
          <option value="dark">{t('Dark canvas')}</option>
          <option value="white">{t('White canvas')}</option>
        </select>
        <select className="tb-select" aria-label={t('Language')} title={t('Language')} value={language} onChange={(e) => setLang(e.target.value as Lang)}>
          {LANGS.map((l) => (
            <option key={l.id} value={l.id}>{l.label}</option>
          ))}
        </select>
        <button type="button" className="tb icon-only" title={t('Keyboard shortcuts (F1)')} aria-label={t('Keyboard shortcuts (F1)')} onClick={() => st().setDialog('shortcuts')}><Icon name="help" size={16} /></button>
      </div>
    </header>
  );
}
