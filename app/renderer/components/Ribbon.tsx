// The ribbon: tabs (Home, Insert, Wires, Reports, PLC, Layout, View) with grouped tool buttons, collapsible.
// Every button runs a command through the command line's engine (cad/run.ts), so the ribbon, the
// command line and the shortcuts do the same thing and everything is undoable.
import { useState } from 'react';
import { t } from '@shared/i18n';
import { type PanelId } from '@shared/layout';
import { runCommand } from '../cad/run';
import { useCad } from '../state/cad';
import { useEditor } from '../state/editor';
import { useUi } from '../state/ui';
import { Icon } from './Icons';

interface Btn {
  label: () => string;
  icon: string;
  cmd: string;
  args?: string;
  testid?: string;
  /** Pressed state for toggles (drafting aids, panels). */
  pressed?: () => boolean;
  title?: () => string;
}
interface Group {
  label: () => string;
  buttons: Btn[];
}

const b = (cmd: string, icon: string, label: () => string, extra: Partial<Btn> = {}): Btn => ({ cmd, icon, label, ...extra });
const aid = (name: 'grid' | 'ortho' | 'snap' | 'osnap' | 'polar', icon: string, label: () => string, key: string): Btn =>
  b(name.toUpperCase(), icon, label, { pressed: () => useCad.getState().aids[name], title: () => `${label()} (${key})`, testid: `rb-${name}` });
const panel = (id: PanelId, cmd: string, icon: string, label: () => string): Btn =>
  b(cmd, icon, label, { pressed: () => useUi.getState().layout.dock[id] !== 'hidden', testid: `rb-panel-${id}` });

