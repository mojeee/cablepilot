import { t } from '@shared/i18n';
import { dt, pick } from '@shared/drawingText';
import { newId } from '@shared/ids';
import { pageNumber } from '@shared/titleblock';
import type { Page } from '@shared/model/types';
import type { PageType } from '@shared/sheets';
import { useEditor } from '../state/editor';
import { useUi } from '../state/ui';

/** The label of a page type. Literal t() calls, so the i18n test sees every string. */
export function pageTypeLabel(type: PageType): string {
  switch (type) {
    case 'cover': return t('Cover sheet');
    case 'contents': return t('Contents');
    case 'power': return t('Power');
    case 'control': return t('Control');
    case 'plc': return t('PLC');
    case 'terminals': return t('Terminals');
    case 'cables': return t('Cables');
    case 'layout': return t('Cabinet layout');
    case 'singleLine': return t('Single-line diagram');
    case 'data': return t('Project data');
    case 'bom': return t('Bill of materials');
    case 'report': return t('Lists and tables');
  }
}

export function duplicatePage(p: Page): Page {
  return { ...p, id: newId('pg'), title: { ...p.title }, elements: p.elements.map((e) => ({ ...e, id: newId('e') })) };
}

export function PageNavigator() {
  const project = useEditor((s) => s.history.present);
  const pageId = useEditor((s) => s.pageId);
  const { setPage, exec, setDialog } = useEditor.getState();
  useUi((s) => s.language);
  const i = project.pages.findIndex((p) => p.id === pageId);
  const cur = project.pages[i];
  const lang = project.settings.drawingLanguage;
  return (
    <nav className="panel navigator" aria-label={t('Page navigator')}>
      <h2>{t('Pages')}</h2>
      <div className="row-buttons">
        <button type="button" data-testid="add-page" title={t('Add a page')} onClick={() => setDialog('addPage')}>+</button>
        <button type="button" title={t('Duplicate page')} disabled={!cur} onClick={() => cur && exec({ type: 'page/add', page: duplicatePage(cur), index: i + 1 })}>{t('Copy')}</button>
        <button type="button" title={t('Move page up')} disabled={i <= 0} onClick={() => exec({ type: 'page/move', id: pageId, index: i - 1 })}>↑</button>
        <button type="button" title={t('Move page down')} disabled={i < 0 || i >= project.pages.length - 1} onClick={() => exec({ type: 'page/move', id: pageId, index: i + 1 })}>↓</button>
        <button type="button" title={t('Delete page')} disabled={project.pages.length <= 1} onClick={() => exec({ type: 'page/remove', id: pageId })}>✕</button>
      </div>
      <ul>
        {project.pages.map((p, n) => (
          <li key={p.id}>
            <button type="button" data-testid={`page-${n + 1}`} className={p.id === pageId ? 'page-item selected' : 'page-item'} aria-current={p.id === pageId ? 'page' : undefined} onClick={() => setPage(p.id)}>
              <span className="num">{pageNumber(n + 1)}</span>
              <span className="page-name">
                <span>{pick(p.title, lang) || dt(lang, `type.${p.type}`)}</span>
                <span className="sub">{pageTypeLabel(p.type)} · {p.size}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
