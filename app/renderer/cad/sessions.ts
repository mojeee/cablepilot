// The interactive commands: each is a chain of steps (sessions) that ask for a point, an object or a
// number. A step shows its prompt in the command line; a click, typed coordinates or typed text moves
// to the next step. Edits go through the editor's `exec`, so each result is a command with undo.

import { t } from '@shared/i18n';
import { newId } from '@shared/ids';
import { dist, angleOf } from '@shared/cad/geom';
import { parseNumber } from '@shared/cad/input';
import { extendSegment, offsetCircle, offsetRect, offsetSegment, trimSegment } from '@shared/cad/modify';
import { snapGeometry } from '@shared/cad/snap';
import type { Command } from '@shared/commands';
import type { El, Pt } from '@shared/model/types';
import { useEditor } from '../state/editor';
import { useCad, type Session } from '../state/cad';
import { view } from './viewBridge';

const ed = () => useEditor.getState();
const cad = () => useCad.getState();
const say = (text: string) => cad().say('info', text);
const bad = (text: string) => cad().say('error', text);
export const end = (): void => { cad().go(null); cad().setTyping(''); };
const go = (s: Session): void => cad().go(s);
const n2 = (n: number): string => String(Math.round(n * 100) / 100);
const noText = () => false;

const base = (name: string, prompt: string, extra: Partial<Session> = {}): Session => ({ name, prompt, base: null, pick: 'point', point: () => undefined, text: noText, enter: end, ...extra });

/** Pick-first: a selection that already exists is used; otherwise the command asks for objects (click, window or crossing, then Enter). */
function withSelection(name: string, then: (ids: string[]) => void): void {
  if (ed().selection.length) return then(ed().selection);
  go(base(name, t('Select objects:'), {
    pick: 'select',
    enter() {
      const ids = ed().selection;
      if (!ids.length) return bad(t('Nothing is selected.'));
      then(ids);
    },
  }));
}

const page = () => ed().page();
const addLine = (pts: Pt[], extra: Partial<{ dashed: boolean }> = {}): void => {
  const pg = page();
  if (pg) ed().exec({ type: 'el/add', page: pg.id, elements: [{ id: newId('e'), kind: 'line', points: pts, ...extra }] });
};

export function lineSession(pts: Pt[] = []): Session {
  const first = pts.length === 0;
  const last = pts[pts.length - 1] ?? null;
  return base('LINE', first ? t('Specify first point:') : t('Specify next point or [Undo]:'), {
    base: last,
    rubber: (c) => (last ? [{ kind: 'poly', pts: [last, c] }] : []),
    point(p) {
      if (last) {
        if (dist(last, p) < 1e-6) return;
        addLine([last, p]);
      }
      go(lineSession([...pts, p]));
    },
    text(s) {
      if (!/^u(ndo)?$/i.test(s)) return false;
      if (pts.length > 1) { ed().undo(); go(lineSession(pts.slice(0, -1))); } else if (pts.length === 1) go(lineSession([]));
      return true;
    },
  });
}

export function plineSession(pts: Pt[] = []): Session {
  const last = pts[pts.length - 1] ?? null;
  const finish = (close: boolean) => {
    const out = close && pts.length > 2 ? [...pts, pts[0]] : pts;
    if (out.length >= 2) addLine(out);
    end();
  };
  return base('PLINE', last ? t('Specify next point or [Close/Undo]:') : t('Specify start point:'), {
    base: last,
    rubber: (c) => (last ? [{ kind: 'poly', pts: [...pts, c] }] : []),
    point: (p) => (last && dist(last, p) < 1e-6 ? undefined : go(plineSession([...pts, p]))),
    text(s) {
      if (/^c(lose)?$/i.test(s)) { finish(true); return true; }
      if (/^u(ndo)?$/i.test(s)) { go(plineSession(pts.slice(0, -1))); return true; }
      return false;
    },
    enter: () => finish(false),
  });
}

export function rectSession(dashed: boolean, first: Pt | null = null): Session {
  const name = dashed ? 'DASHED' : 'RECTANGLE';
  const rect = (a: Pt, b: Pt): Pt[] => [{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y }];
  return base(name, first ? t('Specify other corner:') : t('Specify first corner:'), {
    base: first,
    rubber: (c) => (first ? [{ kind: 'poly', pts: rect(first, c), closed: true }] : []),
    point(p) {
      if (!first) return go(rectSession(dashed, p));
      const pg = page();
      if (!pg || Math.abs(p.x - first.x) < 1e-6 || Math.abs(p.y - first.y) < 1e-6) return bad(t('The rectangle has no area.'));
      ed().exec({ type: 'el/add', page: pg.id, elements: [{ id: newId('e'), kind: 'rect', x: Math.min(p.x, first.x), y: Math.min(p.y, first.y), w: Math.abs(p.x - first.x), h: Math.abs(p.y - first.y), ...(dashed ? { dashed: true } : {}) }] });
      end();
    },
  });
}