const GROUPS: Record<string, () => Group[]> = {
  home: () => [
    { label: () => t('Draw'), buttons: [b('LINE', 'line', () => t('Line')), b('PLINE', 'pline', () => t('Polyline')), b('RECTANGLE', 'rect', () => t('Rectangle')), b('CIRCLE', 'circle', () => t('Circle')), b('DASHED', 'dashed', () => t('Dashed outline')), b('TEXT', 'text', () => t('Text')), b('TABLE', 'table', () => t('Table')), b('IMAGE', 'image', () => t('Image'), { testid: 'tool-image' }), b('WARNING', 'warning', () => t('Warning sign'))] },
    { label: () => t('Modify'), buttons: [b('MOVE', 'move', () => t('Move')), b('COPY', 'copy', () => t('Copy')), b('ROTATE', 'rotate', () => t('Rotate')), b('MIRROR', 'mirror', () => t('Mirror')), b('ERASE', 'erase', () => t('Erase')), b('TRIM', 'trim', () => t('Trim')), b('EXTEND', 'extend', () => t('Extend')), b('OFFSET', 'offset', () => t('Offset'))] },
    { label: () => t('Edit'), buttons: [b('UNDO', 'undo', () => t('Undo'), { testid: 'rb-undo' }), b('REDO', 'redo', () => t('Redo'), { testid: 'rb-redo' }), b('SELECTALL', 'select', () => t('Select all'))] },
    { label: () => t('Inquiry'), buttons: [b('DIST', 'dist', () => t('Distance')), b('LAYER', 'layers', () => t('Layers'))] },
  ],
  insert: () => [
    { label: () => t('Symbols'), buttons: [b('INSERT', 'symbol', () => t('Symbol')), b('BOX', 'box', () => t('Black box')), b('CONNECTOR', 'connector', () => t('Connector'))] },
    { label: () => t('Pages'), buttons: [b('ADDPAGE', 'page', () => t('Add page')), b('DXFIN', 'dxf', () => t('Import DXF'))] },
  ],
  wires: () => [
    { label: () => t('Wires'), buttons: [b('WIRE', 'wire', () => t('Wire'), { testid: 'tool-wire', title: () => `${t('Wire')} (W)` }), b('NUMBER', 'number', () => t('Number wires'), { testid: 'number-wires', title: () => t('Number the wires automatically') }), b('WIRES', 'wires', () => t('Wires and cables'), { testid: 'wires' })] },
    { label: () => t('Designations'), buttons: [b('RENUMBER', 'renumber', () => t('Renumber'), { title: () => t('Renumber designations automatically') })] },
    { label: () => t('Check'), buttons: [b('CHECK', 'check', () => t('Rule check'))] },
  ],
  reports: () => [
    { label: () => t('Lists'), buttons: [b('REPORT', 'report', () => t('Reports'), { testid: 'reports' }), b('BOM', 'bom', () => t('BOM'), { testid: 'bom', title: () => t('Bill of materials') })] },
    { label: () => t('Sizing and stock'), buttons: [b('SIZE', 'size', () => t('Sizing'), { testid: 'sizing', title: () => t('Size cables and components from the schematic and the warehouse') }), b('WAREHOUSE', 'warehouse', () => t('Warehouse'), { testid: 'warehouse', title: () => t('Stock list, links to library parts') })] },
    { label: () => t('ERP'), buttons: [b('ERPPULL', 'erp', () => t('Pull stock'), { testid: 'rb-erp-pull', title: () => t('Pull the stock from the ERP') }), b('RESERVE', 'reserve', () => t('Reserve'), { testid: 'rb-reserve', title: () => t('Reservation request for the ERP') }), b('ERP', 'settings', () => t('ERP link'), { testid: 'rb-erp', title: () => t('ERP link: items, stock and reservations') })] },
    { label: () => t('Issue'), buttons: [b('REVISIONS', 'revisions', () => t('Revisions'), { testid: 'revisions', title: () => t('Revisions and issue status') }), b('SETTINGS', 'settings', () => t('Project settings...'), { testid: 'settings' }), b('PDF', 'pdf', () => t('Export PDF'), { testid: 'rb-pdf' }), b('DXFOUT', 'dxf', () => t('Export DXF'))] },
  ],
  plc: () => [
    { label: () => t('PLC'), buttons: [b('PLC', 'plc', () => t('PLC I/O'), { testid: 'plc', title: () => t('PLC I/O overview and tag lists') }), b('INSERT', 'symbol', () => t('PLC input'), { args: 'plc-input', testid: 'rb-plc-input' }), b('INSERT', 'symbol', () => t('PLC output'), { args: 'plc-output', testid: 'rb-plc-output' })] },
  ],
  layout: () => [
    { label: () => t('Cabinet'), buttons: [b('ENCLOSURE', 'enclosure', () => t('Enclosure'), { testid: 'rb-enclosure', title: () => t('Place an enclosure from the library') }), b('PLATE', 'rect', () => t('Plate'), { testid: 'rb-plate' }), b('RAIL', 'rail', () => t('DIN rail'), { testid: 'rb-rail' }), b('DUCT', 'duct', () => t('Duct'), { testid: 'rb-duct' }), b('ZONE', 'zone', () => t('No-mount zone'), { testid: 'rb-zone' }), b('COVER', 'cover', () => t('Cover'), { testid: 'rb-cover' }), b('DIM', 'dim', () => t('Dimension'), { testid: 'rb-dim' }), b('TEXT', 'text', () => t('Note'))] },
    { label: () => t('Devices'), buttons: [b('PLACE', 'place', () => t('Place devices'), { testid: 'rb-place', title: () => t('Place the devices of the schematic that are not on the layout yet') }), b('ALIGN', 'align', () => t('Align left'), { args: 'left', testid: 'rb-align-left' }), b('ALIGN', 'align', () => t('Align top'), { args: 'top', testid: 'rb-align-top' }), b('DISTRIBUTE', 'distribute', () => t('Distribute across'), { args: 'h', testid: 'rb-distribute-h' }), b('DISTRIBUTE', 'distribute', () => t('Distribute down'), { args: 'v', testid: 'rb-distribute-v' })] },
    { label: () => t('Suggestion'), buttons: [b('SUGGEST', 'suggest', () => t('Suggest layout'), { testid: 'rb-suggest', title: () => t('Suggest the whole layout as a preview') }), b('LAYOUT', 'layout', () => t('Layout window'), { testid: 'rb-layout', title: () => t('Devices not yet placed, templates, exchange, duct fill') })] },
    { label: () => t('Views and output'), buttons: [b('VIEW3D', 'cube', () => t('3D view'), { testid: 'rb-3d' }), b('DRILL', 'drill', () => t('Drilling DXF'), { testid: 'rb-drill', title: () => t('Mounting plate DXF for drilling') }), b('DXFOUT', 'dxf', () => t('Export view as DXF')), b('DXFIN', 'dxf', () => t('Import DXF'))] },
  ],
  view: () => [
    { label: () => t('Zoom'), buttons: [b('ZOOM', 'zoom', () => t('Zoom')), b('EXTENTS', 'extents', () => t('Whole page')), b('PAN', 'pan', () => t('Pan'))] },
    { label: () => t('Drafting aids'), buttons: [aid('grid', 'grid', () => t('Grid'), 'F7'), aid('ortho', 'ortho', () => t('Ortho'), 'F8'), aid('snap', 'snap', () => t('Snap'), 'F9'), aid('osnap', 'osnap', () => t('Object snap'), 'F3'), aid('polar', 'polar', () => t('Polar'), 'F10')] },
    { label: () => t('Panels'), buttons: [panel('pages', 'PAGES', 'page', () => t('Pages')), panel('symbols', 'SYMBOLS', 'symbol', () => t('Symbols')), panel('properties', 'PROPERTIES', 'settings', () => t('Properties')), panel('layers', 'LAYER', 'layers', () => t('Layers')), panel('messages', 'MESSAGES', 'report', () => t('Messages')), panel('chat', 'CHAT', 'chat', () => t('AI chat')), b('AISETTINGS', 'settings', () => t('AI settings'), { testid: 'rb-ai-settings', title: () => t('Provider, model and your API key') })] },
    { label: () => t('Window'), buttons: [b('CLEANSCREEN', 'fullscreen', () => t('Full screen'), { testid: 'rb-fullscreen', title: () => `${t('Full-screen canvas')} (Ctrl+0)` }), b('RESETLAYOUT', 'reset', () => t('Reset layout'), { testid: 'rb-reset-layout' }), b('PREVIEW', 'preview', () => t('Print preview'), { testid: 'rb-preview' }), b('HELP', 'help', () => t('Shortcuts'))] },
  ],
};

