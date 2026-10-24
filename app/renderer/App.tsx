import { useEffect } from 'react';
import { t } from '@shared/i18n';
import { TopBar } from './components/TopBar';
import { PageNavigator } from './components/PageNavigator';
import { SymbolBrowser } from './components/SymbolBrowser';
import { CanvasView } from './components/CanvasView';
import { PropertiesPanel } from './components/PropertiesPanel';
import { MessageList } from './components/MessageList';
import { useUi } from './state/ui';

export function App() {
  // Re-render on language change: t() reads the current language.
  const language = useUi((s) => s.language);
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
    })();
  }, []);
  return (
    <div className="app" data-lang={language}>
      <TopBar />
      <div className="workspace">
        <PageNavigator />
        <SymbolBrowser />
        <CanvasView />
        <PropertiesPanel />
      </div>
      <MessageList />
    </div>
  );
}
