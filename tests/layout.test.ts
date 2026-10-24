// The docked panel layout: defaults, validation of what a settings file holds, docking, resizing, collapsing.
import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT, PANELS, SIZE_LIMITS, panelsIn, parseLayout, withCollapsed, withDock, withShown, withSize } from '@shared/layout';
import { DEFAULT_SETTINGS, parseSettings } from '@shared/settings';

describe('panel layout', () => {
  it('has every panel in exactly one dock by default', () => {
    expect(PANELS.every((p) => ['left', 'right', 'bottom', 'hidden'].includes(DEFAULT_LAYOUT.dock[p]))).toBe(true);
    expect(panelsIn(DEFAULT_LAYOUT, 'left')).toEqual(['pages', 'symbols']);
    expect(panelsIn(DEFAULT_LAYOUT, 'bottom')).toEqual(['messages']);
    expect(panelsIn(DEFAULT_LAYOUT, 'right')).toEqual(['properties', 'layers', 'chat']);
  });
  it('falls back to the defaults for anything invalid and keeps what is valid', () => {
    expect(parseLayout(null)).toEqual(DEFAULT_LAYOUT);
    expect(parseLayout({ dock: { chat: 'moon' }, size: { left: 'wide' } })).toEqual(DEFAULT_LAYOUT);
    const l = parseLayout({ dock: { chat: 'left', pages: 'hidden' }, size: { left: 99999, right: 10, bottom: 200 }, collapsed: ['chat', 'nope'], ribbonCollapsed: true });
    expect(l.dock.chat).toBe('left');
    expect(l.dock.pages).toBe('hidden');
    expect(l.size).toEqual({ left: SIZE_LIMITS.left[1], right: SIZE_LIMITS.right[0], bottom: 200 });
    expect(l.collapsed).toEqual(['chat']);
    expect(l.ribbonCollapsed).toBe(true);
  });
  it('moves, resizes, collapses and shows panels', () => {
    const moved = withDock(DEFAULT_LAYOUT, 'layers', 'left');
    expect(panelsIn(moved, 'left')).toEqual(['pages', 'symbols', 'layers']);
    expect(moved.collapsed).not.toContain('layers');
    expect(withSize(DEFAULT_LAYOUT, 'bottom', 5000).size.bottom).toBe(SIZE_LIMITS.bottom[1]);
    expect(withCollapsed(DEFAULT_LAYOUT, 'chat', true).collapsed).toEqual(['layers', 'chat']);
    expect(withCollapsed(DEFAULT_LAYOUT, 'layers', false).collapsed).toEqual([]);
    const hidden = withDock(DEFAULT_LAYOUT, 'chat', 'hidden');
    expect(withShown(hidden, 'chat').dock.chat).toBe('right');
    expect(withShown(DEFAULT_LAYOUT, 'layers').collapsed).toEqual([]);
  });
  it('is part of the settings, validated when read', () => {
    expect(DEFAULT_SETTINGS.layout).toEqual(DEFAULT_LAYOUT);
    expect(parseSettings({ layout: { dock: { chat: 'bottom' } } }).layout.dock.chat).toBe('bottom');
    expect(parseSettings({ layout: 7 }).layout).toEqual(DEFAULT_LAYOUT);
  });
});
