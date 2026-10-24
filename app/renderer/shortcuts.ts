// The keyboard shortcuts of the editor, in one table: the handler in CanvasView and the shortcut
// list dialog both read it. Keys follow what electrical CAD users expect.
import { t } from '@shared/i18n';

export interface Shortcut {
  keys: string;
  action: () => string;
}

export const SHORTCUTS: Shortcut[] = [
  { keys: 'Command line', action: () => t('Type a command and press Enter: L, PL, REC, C, M, CO, RO, MI, E, TR, EX, O, Z, ZE, U, PAN, LA, DI, INSERT, WIRE, NUMBER, REPORT, CHECK, SIZE. Anything else goes to the assistant.') },
  { keys: 'Enter / Space', action: () => t('Repeat the last command (on an empty command line), or finish the running one') },
  { keys: 'Esc', action: () => t('Cancel the running command and clear the selection') },
  { keys: 'F7 / F8 / F9 / F3 / F10', action: () => t('Grid display, ortho, grid snap, object snap, polar tracking') },
  { keys: '@x,y  @d<a  x,y', action: () => t('Typed points: relative, relative polar (angle counter-clockwise, 90 is up), absolute; a plain number is a distance toward the cursor') },
  { keys: 'V / W / F', action: () => t('Select tool, draw wires (Tab: horizontal or vertical first; Enter or double-click: finish), fit the page') },
  { keys: 'R / M', action: () => t('Rotate or mirror the symbol being placed') },
  { keys: 'Drag left to right / right to left', action: () => t('Window selection (what is inside) / crossing selection (what it touches); Shift removes') },
  { keys: 'Right-click', action: () => t('Context menu with "Repeat" the last command') },
  { keys: 'Delete / Backspace', action: () => t('Delete the selection') },
  { keys: 'Arrow keys', action: () => t('Move the selection by one grid step (Shift: 10 mm)') },
  { keys: 'Ctrl+A', action: () => t('Select everything on the page') },
  { keys: 'Ctrl+C / Ctrl+V / Ctrl+D', action: () => t('Copy, paste, duplicate') },
  { keys: 'Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y', action: () => t('Undo and redo') },
  { keys: 'Ctrl+S / Ctrl+Shift+S', action: () => t('Save, save as') },
  { keys: 'Ctrl+O / Ctrl+N', action: () => t('Open a project, new project') },
  { keys: 'Ctrl+P', action: () => t('Export PDF') },
  { keys: 'Ctrl+0', action: () => t('Full-screen canvas on and off') },
  { keys: 'Ctrl+,', action: () => t('Project settings') },
  { keys: 'Ctrl+Shift+R', action: () => t('Renumber designations automatically') },
  { keys: 'Page Up / Page Down', action: () => t('Previous or next page') },
  { keys: '+ / -', action: () => t('Zoom in and out') },
  { keys: 'Space + drag, middle button', action: () => t('Pan') },
  { keys: '/', action: () => t('Search the symbol library') },
  { keys: 'F1 / ?', action: () => t('Show this list') },
];
