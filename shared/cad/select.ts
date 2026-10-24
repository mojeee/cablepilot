// CAD selection by rectangle: a window (dragged left to right, solid) takes what lies completely
// inside; a crossing (dragged right to left, dashed) takes everything the rectangle touches. Pure.

import type { Box } from '../draw/primitives';
import { boxesTouch } from '../draw/primitives';
import type { Page, Pt } from '../model/types';
import { rectEdges, segTouchesRect, type Rect } from './geom';

/** Dragging to the left makes a crossing selection; to the right, a window. */
export const isCrossing = (start: Pt, end: Pt): boolean => end.x < start.x;

export const rectOf = (a: Pt, b: Pt): Rect => [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y)];

/**
 * The ids a selection rectangle takes. `allowed` limits it to selectable elements (layers that are on
 * and not locked). A crossing takes a wire or line only when the rectangle touches the line itself,
 * and a rectangle outline only when it touches the border, not just its box.
 */
export function selectInRect(page: Page, items: { id: string; box: Box }[], rect: Rect, crossing: boolean, allowed?: ReadonlySet<string>): string[] {
  const byId = new Map(page.elements.map((e) => [e.id, e]));
  const out: string[] = [];
  for (const it of items) {
    if (allowed && !allowed.has(it.id)) continue;
    const b = it.box;
    if (!crossing) {
      if (b[0] >= rect[0] && b[2] <= rect[2] && b[1] >= rect[1] && b[3] <= rect[3]) out.push(it.id);
      continue;
    }
    if (!boxesTouch(b, rect)) continue;
    const e = byId.get(it.id);
    if (e && (e.kind === 'wire' || e.kind === 'line')) {
      if (e.points.some((p, i) => i > 0 && segTouchesRect(e.points[i - 1], p, rect))) out.push(it.id);
    } else if (e && (e.kind === 'rect' || (e.kind === 'cab' && (e.item === 'enclosure' || e.item === 'plate')))) {
      if (rectEdges(e.x, e.y, e.w, e.h).some(([a, c]) => segTouchesRect(a, c, rect))) out.push(it.id);
    } else out.push(it.id);
  }
  return out;
}
