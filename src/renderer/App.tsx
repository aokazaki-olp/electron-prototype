import { useEffect, useState } from 'react';
import { SettingsPage } from './pages/SettingsPage.js';
import { MainPage } from './pages/MainPage.js';
import { PoiSearchPage } from './pages/PoiSearchPage.js';
import { useAppStore } from './store.js';
import type { LogEntry } from '../ipc/contract.js';

const App = (): JSX.Element => {
  const { authState, activeProfileId, setAuthState, setActiveProfileId, appendLog } = useAppStore();
  const [poiOpen, setPoiOpen] = useState(false);

  useEffect(() => {
    // ログストリーミング購読
    const unsubscribe = window.sfx.onLogEntry((entry: LogEntry) => {
      appendLog(entry);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    // 起動時: 最後に使ったプロファイルがあれば自動リフレッシュを試みる
    window.sfx.loadProfiles().then(async (profiles) => {
      if (profiles.length === 0) {
        setAuthState('disconnected');
        return;
      }
      // 最初のプロファイルで自動接続を試みる
      const first = profiles[0];
      const state = await window.sfx.getAuthState(first.id);
      if (state === 'connected') {
        setActiveProfileId(first.id);
        setAuthState('connected');
      } else {
        setAuthState('disconnected');
      }
    }).catch(() => {
      setAuthState('disconnected');
    });
  }, []);

  if (poiOpen) {
    return <PoiSearchPage onBack={() => setPoiOpen(false)} />;
  }

  if (authState === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500 text-sm">起動中...</p>
      </div>
    );
  }

  if (authState === 'connected' && activeProfileId) {
    return (
      <MainPage
        onDisconnect={() => {
          setActiveProfileId(null);
          setAuthState('disconnected');
        }}
        onSettings={() => setAuthState('disconnected')}
        onPoiSearch={() => setPoiOpen(true)}
      />
    );
  }

  return (
    <SettingsPage
      onConnect={(profileId) => {
        setActiveProfileId(profileId);
        setAuthState('connected');
      }}
      onPoiSearch={() => setPoiOpen(true)}
    />
  );
};

export default App;
