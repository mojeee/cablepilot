// The AI chat panel: the conversation, the project, page and selection the assistant sees, and the
// proposal with its sources and Accept / Reject (rule 6: a proposal is previewed on the canvas and never
// applied silently; every claim shows where it comes from). Until a provider with an API key is
// connected (M7) the built-in assistant answers a few requests and says so.
import { useEffect, useRef, useState } from 'react';
import { t } from '@shared/i18n';
import type { SourceKind } from '@shared/ai/types';
import { FAKE_EXAMPLES } from '@shared/ai/fake';
import { useChat } from '../state/chat';
import { useEditor } from '../state/editor';
import { useUi } from '../state/ui';

function sourceLabel(k: SourceKind): string {
  switch (k) {
    case 'project': return t('Project');
    case 'standard': return t('Standard');
    case 'library': return t('Library');
    case 'suggestion': return t('Suggestion');
  }
}

export function ChatPanel() {
  const messages = useChat((s) => s.messages);
  const busy = useChat((s) => s.busy);
  const status = useChat((s) => s.status);
  const project = useEditor((s) => s.history.present);
  const pageId = useEditor((s) => s.pageId);
  const selection = useEditor((s) => s.selection);
  const [text, setText] = useState('');
  const log = useRef<HTMLDivElement>(null);
  useUi((s) => s.language);
  useEffect(() => { void useChat.getState().loadStatus(); }, []);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [messages.length, busy]);
  const pageIdx = project.pages.findIndex((p) => p.id === pageId);
  const send = (s: string) => { const v = s.trim(); if (v) { setText(''); void useChat.getState().ask(v); } };
  const outcome = (o: string | undefined) => (o === 'accepted' ? t('Accepted') : o === 'rejected' ? t('Rejected') : o === 'stale' ? t('Out of date') : '');
  return (
    <aside className="panel chat" aria-label={t('AI assistant')}>
      <h2>{t('AI assistant')}</h2>
      <p className="chat-note" data-testid="chat-note">{status?.fake !== false ? t('Built-in assistant: it understands a few requests. Free-form requests need an API key (arrives in M7). The app works fully without it.') : t('Assistant: {name}', { name: status.provider })}</p>
      <div className="chat-context" data-testid="chat-context">{t('It sees: project "{name}", {page}, {n} selected.', { name: project.name, page: pageIdx >= 0 ? t('page {n}', { n: pageIdx + 1 }) : t('no page'), n: selection.length })}</div>
      <div className="chat-log" ref={log} role="log" aria-live="polite" data-testid="chat-log">
        {messages.length === 0 && (
          <div className="chat-examples">
            <p className="hint">{t('Try:')}</p>
            {FAKE_EXAMPLES.map((e) => <button key={e} type="button" className="chip" onClick={() => send(e)}>{e}</button>)}
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`bubble ${m.role}`} data-testid={`chat-${m.role}`}>
            <p>{m.text}</p>
            {m.answer && m.answer.claims.length > 0 && (
              <ul className="claims" data-testid="chat-claims">
                {m.answer.claims.map((c, i) => <li key={i}><span>{c.text}</span> <em className={`src src-${c.source.kind}`} data-testid={`source-${c.source.kind}`}>{sourceLabel(c.source.kind)}: {c.source.ref}</em></li>)}
              </ul>
            )}
            {m.answer?.examples && <div className="chat-examples">{m.answer.examples.map((e) => <button key={e} type="button" className="chip" onClick={() => send(e)}>{e}</button>)}</div>}
            {m.answer?.proposal && (
              <div className="proposal" data-testid="chat-proposal">
                <strong>{t('Proposal')}</strong>
                <ul>{m.answer.proposal.summary.map((s, i) => <li key={i}>{s}</li>)}</ul>
                {m.outcome === 'pending' ? (
                  <div className="row-buttons">
                    <button type="button" className="primary" data-testid="chat-accept" onClick={() => useChat.getState().accept()}>{t('Accept')}</button>
                    <button type="button" data-testid="chat-reject" onClick={() => useChat.getState().reject()}>{t('Reject')}</button>
                    <span className="hint">{t('Highlighted on the canvas. One undo step.')}</span>
                  </div>
                ) : <span className={`outcome ${m.outcome}`} data-testid="chat-outcome">{outcome(m.outcome)}</span>}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="bubble assistant"><p>…</p></div>}
      </div>
      <form className="chat-form" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <input type="text" data-testid="chat-input" aria-label={t('Message to the assistant')} placeholder={t('Ask the assistant...')} value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit" disabled={busy || !text.trim()} data-testid="chat-send">{t('Send')}</button>
      </form>
    </aside>
  );
}
