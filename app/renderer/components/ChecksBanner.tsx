// The warnings banner and the list of findings of the electrical rule check (rule 5). Each finding
// names its rule and standard, goes to its page on a click, and offers a one-click fix when the fix
// is a plain edit (an undoable command).
import { t } from '@shared/i18n';
import { findingDetail, findingText, fixText, RULE_SOURCE, ruleTitle } from '@shared/checkText';
import type { Finding } from '@shared/checks';
import { useEditor } from '../state/editor';
import { useChecks, usePageNames } from '../state/checks';
import { useUi } from '../state/ui';
import { Icon } from './Icons';

/** "1 error", "2 errors": the summary reads as plain language in both languages. */
export function countText(errors: number, warnings: number, infos: number): string {
  const e = errors === 1 ? t('1 error') : t('{n} errors', { n: errors });
  const w = warnings === 1 ? t('1 warning') : t('{n} warnings', { n: warnings });
  const i = infos === 1 ? t('1 note') : t('{n} notes', { n: infos });
  return `${e}, ${w}, ${i}`;
}

const MAX_ROWS = 200;

export function ChecksBanner() {
  const r = useChecks();
  const open = useUi((s) => s.checksOpen);
  const { setChecksOpen } = useUi.getState();
  const fixable = r.findings.filter((f) => f.fix).length;
  if (r.findings.length === 0) return null;
  const level = r.errors ? 'error' : r.warnings ? 'warning' : 'info';
  return (
    <div className={`checks-banner ${level}`} role="status" data-testid="checks-banner">
      <span className="checks-icon"><Icon name={level === 'info' ? 'check' : 'warning'} size={16} /></span>
      <strong>{t('Electrical rule check')}</strong>
      <span className="checks-summary" data-testid="checks-summary">{countText(r.errors, r.warnings, r.infos)}</span>
      <span className="grow" />
      {fixable > 0 && <button type="button" data-testid="fix-all" onClick={() => useEditor.getState().fixAll()}>{t('Fix all that can be fixed')} ({fixable})</button>}
      <button type="button" data-testid="toggle-findings" onClick={() => setChecksOpen(!open)}>{open ? t('Hide findings') : t('Show findings')}</button>
    </div>
  );
}

export function FindingsList() {
  const r = useChecks();
  const names = usePageNames();
  const open = useUi((s) => s.checksOpen);
  useUi((s) => s.language);
  const st = useEditor.getState();
  if (r.findings.length === 0) return <li className="msg ok" data-testid="no-findings">{t('No findings')}: {t('The electrical rule check found nothing.')}</li>;
  if (!open) return null;
  const shown = r.findings.slice(0, MAX_ROWS);
  return (
    <>
      {shown.map((f: Finding) => (
        <li key={f.id} className={`msg finding ${f.severity}`} data-testid="finding" data-rule={f.rule}>
          <span className="sev" aria-hidden="true" />
          <button type="button" className="link page-chip" title={t('Go to')} onClick={() => st.goTo(f)}>{names.pageName(f.page ?? '')}</button>
          <span className="finding-text">
            {findingText(f, names)}
            <span className="finding-src"> [{ruleTitle(f.rule)}; {t('Standard')}: {RULE_SOURCE[f.rule]}]</span>
            {findingDetail(f) && <span className="finding-detail">{findingDetail(f)}</span>}
          </span>
          {f.fix && <button type="button" className="fix" data-testid="fix-one" onClick={() => st.fix(f)}>{t('Fix')}: {fixText(f.fix)}</button>}
        </li>
      ))}
      {r.findings.length > shown.length && <li className="msg info">{t('and {n} more', { n: r.findings.length - shown.length })}</li>}
    </>
  );
}
