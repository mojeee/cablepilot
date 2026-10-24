// The assistant's provider interface (main process only; API keys never reach the renderer). M6 part 2
// ships the deterministic built-in provider; M7 adds Claude, OpenAI and Gemini behind the same interface,
// with the user's key from Electron safeStorage.

import type { Result } from '@shared/result';
import type { AiAnswer, AiRequest, AiStatus } from '@shared/ai/types';

export interface AiProvider {
  id: string;
  /** A deterministic stand-in: it says so in its answers. */
  fake: boolean;
  /** Whether a key is stored for it (always false for the built-in provider). */
  keyConfigured(): boolean;
  ask(req: AiRequest): Promise<Result<AiAnswer>>;
}

export function statusOf(p: AiProvider): AiStatus {
  return { provider: p.id, fake: p.fake, keyConfigured: p.keyConfigured() };
}
