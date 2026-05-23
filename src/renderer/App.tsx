import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { SettingsPage } from './pages/SettingsPage.js';
import { MainPage } from './pages/MainPage.js';
import { useAppStore } from './store.js';
import type { LogEntry } from '../ipc/contract.js';

const App = (): JSX.Element => {
  const { authState, activeProfileId, setAuthState, setActiveProfileId, appendLog } = useAppStore(
    useShallow(s => ({
      authState: s.authState,
      activeProfileId: s.activeProfileId,
      setAuthState: s.setAuthState,
      setActiveProfileId: s.setActiveProfileId,
      appendLog: s.appendLog,
    }))
  );
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    // ログストリーミング購読
    const unsubscribe = window.sfx.onLogEntry((entry: LogEntry) => {
      appendLog(entry);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    // 起動時: プロファイルを順に試み、最初に自動接続できたものを使う
    const init = async () => {
      try {
        const profiles = await window.sfx.loadProfiles();
        if (profiles.length === 0) {
          setAuthState('disconnected');
          return;
        }
        for (const profile of profiles) {
          const state = await window.sfx.getAuthState(profile.id);
          if (state === 'connected') {
            setActiveProfileId(profile.id);
            setAuthState('connected');
            return;
          }
        }
        setAuthState('disconnected');
      } catch {
        setAuthState('disconnected');
      }
    };
    init();
  }, []);

  if (authState === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500 text-sm">起動中...</p>
      </div>
    );
  }

  if (authState === 'connected' && activeProfileId) {
    return (
      <>
        <MainPage
          onDisconnect={() => {
            setActiveProfileId(null);
            setAuthState('disconnected');
          }}
          onSettings={() => setShowSettings(true)}
        />
        {showSettings && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <SettingsPage
                onConnect={(profileId) => {
                  setActiveProfileId(profileId);
                  setAuthState('connected');
                  setShowSettings(false);
                }}
                onClose={() => setShowSettings(false)}
              />
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <SettingsPage
      onConnect={(profileId) => {
        setActiveProfileId(profileId);
        setAuthState('connected');
      }}
    />
  );
};

export default App;
