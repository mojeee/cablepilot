import { useEffect } from 'react';
import { t } from '@shared/i18n';
import { TopBar } from './components/TopBar';
import { PageNavigator } from './components/PageNavigator';
import { SymbolBrowser } from './components/SymbolBrowser';
import { CanvasView } from './components/CanvasView';
import { PropertiesPanel } from './components/PropertiesPanel';
import { MessageList } from './components/MessageList';
import { AddPageDialog, RecoveryBanner, ShortcutsDialog } from './components/dialogs';
import { ProjectSettingsDialog } from './components/ProjectSettings';
import { SymbolEditorDialog } from './components/SymbolEditor';
import { BomDialog } from './components/BomDialog';
import { ReportsDialog } from './components/ReportsDialog';
import { WiresDialog } from './components/WiresDialog';
import { useEditor } from './state/editor';
import { useUi } from './state/ui';

const AUTOSAVE_MS = 4000;

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
      await useEditor.getState().checkRecovery();
    })();
  }, []);
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
  return (
    <div className="app" data-lang={language}>
      <div>
        <TopBar />
        <RecoveryBanner />
      </div>
      <div className="workspace">
        <PageNavigator />
        <SymbolBrowser />
        <CanvasView />
        <PropertiesPanel />
      </div>
      <MessageList />
      {dialog === 'settings' && <ProjectSettingsDialog />}
      {dialog === 'symbolEditor' && <SymbolEditorDialog />}
      {dialog === 'addPage' && <AddPageDialog />}
      {dialog === 'shortcuts' && <ShortcutsDialog />}
      {dialog === 'bom' && <BomDialog />}
      {dialog === 'reports' && <ReportsDialog />}
      {dialog === 'wires' && <WiresDialog />}
    </div>
  );
}
