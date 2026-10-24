import { t } from '@shared/i18n';
import { sheetMm } from '@shared/sheets';
import { useUi } from '../state/ui';

export function PropertiesPanel() {
  const sheetSize = useUi((s) => s.sheetSize);
  const { w, h } = sheetMm(sheetSize);
  return (
    <aside className="panel properties" aria-label={t('Properties')}>
      <h2>{t('Properties')}</h2>
      <h3>{t('Nothing selected')}</h3>
      <p className="hint">{t('Select an object on the page to see its properties.')}</p>
      <h3>{t('Page frame')}</h3>
      <dl>
        <dt>{t('Sheet size')}</dt>
        <dd>{sheetSize}, {w} × {h} mm</dd>
      </dl>
    </aside>
  );
}
