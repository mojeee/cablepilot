import { t } from '@shared/i18n';
import { useUi } from '../state/ui';
import { FindingsList } from './ChecksBanner';

export function MessageList() {
  const messages = useUi((s) => s.messages);
  return (
    <section className="messages" aria-label={t('Messages')}>
      <h2>{t('Messages')}</h2>
      <ul>
        <FindingsList />
        {messages.map((m) => (
          <li key={m.id} className={`msg ${m.severity}`}>
            {m.text()}
          </li>
        ))}
      </ul>
    </section>
  );
}
