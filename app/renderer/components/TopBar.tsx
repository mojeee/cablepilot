import { LANGS, t, type Lang } from '@shared/i18n';
import { useUi } from '../state/ui';

export function TopBar() {
  const { theme, canvas, language, setTheme, setCanvas, setLang } = useUi();
  const soon = t('Available from milestone M1.');
  return (
    <header className="topbar" role="banner">
      <div className="brand">CablePilot</div>
      <div className="project-name">{t('Untitled project')}</div>
      <div className="actions">
        <button type="button" disabled title={soon}>{t('Open')}</button>
        <button type="button" disabled title={soon}>{t('Save')}</button>
        <button type="button" disabled title={soon}>{t('Undo')}</button>
        <button type="button" disabled title={soon}>{t('Redo')}</button>
        <button type="button" disabled title={soon}>{t('Export PDF')}</button>
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
    </header>
  );
}
