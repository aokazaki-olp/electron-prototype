import { useEffect, useState } from 'react';
import { PoiSearchPage } from './pages/PoiSearchPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { useAppStore } from './store.js';

const App = (): JSX.Element => {
  const { settings, setSettings } = useAppStore();
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    window.sfx.loadSettings().then(setSettings).catch(() => setSettings({}));
  }, []);

  if (settings === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500 text-sm">起動中...</p>
      </div>
    );
  }

  if (settingsOpen || !settings.yahooAppId?.trim()) {
    return (
      <SettingsPage
        onClose={settings.yahooAppId?.trim() ? () => setSettingsOpen(false) : undefined}
      />
    );
  }

  return <PoiSearchPage onSettings={() => setSettingsOpen(true)} />;
};

export default App;
