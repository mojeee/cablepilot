import { lazy, Suspense, useEffect } from 'react';
import { t } from '@shared/i18n';
import { TopBar } from './components/TopBar';
import { Ribbon } from './components/Ribbon';
import { Workspace } from './components/Workspace';
import { CommandLine } from './components/CommandLine';
import { StatusBar } from './components/StatusBar';
import { PlcDialog } from './components/PlcDialog';
import { AddPageDialog, RecoveryBanner, ShortcutsDialog } from './components/dialogs';
import { ProjectSettingsDialog } from './components/ProjectSettings';
import { SymbolEditorDialog } from './components/SymbolEditor';
import { BomDialog } from './components/BomDialog';
import { ReportsDialog } from './components/ReportsDialog';
import { WiresDialog } from './components/WiresDialog';
import { ChecksBanner } from './components/ChecksBanner';
import { RevisionsDialog } from './components/RevisionsDialog';
import { SizingDialog } from './components/SizingDialog';
import { WarehouseDialog } from './components/WarehouseDialog';
import { AiSettingsDialog } from './components/AiSettingsDialog';
import { LayoutDialog } from './components/LayoutDialog';
import { useEditor } from './state/editor';
import { useLayout } from './state/layout';
import { watchProposals } from './state/chat';
import { listenForStockChanges, useStock } from './state/stock';
import { useUi } from './state/ui';

const AUTOSAVE_MS = 4000;
// The 3D view loads only when it is opened: three.js stays out of the startup (M6 part 3).
const Cabinet3D = lazy(() => import('./components/Cabinet3D'));

export function App() {
  // Re-render on language change: t() reads the current language.
  const language = useUi((s) => s.language);
  const dialog = useEditor((s) => s.dialog);
  useEffect(() => {
    void (async () => {
      const api = window.cablepilot;
      if (!api) return;
      const settings = await api.settings.get();
      if (settings.ok) useUi.getState().hydrate(settings.value);
      const info = await api.app.info();
      if (info.ok) {
        const { version, platform } = info.value;
        document.documentElement.dataset.platform = platform;
        useUi.getState().addMessage('info', () => t('CablePilot {version} started on {platform}.', { version, platform }));
      }
      await useEditor.getState().loadCompany();
      await useStock.getState().load();
      await useEditor.getState().checkRecovery();
    })();
  }, []);
  useEffect(() => listenForStockChanges(), []);
  useEffect(() => window.cablepilot?.layout.onChanged(() => void useLayout.getState().refreshFolder(true)), []);
  useEffect(() => watchProposals(), []);
  // Autosave: while the project has unsaved changes, write a recovery copy a few seconds after the
  // last change, and again when the window goes away. Saving clears it (state/editor.ts).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useEditor.subscribe((s, prev) => {
      if (s.history.present === prev.history.present) return;
      clearTimeout(timer);
      timer = setTimeout(() => void useEditor.getState().autosaveNow(), AUTOSAVE_MS);
    });
    const onHide = () => void useEditor.getState().autosaveNow();
    window.addEventListener('pagehide', onHide);
    return () => {
      unsub();
      clearTimeout(timer);
      window.removeEventListener('pagehide', onHide);
    };
  }, []);
  const fullscreen = useUi((s) => s.fullscreen);
  return (
    <div className={`app${fullscreen ? ' is-fullscreen' : ''}`} data-lang={language}>
      <div className="app-top">
        {!fullscreen && <TopBar />}
        <RecoveryBanner />
        {!fullscreen && <ChecksBanner />}
        {!fullscreen && <Ribbon />}
      </div>
      <Workspace />
      <CommandLine />
      <StatusBar />
      {dialog === 'settings' && <ProjectSettingsDialog />}
      {dialog === 'symbolEditor' && <SymbolEditorDialog />}
      {dialog === 'addPage' && <AddPageDialog />}
      {dialog === 'shortcuts' && <ShortcutsDialog />}
      {dialog === 'bom' && <BomDialog />}
      {dialog === 'reports' && <ReportsDialog />}
      {dialog === 'wires' && <WiresDialog />}
      {dialog === 'revisions' && <RevisionsDialog />}
      {dialog === 'plc' && <PlcDialog />}
      {dialog === 'sizing' && <SizingDialog />}
      {dialog === 'warehouse' && <WarehouseDialog />}
      {dialog === 'ai' && <AiSettingsDialog />}
      {dialog === 'layout' && <LayoutDialog />}
      {dialog === 'layout3d' && <Suspense fallback={null}><Cabinet3D /></Suspense>}
    </div>
  );
}