export function circleSession(centre: Pt | null = null): Session {
  return base('CIRCLE', centre ? t('Specify radius:') : t('Specify centre point:'), {
    base: centre,
    rubber: (c) => (centre ? [{ kind: 'circle', c: centre, r: dist(centre, c) }] : []),
    point(p) {
      if (!centre) return go(circleSession(p));
      const r = dist(centre, p);
      const pg = page();
      if (!pg || r < 1e-6) return bad(t('The radius must be larger than zero.'));
      ed().exec({ type: 'el/add', page: pg.id, elements: [{ id: newId('e'), kind: 'circle', x: centre.x, y: centre.y, r }] });
      end();
    },
    text(s) {
      const r = parseNumber(s);
      if (!centre || r === null || r <= 0) return false;
      const pg = page();
      if (pg) ed().exec({ type: 'el/add', page: pg.id, elements: [{ id: newId('e'), kind: 'circle', x: centre.x, y: centre.y, r }] });
      end();
      return true;
    },
  });
}

export function moveSession(copy: boolean): void {
  const name = copy ? 'COPY' : 'MOVE';
  withSelection(name, (ids) => {
    const pageId = ed().pageId;
    const second = (from: Pt): Session => base(name, copy ? t('Specify second point or [Exit]:') : t('Specify second point:'), {
      base: from,
      rubber: (c) => [{ kind: 'poly', pts: [from, c] }],
      preview: copy ? undefined : (c) => ({ type: 'el/move', page: pageId, ids, dx: c.x - from.x, dy: c.y - from.y }),
      point(p) {
        const dx = p.x - from.x, dy = p.y - from.y;
        if (!dx && !dy) return;
        if (copy) { ed().copyElements(ids, dx, dy); go(second(from)); } else { ed().exec({ type: 'el/move', page: pageId, ids, dx, dy }); end(); }
      },
      text: (s) => (copy && /^e(xit)?$/i.test(s) ? (end(), true) : false),
    });
    go(base(name, t('Specify base point:'), { point: (p) => go(second(p)) }));
  });
}

export function rotateSession(): void {
  withSelection('ROTATE', (ids) => {
    const pageId = ed().pageId;
    go(base('ROTATE', t('Specify rotation angle [90/180/270]:'), {
      point: () => bad(t('Type the angle: 90, 180 or 270 (counter-clockwise).')),
      text(s) {
        const n = parseNumber(s);
        if (n === null) return false;
        const a = ((n % 360) + 360) % 360;
        if (a === 0 || a % 90 !== 0) { bad(t('Only 90, 180 and 270 degrees are possible.')); return true; }
        // el/rotate turns 90 degrees clockwise on screen; the typed angle is counter-clockwise.
        const turns = ((360 - a) / 90) % 4;
        const cmds: Command[] = Array.from({ length: turns }, () => ({ type: 'el/rotate' as const, page: pageId, ids }));
        ed().exec({ type: 'batch', label: 'rotate', commands: cmds });
        end();
        return true;
      },
    }));
  });
}

export function mirrorSession(): void {
  withSelection('MIRROR', (ids) => {
    ed().exec({ type: 'el/mirror', page: ed().pageId, ids });
    say(t('Mirrored about the vertical axis through the centre of the selection.'));
    end();
  });
}

export function eraseSession(): void {
  withSelection('ERASE', (ids) => {
    const n = ids.length;
    ed().deleteSelection();
    say(t('{n} objects erased.', { n }));
    end();
  });
}

const others = (id: string) => {
  const pg = page();
  return pg ? snapGeometry(pg, ed().lib).segs.filter((s) => s.id !== id) : [];
};
const lineOf = (id: string) => {
  const el = page()?.elements.find((e) => e.id === id);
  return el && el.kind === 'line' && el.points.length === 2 ? el : null;
};

