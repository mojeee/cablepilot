// Black boxes and connectors: a rectangle with numbered, named pins on its border. Each pin is a
// pin-level connection point (wires snap to it, connectivity joins it like a symbol pin).

import { pick } from '../drawingText';
import type { BoxEl, Project } from '../model/types';
import type { PinDef } from '../library/types';
import type { Prim } from './primitives';

export function boxPinsWorld(el: BoxEl): { id: string; x: number; y: number; dir: PinDef['dir'] }[] {
  return el.pins.map((p) => {
    switch (p.side) {
      case 'left': return { id: p.id, x: el.x, y: el.y + p.offset, dir: 'left' as const };
      case 'right': return { id: p.id, x: el.x + el.w, y: el.y + p.offset, dir: 'right' as const };
      case 'top': return { id: p.id, x: el.x + p.offset, y: el.y, dir: 'up' as const };
      case 'bottom': return { id: p.id, x: el.x + p.offset, y: el.y + el.h, dir: 'down' as const };
    }
  });
}

/** Pin spacing used when pins are added in the editor (millimetres, on the 2.5 mm grid). */
export const PIN_PITCH = 5;

/** Adds a pin on a side at the next free position, growing the box when the pin would not fit. */
export function withPin(el: BoxEl, side: BoxEl['pins'][number]['side'], id: string, name?: string): BoxEl {
  const onSide = el.pins.filter((p) => p.side === side);
  const offset = onSide.length ? Math.max(...onSide.map((p) => p.offset)) + PIN_PITCH : PIN_PITCH;
  const along = side === 'left' || side === 'right' ? 'h' : 'w';
  const grown = { ...el, [along]: Math.max(el[along], offset + PIN_PITCH) };
  return { ...grown, pins: [...el.pins, { id, ...(name ? { name } : {}), side, offset }] };
}

export function boxPrims(el: BoxEl, project: Project, refText?: string): Prim[] {
  const st = project.settings.style;
  const lang = project.settings.drawingLanguage;
  const out: Prim[] = [{ k: 'poly', pts: [el.x, el.y, el.x + el.w, el.y, el.x + el.w, el.y + el.h, el.x, el.y + el.h], closed: true, w: st.weights.symbol, c: st.colours.symbol, id: el.id }];
  const T = (x: number, y: number, text: string, size: number, anchor: 'start' | 'middle' | 'end', c = st.colours.text, bold = false): Prim => ({ k: 'text', x, y: y + size * 0.36, text, size, anchor, rot: 0, c, bold, id: el.id });
  const loc = el.location ? `+${el.location}` : '';
  if (el.designation) out.push(T(el.x, el.y - 2.2, loc + el.designation, st.textSizes.designation, 'start', st.colours.designation));
  const title = pick(el.functionText, lang);
  // A PLC card keeps its pins from the top edge: the title goes above the box, the rack and slot below.
  if (title) out.push(el.plc ? T(el.x + el.w, el.y - 2.2, title, 2.4, 'end', st.colours.text, true) : T(el.x + el.w / 2, el.y + 3.2, title, 2.8, 'middle', st.colours.text, true));
  if (el.plc) out.push(T(el.x + el.w, el.y + el.h + 3.2, `${el.plc.rack}/${el.plc.slot} ${el.plc.type.toUpperCase()}`, 2.2, 'end'));
  if (refText) out.push(T(el.x, el.y + el.h + 3.2, refText, 2.2, 'start'));
  for (const p of el.pins) {
    const w = boxPinsWorld({ ...el, pins: [p] })[0];
    out.push({ k: 'circle', cx: w.x, cy: w.y, r: el.variant === 'connector' ? 0.9 : 0.6, w: st.weights.symbol, c: st.colours.symbol, fill: el.variant === 'connector', id: el.id });
    // Channels of a PLC card show the address and the tag, cut to the box width.
    const label = el.plc && el.plc.type !== 'cpu' ? `${p.address ?? p.id}${p.tag ? ` ${p.tag}` : ''}`.slice(0, Math.max(4, Math.floor((el.w - 4) / 1.3))) : p.name ? `${p.id} ${p.name}` : p.id;
    switch (p.side) {
      case 'left': out.push(T(w.x + 1.6, w.y, label, 2, 'start')); break;
      case 'right': out.push(T(w.x - 1.6, w.y, label, 2, 'end')); break;
      case 'top': out.push(T(w.x, w.y + 2.4, p.id, 2, 'middle')); break;
      case 'bottom': out.push(T(w.x, w.y - 1.6, p.id, 2, 'middle')); break;
    }
  }
  return out;
}
