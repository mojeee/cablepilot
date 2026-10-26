// One real call per provider through the full assistant loop: the model must read the project with a tool and answer.
// Skipped unless the provider's key is in the environment (ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY) or in
// .env.local at the repository root (git-ignored). The key is never printed. Each run costs a fraction of a cent.
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { runAssistant } from '../app/main/ai/assistant';
import { ENV_NAMES, readDotEnv } from '../app/main/ai/keys';
import { createProvider } from '../app/main/ai/providers';
import { PROVIDER_IDS, PROVIDER_INFO, type AiProviderId } from '@shared/ai/types';
import { builder } from './support/builder';
import { loadLibrary, loadMacros } from './support/library';

const lib = loadLibrary();
const dotenv = readDotEnv(join(__dirname, '..', '.env.local'));
const keyOf = (id: AiProviderId): string => process.env[ENV_NAMES[id]]?.trim() || dotenv[ENV_NAMES[id]]?.trim() || '';

for (const id of PROVIDER_IDS) {
  describe.skipIf(!keyOf(id))(`real ${PROVIDER_INFO[id].name} call (${PROVIDER_INFO[id].fastModel})`, () => {
    it('reads the project through a tool and answers in words, changing nothing', async () => {
      const b = builder(lib, 'p', 'Real key test');
      b.addPage('power', { en: 'Power circuits' });
      const r = await runAssistant(
        { prompt: 'How many pages does this project have, and what is the title of page 1? Use your tools to look.', lang: 'en', project: b.project, pageId: b.project.pages[0].id, selection: [] },
        { provider: createProvider(id, keyOf(id), false), providerId: id, model: PROVIDER_INFO[id].fastModel, lib, macros: loadMacros(), stock: null },
      );
      expect(r.ok, r.ok ? '' : `${r.error.code}: ${r.error.message}`).toBe(true);
      if (!r.ok) return;
      expect(r.value.text.length).toBeGreaterThan(5);
      expect(r.value.proposal).toBeUndefined();
      expect(r.value.model).toEqual({ provider: id, model: PROVIDER_INFO[id].fastModel });
    }, 120_000);
  });
}
