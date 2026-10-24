import { t } from '@shared/i18n';
import { useUi } from '../state/ui';

export function MessageList() {
  const messages = useUi((s) => s.messages);
  return (
    <section className="messages" aria-label={t('Messages')}>
      <h2>{t('Messages')}</h2>
      <ul>
        <li className="msg ok">{t('No warnings')}: {t('The electrical rule check arrives in milestone M4.')}</li>
        {messages.map((m) => (
          <li key={m.id} className={`msg ${m.severity}`}>
            {m.text()}
          </li>
        ))}
      </ul>
    </section>
  );
}
