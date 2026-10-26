// Key storage (CLAUDE.md, Security): encrypted with safeStorage, never plain, never in settings, never in an error.
import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KEYS_FILE, KeyStore, parseDotEnv, type SafeStorageLike } from '../app/main/ai/keys';
import { DEFAULT_SETTINGS, parseSettings } from '@shared/settings';
import { SettingsStore } from '../app/main/settings';

const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'cp-keys-')); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const KEY = 'sk-ant-secret-0123456789abcdef';
// A reversible stand-in that is visibly not plain text.
const enc: SafeStorageLike = { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from([...Buffer.from(s)].map((b) => b ^ 0x5a)), decryptString: (b) => Buffer.from([...b].map((x) => x ^ 0x5a)).toString() };
const none: SafeStorageLike = { ...enc, isEncryptionAvailable: () => false };

describe('key store', () => {
  it('stores a key encrypted, reads it back in the main process, and clears it', () => {
    const dir = tmp();
    const ks = new KeyStore({ dataDir: dir, safeStorage: enc });
    expect(ks.has('anthropic')).toBe(false);
    expect(ks.set('anthropic', `  ${KEY}  `)).toBeNull();
    expect(readFileSync(join(dir, KEYS_FILE), 'utf8')).not.toContain(KEY);
    expect(readFileSync(join(dir, KEYS_FILE), 'utf8')).not.toContain(Buffer.from(KEY).toString('base64'));
    expect(ks.get('anthropic')).toBe(KEY);
    expect(ks.hasKey()).toEqual({ anthropic: true, openai: false, gemini: false });
    expect(ks.keySource()).toEqual({ anthropic: 'stored' });
    expect(new KeyStore({ dataDir: dir, safeStorage: enc }).get('anthropic')).toBe(KEY);
    ks.clear('anthropic');
    expect(ks.has('anthropic')).toBe(false);
    expect(existsSync(join(dir, KEYS_FILE))).toBe(false);
  });
  it('does not store a key at all when the system offers no secure storage, and says so without the key', () => {
    const dir = tmp();
    const err = new KeyStore({ dataDir: dir, safeStorage: none }).set('openai', KEY);
    expect(err?.code).toBe('ai_key_unsafe');
    expect(JSON.stringify(err)).not.toContain(KEY);
    expect(existsSync(join(dir, KEYS_FILE))).toBe(false);
  });
  it('rejects empty keys and keys with spaces', () => {
    const ks = new KeyStore({ dataDir: tmp(), safeStorage: enc });
    expect(ks.set('gemini', '  ')?.code).toBe('ai_key_empty');
    expect(ks.set('gemini', 'two words')?.code).toBe('ai_key_invalid');
  });
  it('uses the development environment only when given, and a stored key wins', () => {
    const dir = tmp();
    const env = join(dir, '.env.local');
    writeFileSync(env, '# keys\nGEMINI_API_KEY="from-file-0123456789"\nexport OPENAI_API_KEY=from-file-openai # note\n');
    const ks = new KeyStore({ dataDir: dir, safeStorage: enc, env: { ANTHROPIC_API_KEY: 'from-env-key-0123456789' }, devEnvFile: env });
    expect(ks.get('anthropic')).toBe('from-env-key-0123456789');
    expect(ks.get('gemini')).toBe('from-file-0123456789');
    expect(ks.get('openai')).toBe('from-file-openai');
    ks.set('anthropic', KEY);
    expect(ks.get('anthropic')).toBe(KEY);
    expect(ks.keySource()).toEqual({ anthropic: 'stored', openai: 'env', gemini: 'env' });
    expect(new KeyStore({ dataDir: tmp(), safeStorage: enc }).get('gemini')).toBeNull();
    expect(parseDotEnv("A=1\n\n#c\nB='two'")).toEqual({ A: '1', B: 'two' });
  });
  it('ignores a damaged key file and a key from another machine', () => {
    const dir = tmp();
    writeFileSync(join(dir, KEYS_FILE), '{ not json');
    expect(new KeyStore({ dataDir: dir, safeStorage: enc }).get('anthropic')).toBeNull();
    writeFileSync(join(dir, KEYS_FILE), JSON.stringify({ version: 1, keys: { anthropic: 'AAAA' } }));
    const throwing: SafeStorageLike = { ...enc, decryptString: () => { throw new Error('other machine'); } };
    expect(new KeyStore({ dataDir: dir, safeStorage: throwing }).get('anthropic')).toBeNull();
  });
});

describe('assistant settings never hold a key', () => {
  it('parses provider and model ids, ignoring anything invalid', () => {
    expect(DEFAULT_SETTINGS.ai).toEqual({ provider: 'anthropic', models: {} });
    expect(parseSettings({ ai: { provider: 'gemini', models: { gemini: 'gemini-3.1-flash', openai: 'bad id with spaces', anthropic: 5 }, apiKey: KEY } }).ai).toEqual({ provider: 'gemini', models: { gemini: 'gemini-3.1-flash' } });
    expect(parseSettings({ ai: { provider: 'nope' } }).ai.provider).toBe('anthropic');
    const dir = tmp();
    const st = new SettingsStore(join(dir, 'settings.json'));
    st.set({ ai: { provider: 'openai', models: { openai: 'gpt-5.1-mini' } } });
    expect(readFileSync(join(dir, 'settings.json'), 'utf8')).toContain('gpt-5.1-mini');
    expect(readFileSync(join(dir, 'settings.json'), 'utf8')).not.toMatch(/key/i);
  });
});
