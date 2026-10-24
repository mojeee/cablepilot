// The built-in provider: deterministic, offline, understands a few prompts (shared/ai/fake.ts).
import { fakeAnswer } from '@shared/ai/fake';
import type { AiAnswer, AiRequest } from '@shared/ai/types';
import { setLanguage } from '@shared/i18n';
import { fail, ok, type Result } from '@shared/result';
import { MAIN_LIBRARY } from './library';
import type { AiProvider } from './provider';

export class FakeProvider implements AiProvider {
  readonly id = 'built-in';
  readonly fake = true;
  keyConfigured(): boolean {
    return false;
  }
  async ask(req: AiRequest): Promise<Result<AiAnswer>> {
    try {
      setLanguage(req.lang);
      return ok(fakeAnswer(req, MAIN_LIBRARY));
    } catch (e) {
      return fail('ai.failed', `The assistant could not answer: ${e instanceof Error ? e.message : String(e)}`, 'Try again, or edit the drawing by hand.');
    }
  }
}
