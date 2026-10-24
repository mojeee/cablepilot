import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings } from '@shared/settings';
import { fail, ok } from '@shared/result';

describe('settings', () => {
  it('falls back to the defaults for anything invalid', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('x')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ theme: 'purple', canvas: 3, language: 'fr' })).toEqual(DEFAULT_SETTINGS);
  });
  it('keeps valid values', () => {
    expect(parseSettings({ theme: 'light', canvas: 'white', language: 'it' })).toEqual({ theme: 'light', canvas: 'white', language: 'it', layout: DEFAULT_SETTINGS.layout });
  });
});

describe('result', () => {
  it('wraps values and errors', () => {
    expect(ok(3)).toEqual({ ok: true, value: 3 });
    expect(fail('x', 'what happened', 'what to do')).toEqual({ ok: false, error: { code: 'x', message: 'what happened', hint: 'what to do' } });
  });
});
