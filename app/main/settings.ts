// Settings store: a JSON file in the app's data folder. Reads are validated (parseSettings), so a
// hand-edited or damaged file never breaks the app.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULT_SETTINGS, parseSettings, type Settings } from '@shared/settings';

export class SettingsStore {
  private value: Settings;

  constructor(private readonly file: string) {
    this.value = this.load();
  }

  private load(): Settings {
    try {
      return parseSettings(JSON.parse(readFileSync(this.file, 'utf8')));
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  get(): Settings {
    return this.value;
  }

  set(patch: Partial<Settings>): Settings {
    this.value = parseSettings({ ...this.value, ...patch });
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.value, null, 2) + '\n');
    return this.value;
  }
}
