import { t } from '@shared/i18n';

export function SymbolBrowser() {
  return (
    <aside className="panel browser" aria-label={t('Symbols and devices')}>
      <h2>{t('Symbols and devices')}</h2>
      <input type="search" aria-label={t('Search symbols and devices')} placeholder={t('Search symbols and devices')} disabled />
      <ul className="categories">
        <li>{t('Contactors and relays')}</li>
        <li>{t('Breakers and motor protection')}</li>
        <li>{t('Terminals and connectors')}</li>
        <li>{t('PLC and I/O')}</li>
        <li>{t('Cables and wires')}</li>
        <li>{t('Enclosures and rails')}</li>
      </ul>
      <p className="hint">{t('The library is empty for now. IEC 60617 symbols and generic devices arrive with M1 and M2.')}</p>
    </aside>
  );
}
