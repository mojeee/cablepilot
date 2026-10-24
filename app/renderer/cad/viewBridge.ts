// The canvas registers its view controls here, so commands (ZOOM, PAN, the ribbon) can drive the view
// without the canvas component owning the command layer.
import type { Pt } from '@shared/model/types';

export interface ViewControls {
  fit(): void;
  /** Zooms by a factor around the centre of the canvas. */
  zoomBy(f: number): void;
  /** Zooms to a window given by two page points. */
  zoomWindow(a: Pt, b: Pt): void;
  /** Restores the previous view (ZOOM Previous). */
  previous(): void;
}

let controls: ViewControls | null = null;
export const registerView = (c: ViewControls | null): void => { controls = c; };
export const view = (): ViewControls | null => controls;