export function trimSession(): Session {
  return base('TRIM', t('Select the part of a line to trim [Undo]:'), {
    pick: 'object',
    object(id, at) {
      const el = lineOf(id);
      if (!el) return bad(t('TRIM works on straight lines with two points.'));
      const pieces = trimSegment(el.points[0], el.points[1], others(id), at);
      if (!pieces) return bad(t('No other line crosses it, so there is nothing to trim.'));
      const pg = ed().pageId;
      const keep = { ...(el.dashed ? { dashed: true } : {}), ...(el.layer ? { layer: el.layer } : {}) };
      ed().exec({ type: 'batch', label: 'trim', commands: [{ type: 'el/remove', page: pg, ids: [id] }, ...(pieces.length ? [{ type: 'el/add' as const, page: pg, elements: pieces.map((points): El => ({ id: newId('e'), kind: 'line', points, ...keep })) }] : [])] });
    },
    text: (s) => (/^u(ndo)?$/i.test(s) ? (ed().undo(), true) : false),
  });
}

export function extendSession(): Session {
  return base('EXTEND', t('Select the end of a line to extend [Undo]:'), {
    pick: 'object',
    object(id, at) {
      const el = lineOf(id);
      if (!el) return bad(t('EXTEND works on straight lines with two points.'));
      const r = extendSegment(el.points[0], el.points[1], others(id), at);
      if (!r) return bad(t('That end does not reach another line.'));
      ed().exec({ type: 'el/update', page: ed().pageId, id, patch: { points: [...r] } });
    },
    text: (s) => (/^u(ndo)?$/i.test(s) ? (ed().undo(), true) : false),
  });
}

export function offsetSession(distance: number | null = null): Session {
  if (distance === null) {
    return base('OFFSET', t('Specify the offset distance:'), {
      point: () => bad(t('Type the distance in millimetres.')),
      text(s) {
        const d = parseNumber(s);
        if (d === null || d <= 0) return false;
        go(offsetSession(d));
        return true;
      },
    });
  }
  const pick = (): Session => base('OFFSET', t('Select an object to offset [Exit]:'), {
    pick: 'object',
    object(id) {
      const el = page()?.elements.find((e) => e.id === id);
      if (!el || (el.kind !== 'line' && el.kind !== 'rect' && el.kind !== 'circle') || (el.kind === 'line' && el.points.length !== 2)) return bad(t('OFFSET works on straight lines, rectangles and circles.'));
      go(base('OFFSET', t('Specify the point on the side to offset to:'), {
        point(p) {
          const keep = { ...(el.layer ? { layer: el.layer } : {}), ...('dashed' in el && el.dashed ? { dashed: true } : {}) };
          let made: El | null = null;
          if (el.kind === 'line') made = { id: newId('e'), kind: 'line', points: [...offsetSegment(el.points[0], el.points[1], distance, p)], ...keep };
          else if (el.kind === 'rect') { const r = offsetRect(el, distance, p); if (r) made = { id: newId('e'), kind: 'rect', ...r, ...keep }; }
          else if (el.kind === 'circle') { const r = offsetCircle(el, distance, p); if (r) made = { id: newId('e'), kind: 'circle', x: el.x, y: el.y, r, ...keep }; }
          if (!made) bad(t('The offset would leave nothing.'));
          else ed().exec({ type: 'el/add', page: ed().pageId, elements: [made] });
          go(pick());
        },
      }));
    },
    text: (s) => (/^e(xit)?$/i.test(s) ? (end(), true) : false),
  });
  return pick();
}

export function distSession(first: Pt | null = null): Session {
  return base('DIST', first ? t('Specify second point:') : t('Specify first point:'), {
    base: first,
    rubber: (c) => (first ? [{ kind: 'poly', pts: [first, c] }] : []),
    point(p) {
      if (!first) return go(distSession(p));
      say(t('Distance = {d} mm, angle = {a} degrees, delta X = {dx}, delta Y = {dy}', { d: n2(dist(first, p)), a: n2(angleOf(first, p)), dx: n2(p.x - first.x), dy: n2(p.y - first.y) }));
      end();
    },
  });
}

export function zoomSession(corner: Pt | null = null): Session {
  return base('ZOOM', corner ? t('Specify the opposite corner:') : t('Specify a corner of the window, or [Extents/Previous/Window] or a factor:'), {
    base: corner,
    rubber: (c) => (corner ? [{ kind: 'poly', pts: [corner, { x: c.x, y: corner.y }, c, { x: corner.x, y: c.y }], closed: true }] : []),
    point(p) {
      if (!corner) return go(zoomSession(p));
      view()?.zoomWindow(corner, p);
      end();
    },
    text(s) {
      const v = view();
      if (/^(e|extents|a|all)$/i.test(s)) { v?.fit(); end(); return true; }
      if (/^p(revious)?$/i.test(s)) { v?.previous(); end(); return true; }
      if (/^w(indow)?$/i.test(s)) return true;
      const f = parseNumber(s);
      if (f !== null && f > 0) { v?.zoomBy(f); end(); return true; }
      return false;
    },
  });
}
