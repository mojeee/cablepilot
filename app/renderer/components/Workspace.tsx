// The docked workspace: left, right and bottom docks around the canvas, each holding panels that can be
// collapsed, moved to another dock or hidden, and resized by dragging the splitter (or with the arrow
// keys on it). The layout is saved per user (settings in the main process) and can be reset.
import { useRef, type ReactNode } from 'react';
import { t } from '@shared/i18n';
import { DOCKS, panelsIn, withCollapsed, withDock, withSize, type Dock, type PanelId } from '@shared/layout';
import { useUi } from '../state/ui';
import { CanvasView } from './CanvasView';
import { ChatPanel } from './ChatPanel';
import { LayersPanel } from './LayersPanel';
import { MessageList } from './MessageList';
import { PageNavigator } from './PageNavigator';
import { PropertiesPanel } from './PropertiesPanel';
import { SymbolBrowser } from './SymbolBrowser';

const TITLE: Record<PanelId, () => string> = {
  pages: () => t('Pages'),
  symbols: () => t('Symbols and devices'),
  properties: () => t('Properties'),
  layers: () => t('Layers'),
  messages: () => t('Messages'),
  chat: () => t('AI assistant'),
};
const BODY: Record<PanelId, () => ReactNode> = {
  pages: () => <PageNavigator />,
  symbols: () => <SymbolBrowser />,
  properties: () => <PropertiesPanel />,
  layers: () => <LayersPanel />,
  messages: () => <MessageList />,
  chat: () => <ChatPanel />,
};
const DOCK_LABEL: Record<Dock, () => string> = { left: () => t('Left'), right: () => t('Right'), bottom: () => t('Bottom'), hidden: () => t('Hidden') };

function DockPanel({ id }: { id: PanelId }) {
  const layout = useUi((s) => s.layout);
  const { setLayout } = useUi.getState();
  const collapsed = layout.collapsed.includes(id);
  return (
    <div className={`dock-panel${collapsed ? ' collapsed' : ''}`} data-testid={`panel-${id}`} data-panel={id}>
      <div className="dock-header">
        <button type="button" className="dock-toggle" aria-expanded={!collapsed} data-testid={`panel-toggle-${id}`} title={collapsed ? t('Expand') : t('Collapse')} onClick={() => setLayout(withCollapsed(layout, id, !collapsed))}>{collapsed ? '▸' : '▾'} {TITLE[id]()}</button>
        <select className="dock-move" aria-label={t('Dock {panel} to', { panel: TITLE[id]() })} data-testid={`panel-dock-${id}`} value={layout.dock[id]} onChange={(e) => setLayout(withDock(layout, id, e.target.value as Dock))}>
          {DOCKS.map((d) => <option key={d} value={d}>{DOCK_LABEL[d]()}</option>)}
        </select>
      </div>
      {!collapsed && <div className="dock-body">{BODY[id]()}</div>}
    </div>
  );
}

function Splitter({ side, dockRef }: { side: 'left' | 'right' | 'bottom'; dockRef: React.RefObject<HTMLDivElement | null> }) {
  const layout = useUi((s) => s.layout);
  const { setLayout } = useUi.getState();
  const horizontal = side === 'bottom';
  const sizeAt = (e: { clientX: number; clientY: number }) => {
    const r = dockRef.current?.getBoundingClientRect();
    if (!r) return layout.size[side];
    return side === 'left' ? e.clientX - r.left : side === 'right' ? r.right - e.clientX : r.bottom - e.clientY;
  };
  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const move = (ev: PointerEvent) => useUi.getState().setLayout(withSize(useUi.getState().layout, side, sizeAt(ev)), false);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      useUi.getState().setLayout(useUi.getState().layout);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const onKey = (e: React.KeyboardEvent) => {
    const grow = side === 'left' ? 'ArrowRight' : side === 'right' ? 'ArrowLeft' : 'ArrowUp';
    const shrink = side === 'left' ? 'ArrowLeft' : side === 'right' ? 'ArrowRight' : 'ArrowDown';
    if (e.key !== grow && e.key !== shrink) return;
    e.preventDefault();
    setLayout(withSize(layout, side, layout.size[side] + (e.key === grow ? 24 : -24)));
  };
  return <div className={`splitter ${horizontal ? 'h' : 'v'}`} role="separator" tabIndex={0} aria-orientation={horizontal ? 'horizontal' : 'vertical'} aria-label={t('Resize the {side} dock', { side: DOCK_LABEL[side]() })} aria-valuenow={layout.size[side]} data-testid={`split-${side}`} onPointerDown={onDown} onKeyDown={onKey} />;
}

function DockArea({ side }: { side: 'left' | 'right' | 'bottom' }) {
  const layout = useUi((s) => s.layout);
  const ref = useRef<HTMLDivElement>(null);
  const panels = panelsIn(layout, side);
  if (!panels.length) return null;
  const style = side === 'bottom' ? { height: layout.size.bottom } : { width: layout.size[side] };
  const split = <Splitter side={side} dockRef={ref} />;
  return (
    <>
      {side === 'right' && split}
      {side === 'bottom' && split}
      <div ref={ref} className={`dock dock-${side}`} data-testid={`dock-${side}`} style={style}>
        {panels.map((p) => <DockPanel key={p} id={p} />)}
      </div>
      {side === 'left' && split}
    </>
  );
}

export function Workspace() {
  const fullscreen = useUi((s) => s.fullscreen);
  useUi((s) => s.language);
  if (fullscreen) {
    return (
      <div className="workspace fullscreen" data-testid="workspace">
        <div className="workspace-main"><CanvasView /></div>
        <button type="button" className="exit-fullscreen" data-testid="exit-fullscreen" onClick={() => useUi.getState().setFullscreen(false)}>{t('Exit full screen')}</button>
      </div>
    );
  }
  return (
    <div className="workspace" data-testid="workspace">
      <DockArea side="left" />
      <div className="workspace-main">
        <CanvasView />
        <DockArea side="bottom" />
      </div>
      <DockArea side="right" />
    </div>
  );
}
