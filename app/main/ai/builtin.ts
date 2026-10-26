// The built-in assistant: deterministic, offline, understands a few prompts (shared/ai/fake.ts). It answers when
// no API key is set, so the app is fully usable without a provider (rule 6).
import { fakeAnswer } from '@shared/ai/fake';
import type { AiAnswer, AiRequest } from '@shared/ai/types';
import { setLanguage } from '@shared/i18n';
import { fail, ok, type Result } from '@shared/result';
import { MAIN_LIBRARY } from './library';

export function builtInAnswer(req: AiRequest): Result<AiAnswer> {
  try {
    setLanguage(req.lang);
    return ok(fakeAnswer(req, MAIN_LIBRARY));
  } catch (e) {
    return fail('ai.failed', `The assistant could not answer: ${e instanceof Error ? e.message : String(e)}`, 'Try again, or edit the drawing by hand.');
  }
}
