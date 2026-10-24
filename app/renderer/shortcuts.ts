// The keyboard shortcuts of the editor, in one table: the handler in CanvasView and the shortcut
// list dialog both read it. Keys follow what electrical CAD users expect.
import { t } from '@shared/i18n';

export interface Shortcut {
  keys: string;
  action: () => string;
}

export const SHORTCUTS: Shortcut[] = [
  { keys: 'V / Esc', action: () => t('Select tool; Esc also cancels the current action') },
  { keys: 'W', action: () => t('Draw wires (Tab: horizontal or vertical first; Enter or double-click: finish)') },
  { keys: 'T', action: () => t('Place text') },
  { keys: 'L', action: () => t('Draw a line') },
  { keys: 'B', action: () => t('Draw a rectangle') },
  { keys: 'D', action: () => t('Draw a dashed outline') },
  { keys: 'G', action: () => t('Place a table') },
  { keys: 'I', action: () => t('Place an image') },
  { keys: 'N', action: () => t('Place a warning sign') },
  { keys: 'R', action: () => t('Rotate the selection (or the symbol being placed) by 90 degrees') },
  { keys: 'M', action: () => t('Mirror the selection (or the symbol being placed)') },
  { keys: 'Delete / Backspace', action: () => t('Delete the selection') },
  { keys: 'Arrow keys', action: () => t('Move the selection by one grid step (Shift: 10 mm)') },
  { keys: 'Ctrl+A', action: () => t('Select everything on the page') },
  { keys: 'Ctrl+C / Ctrl+V / Ctrl+D', action: () => t('Copy, paste, duplicate') },
  { keys: 'Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y', action: () => t('Undo and redo') },
  { keys: 'Ctrl+S / Ctrl+Shift+S', action: () => t('Save, save as') },
  { keys: 'Ctrl+O / Ctrl+N', action: () => t('Open a project, new project') },
  { keys: 'Ctrl+P', action: () => t('Export PDF') },
  { keys: 'Ctrl+,', action: () => t('Project settings') },
  { keys: 'Ctrl+Shift+R', action: () => t('Renumber designations automatically') },
  { keys: 'Page Up / Page Down', action: () => t('Previous or next page') },
  { keys: 'F', action: () => t('Fit the page in the window') },
  { keys: '+ / -', action: () => t('Zoom in and out') },
  { keys: 'Space + drag, middle button', action: () => t('Pan') },
  { keys: '/', action: () => t('Search the symbol library') },
  { keys: 'F1 / ?', action: () => t('Show this list') },
];
