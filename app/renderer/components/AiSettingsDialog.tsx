// The assistant's settings: which provider (Claude by default, OpenAI, Gemini), which model, and the user's own API
// key. The key goes to the main process (Electron safeStorage) and never comes back: this dialog only learns whether
// a key is stored. Without a key the built-in assistant answers and the app is fully usable (rule 6).
import { useEffect, useState } from 'react';
import { t } from '@shared/i18n';
import { PROVIDER_IDS, PROVIDER_INFO, type AiProviderId } from '@shared/ai/types';
import { useChat } from '../state/chat';
import { useEditor } from '../state/editor';
import { Modal } from './Modal';

export function AiSettingsDialog() {
  const status = useChat((s) => s.status);
  const [key, setKey] = useState('');
  const [custom, setCustom] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const st = useChat.getState();
  useEffect(() => { void st.loadStatus(); }, [st]);
  if (!status) return <Modal title={t('AI settings')} onClose={() => useEditor.getState().setDialog(null)}><p>…</p></Modal>;
  const provider = status.provider;
  const info = PROVIDER_INFO[provider];
  const isPreset = status.model === info.defaultModel || status.model === info.fastModel;
  const has = status.hasKey[provider];
  const src = status.keySource[provider];
  const run = async (fn: () => Promise<string | null>, done: string) => { setBusy(true); const e = await fn(); setBusy(false); setMsg(e ? { ok: false, text: e } : { ok: true, text: done }); return !e; };
  return (
    <Modal title={t('AI settings')} onClose={() => useEditor.getState().setDialog(null)}>
      <p className="hint">{t('The assistant uses your own API key, called from this computer only. The key is stored encrypted by the operating system and is never shown again. Without a key the built-in assistant answers a few requests, and the app works fully.')}</p>
      <label className="prop">
        <span>{t('Provider')}</span>
        <select data-testid="ai-provider" value={provider} onChange={(e) => { setMsg(null); void st.setSettings({ provider: e.target.value as AiProviderId }); }}>
          {PROVIDER_IDS.map((id) => <option key={id} value={id}>{PROVIDER_INFO[id].name}</option>)}
        </select>
      </label>
      <label className="prop">
        <span>{t('Model')}</span>
        <select data-testid="ai-model" value={isPreset ? status.model : 'custom'} onChange={(e) => { const v = e.target.value; if (v === 'custom') setCustom(status.model); else { setCustom(''); void st.setSettings({ model: v }); } }}>
          <option value={info.defaultModel}>{`${info.defaultModel} (${t('default')})`}</option>
          <option value={info.fastModel}>{`${info.fastModel} (${t('fast')})`}</option>
          <option value="custom">{t('Other model id...')}</option>
        </select>
      </label>
      {(!isPreset || custom) && (
        <label className="prop">
          <span>{t('Model id')}</span>
          <input type="text" data-testid="ai-model-id" value={custom || status.model} onChange={(e) => setCustom(e.target.value)} onBlur={() => custom.trim() && void run(() => st.setSettings({ model: custom }), t('Model saved.'))} />
        </label>
      )}
      <label className="prop">
        <span>{t('API key for {provider}', { provider: info.name })}</span>
        <input type="password" autoComplete="off" spellCheck={false} data-testid="ai-key" placeholder={has ? t('A key is stored: paste a new one to replace it') : t('Paste your key')} value={key} onChange={(e) => setKey(e.target.value)} />
      </label>
      <p className="hint" data-testid="ai-key-state">{has ? (src === 'env' ? t('A key is available from the development environment.') : t('A key is stored.')) : t('No key is stored for {provider}.', { provider: info.name })} {t('Get a key at {url}', { url: info.keyHelp })}</p>
      <div className="row-buttons">
        <button type="button" className="primary" data-testid="ai-key-save" disabled={busy || !key.trim()} onClick={() => void run(() => st.setKey(provider, key), t('Key saved.')).then((okd) => okd && setKey(''))}>{t('Save key')}</button>
        <button type="button" data-testid="ai-key-test" disabled={busy || !has} onClick={() => { setBusy(true); void st.testKey(provider).then((r) => { setBusy(false); setMsg(r); }); }}>{t('Test key')}</button>
        <button type="button" data-testid="ai-key-remove" disabled={busy || !has || src === 'env'} onClick={() => void run(() => st.clearKey(provider), t('Key removed.'))}>{t('Remove key')}</button>
      </div>
      {msg && <p className={msg.ok ? 'hint' : 'error-text'} role="status" data-testid="ai-msg">{msg.text}</p>}
      {status.scripted && <p className="hint">{t('Test mode: answers come from a scripted stand-in, not from a model.')}</p>}
    </Modal>
  );
}
