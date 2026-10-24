import { useMemo } from 'react';
import { t } from '@shared/i18n';
import { computeBom } from '@shared/bom';
import { daysBetween, isStale, stockIssues } from '@shared/stock';
import { useEditor } from '../state/editor';
import { today, useStock } from '../state/stock';
import { useUi } from '../state/ui';
import { FindingsList } from './ChecksBanner';

/** Stock messages (rule 12): shortages for this project, an old stock list, parts the last refresh took away. */
function StockMessages() {
  const stock = useStock((s) => s.stock);
  const project = useEditor((s) => s.history.present);
  const lib = useEditor((s) => s.lib);
  useUi((s) => s.language);
  const issues = useMemo(() => {
    if (!stock) return null;
    const parts = [...lib.parts.values(), ...project.parts.filter((p) => !lib.parts.has(p.id))];
    return stockIssues(computeBom(project, lib), stock, parts);
  }, [stock, project, lib]);
  if (!stock || !issues) return null;
  return (
    <>
      {isStale(stock, today()) && <li className="msg warning" data-testid="stock-stale">{t('The stock list is from {date} ({n} days ago): refresh it before you order or pick.', { date: stock.stockDate, n: daysBetween(stock.stockDate, today()) })}</li>}
      {issues.shortages.map((x) => <li key={x.part.id} className="msg warning" data-testid="stock-short">{t('Short in the warehouse: {code}, {n} {unit} missing for this project.', { code: x.part.code, n: x.short, unit: x.unit })}</li>)}
      {issues.lost.map((p) => <li key={p.id} className="msg warning" data-testid="stock-lost">{t('{code} is used in this project and is no longer available after the stock refresh.', { code: p.code })}</li>)}
    </>
  );
}

export function MessageList() {
  const messages = useUi((s) => s.messages);
  return (
    <section className="messages" aria-label={t('Messages')}>
      <h2>{t('Messages')}</h2>
      <ul>
        <FindingsList />
        <StockMessages />
        {messages.map((m) => (
          <li key={m.id} className={`msg ${m.severity}`}>
            {m.text()}
          </li>
        ))}
      </ul>
    </section>
  );
}
