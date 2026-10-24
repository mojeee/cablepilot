import { t } from '@shared/i18n';
import type { PageType } from '@shared/sheets';
import { useUi } from '../state/ui';

/** The label of a page type. Literal t() calls, so the i18n test sees every string. */
function pageTypeLabel(type: PageType): string {
  switch (type) {
    case 'cover': return t('Cover sheet');
    case 'contents': return t('Contents');
    case 'power': return t('Power');
    case 'control': return t('Control');
    case 'plc': return t('PLC');
    case 'terminals': return t('Terminals');
    case 'cables': return t('Cables');
    case 'layout': return t('Cabinet layout');
  }
}

export function PageNavigator() {
  const { pages, selectedPage, selectPage } = useUi();
  return (
    <nav className="panel navigator" aria-label={t('Page navigator')}>
      <h2>{t('Pages')}</h2>
      <p className="hint">{t('Sample pages')}</p>
      <ul>
        {pages.map((p) => (
          <li key={p.id}>
            <button type="button" className={p.id === selectedPage ? 'page-item selected' : 'page-item'} aria-current={p.id === selectedPage ? 'page' : undefined} onClick={() => selectPage(p.id)}>
              <span className="num">{String(p.number).padStart(2, '0')}</span>
              <span>{pageTypeLabel(p.type)}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
