// The command line at the bottom of the drawing area: the history of what was typed and answered, the
// prompt of the running command (options in [brackets]), autocomplete, input history (arrow keys),
// Enter or Space to repeat the last command, Esc to cancel. Text that is not a command goes to the
// assistant (cad/run.ts). The context hint of the assistant (for example after placing a coil) shows
// above it.
import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '@shared/i18n';
import { autocomplete } from '@shared/cad/commands';
import { deviceIndex } from '@shared/devices';
import { escapeKey, submit } from '../cad/run';
import { useCad } from '../state/cad';
import { useChat } from '../state/chat';
import { useEditor } from '../state/editor';
import { useUi } from '../state/ui';

export function CommandLine() {
  const typing = useCad((s) => s.typing);
  const active = useCad((s) => s.active);
  const panMode = useCad((s) => s.panMode);
  const log = useCad((s) => s.log);
  const history = useCad((s) => s.history);
  const hint = useChat((s) => s.hint);
  const { setTyping } = useCad.getState();
  useUi((s) => s.language);
  const input = useRef<HTMLInputElement>(null);
  const logEl = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(-1);
  const [tabIndex, setTabIndex] = useState(0);
  const suggestions = !active && !panMode ? autocomplete(typing) : [];

  useEffect(() => {
    logEl.current?.scrollTo({ top: logEl.current.scrollHeight });
  }, [log.length]);

  // A "add the contacts" hint is done once its coil has a contact (or any other part of the device) or is gone.
  const project = useEditor((s) => s.history.present);
  const lib = useEditor((s) => s.lib);
  const hintDone = useMemo(() => {
    const c = hint?.coil;
    if (!c) return false;
    const d = deviceIndex(project, lib).byEl.get(`${c.page}/${c.el}`);
    return !d || d.device.reps.some((r) => r.el !== c.el);
  }, [hint, project, lib]);
  useEffect(() => {
    if (hintDone) useChat.getState().setHint(null);
  }, [hintDone]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z' && typing === '') {
      e.preventDefault();
      if (e.shiftKey) useEditor.getState().redo(); else useEditor.getState().undo();
      return;
    }
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        setPos(-1);
        submit(typing);
        return;
      case ' ':
        // Space is Enter when nothing is typed: repeat the last command, or finish the running one.
        if (typing === '') { e.preventDefault(); submit(''); }
        return;
      case 'Escape':
        e.preventDefault();
        if (typing) setTyping('');
        else { escapeKey(); input.current?.blur(); }
        return;
      case 'ArrowUp':
      case 'ArrowDown': {
        e.preventDefault();
        if (!history.length) return;
        const next = e.key === 'ArrowUp' ? (pos < 0 ? history.length - 1 : Math.max(0, pos - 1)) : pos < 0 ? -1 : pos + 1;
        if (next >= history.length || next < 0) { setPos(-1); setTyping(''); } else { setPos(next); setTyping(history[next]); }
        return;
      }
      case 'Tab':
        if (suggestions.length) {
          e.preventDefault();
          const i = tabIndex % suggestions.length;
          setTyping(suggestions[i].word);
          setTabIndex(i + 1);
        }
        return;
    }
  };

  const shown = log.slice(-60);
  return (
    <section className="cmdline" aria-label={t('Command line')} data-testid="cmdline">
      {hint && (
        <div className="ai-hint" role="status" data-testid="ai-hint">
          <span>{hint.text}</span>
          <button type="button" className="primary" data-testid="ai-hint-ask" onClick={() => { const p = hint.prompt; useChat.getState().setHint(null); submit(p); }}>{t('Ask the assistant')}</button>
          <button type="button" data-testid="ai-hint-dismiss" aria-label={t('Dismiss')} onClick={() => useChat.getState().setHint(null)}>×</button>
        </div>
      )}
      <div className="cmdlog" ref={logEl} role="log" aria-live="polite" data-testid="cmd-log">
        {shown.map((l) => <div key={l.id} className={`cl ${l.kind}`}>{l.text}</div>)}
      </div>
      <div className="cmdrow">
        {suggestions.length > 0 && (
          <ul className="suggest" role="listbox" aria-label={t('Commands')} data-testid="cmd-suggest">
            {suggestions.map((s) => (
              <li key={s.word} role="option" aria-selected={false}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setTyping(s.word); input.current?.focus(); }}>
                  <b>{s.word}</b> <span>{s.command.label()}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <label className="cmdprompt" htmlFor="cmd-input" data-testid="cmd-prompt">
          {active ? <><b>{active.name}</b> {active.prompt}</> : panMode ? <><b>PAN</b> {t('Drag to pan; Esc to finish.')}</> : <b>{t('Command')}:</b>}
        </label>
        <input
          id="cmd-input"
          ref={input}
          data-testid="cmd-input"
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={typing}
          placeholder={active || panMode ? '' : t('Type a command (L, PL, REC, M, CO...) or ask the assistant')}
          onChange={(e) => { setTyping(e.target.value); setTabIndex(0); }}
          onKeyDown={onKeyDown}
        />
      </div>
    </section>
  );
}