const TABS: { id: string; label: () => string; testid: string }[] = [
  { id: 'home', label: () => t('Home'), testid: 'tab-home' },
  { id: 'insert', label: () => t('Insert'), testid: 'tab-insert' },
  { id: 'wires', label: () => t('Wires'), testid: 'tab-wires' },
  { id: 'reports', label: () => t('Reports'), testid: 'tab-reports' },
  { id: 'plc', label: () => t('PLC'), testid: 'tab-plc' },
  { id: 'layout', label: () => t('Layout'), testid: 'tab-layout' },
  { id: 'view', label: () => t('View'), testid: 'tab-view' },
];

export function Ribbon() {
  const layout = useUi((s) => s.layout);
  const { setLayout } = useUi.getState();
  const [tab, setTab] = useState('home');
  useUi((s) => s.language);
  useCad((s) => s.aids);
  useEditor((s) => s.printPreview);
  const collapsed = layout.ribbonCollapsed;
  const pick = (id: string) => {
    setTab(id);
    if (collapsed) setLayout({ ...layout, ribbonCollapsed: false });
  };
  return (
    <div className={`ribbon${collapsed ? ' collapsed' : ''}`} data-testid="ribbon">
      <div className="ribbon-tabs" role="tablist" aria-label={t('Ribbon')}>
        {TABS.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} data-testid={x.testid} className={tab === x.id ? 'on' : ''} onClick={() => pick(x.id)} onDoubleClick={() => setLayout({ ...layout, ribbonCollapsed: !collapsed })}>{x.label()}</button>
        ))}
        <span className="grow" />
        <button type="button" className="ribbon-collapse" data-testid="ribbon-collapse" aria-label={collapsed ? t('Expand the ribbon') : t('Collapse the ribbon')} title={collapsed ? t('Expand the ribbon') : t('Collapse the ribbon')} onClick={() => setLayout({ ...layout, ribbonCollapsed: !collapsed })}>{collapsed ? '▾' : '▴'}</button>
      </div>
      {!collapsed && (
        <div className="ribbon-body" role="tabpanel" aria-label={TABS.find((x) => x.id === tab)?.label()}>
          {GROUPS[tab]().map((g, gi) => (
            <div className="ribbon-group" key={gi} role="group" aria-label={g.label()}>
              <div className="ribbon-buttons">
                {g.buttons.map((x, i) => {
                  const pressed = x.pressed?.();
                  return (
                    <button key={`${x.cmd}${x.args ?? ''}${i}`} type="button" className={`rb${pressed ? ' on' : ''}`} data-testid={x.testid ?? `rb-${x.cmd.toLowerCase()}`} title={x.title?.() ?? x.label()} aria-pressed={pressed} onClick={() => runCommand(x.cmd, x.args ?? '')}>
                      <Icon name={x.icon} />
                      <span>{x.label()}</span>
                    </button>
                  );
                })}
              </div>
              <div className="ribbon-group-label">{g.label()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
