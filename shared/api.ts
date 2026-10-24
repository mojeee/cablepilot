// The typed API the preload script exposes to the renderer as window.cablepilot. The renderer has
// no Node, no file system and no network of its own (CLAUDE.md, Security).

import type { Result } from './result';
import type { Settings } from './settings';

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
}

export interface CablePilotApi {
  app: {
    info(): Promise<Result<AppInfo>>;
  };
  settings: {
    get(): Promise<Result<Settings>>;
    set(patch: Partial<Settings>): Promise<Result<Settings>>;
  };
}
