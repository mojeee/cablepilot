// Warning-sign graphics, drawn by us (no third-party artwork). The triangle-with-pictogram
// layout follows the general idea of ISO 7010 warning signs (W001 general, W012 electricity,
// W017 hot surface); the drawings here are our own simplified versions.

import type { WarningSign } from '../model/types';
import type { Prim } from './primitives';

export function warningPrims(sign: WarningSign, x: number, y: number, size: number, colour: string, id?: string): Prim[] {
  const s = size;
  const w = Math.max(0.35, s / 30);
  // Triangle with its centre of mass at (x, y); apex up.
  const top = y - s * 0.6, bot = y + s * 0.4, half = s * 0.55;
  const out: Prim[] = [{ k: 'poly', pts: [x, top, x + half, bot, x - half, bot], closed: true, w: w * 2, c: colour, id }];
  const L = (pts: number[]): Prim => ({ k: 'poly', pts, w, c: colour, id });
  switch (sign) {
    case 'general':
      out.push(L([x, y - s * 0.28, x, y + s * 0.1]), { k: 'circle', cx: x, cy: y + s * 0.24, r: s * 0.04, w, c: colour, fill: true, id });
      break;
    case 'electric':
      out.push({ k: 'poly', pts: [x + s * 0.08, y - s * 0.32, x - s * 0.14, y + s * 0.06, x, y + s * 0.06, x - s * 0.08, y + s * 0.32, x + s * 0.16, y - s * 0.08, x + s * 0.02, y - s * 0.08], closed: true, fill: true, w, c: colour, id });
      break;
    case 'hot':
      for (const dx of [-0.18, 0, 0.18]) out.push({ k: 'poly', pts: [x + s * dx, y - s * 0.3, x + s * (dx + 0.06), y - s * 0.18, x + s * (dx - 0.06), y - s * 0.06, x + s * dx, y + s * 0.04], w, c: colour, id });
      out.push(L([x - s * 0.28, y + s * 0.2, x + s * 0.28, y + s * 0.2]));
      break;
    case 'autostart':
      out.push({ k: 'arc', cx: x, cy: y + s * 0.05, r: s * 0.22, a0: -60, a1: 220, w, c: colour, id }, { k: 'poly', pts: [x - s * 0.2, y - s * 0.12, x - s * 0.1, y - s * 0.22, x - s * 0.02, y - s * 0.08], closed: true, fill: true, w, c: colour, id });
      break;
  }
  return out;
}
