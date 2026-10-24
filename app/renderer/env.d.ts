/// <reference types="vite/client" />
import type { CablePilotApi } from '@shared/api';

declare global {
  interface Window {
    cablepilot: CablePilotApi;
  }
}
