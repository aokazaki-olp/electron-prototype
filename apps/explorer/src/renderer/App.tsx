import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { SettingsPage } from './pages/SettingsPage.js';
import { MainPage } from './pages/MainPage.js';
import { ToastContainer } from './components/Toast.js';
import { useAppStore, persistTabs } from './store.js';
import type { SoqlTab } from './store.js';
import type { LogEntry } from '@app/ipc-contract';

const App = (): JSX.Element => {
  const { authState, activeProfileId, setAuthState, setActiveProfileId, appendLog, tabs, activeTabId, loadTabs } = useAppStore(
    useShallow(s => ({
      authState: s.authState,
      activeProfileId: s.activeProfileId,
      setAuthState: s.setAuthState,
      setActiveProfileId: s.setActiveProfileId,
      appendLog: s.appendLog,
      tabs: s.tabs,
      activeTabId: s.activeTabId,
      loadTabs: s.loadTabs,
    }))
  );
  const [showSettings, setShowSettings] = useState(false);
  const settingsCloseBtnRef = useRef<HTMLDivElement>(null);
  const tabsHydrated = useRef(false);

  // ログストリーミング購読（マウント時のみ）
  useEffect(() => {
    const unsubscribe = window.sfx.onLogEntry((entry: LogEntry) => {
      appendLog(entry);
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 起動時: プロファイル接続試行 + タブ復元（main プロセスから IPC で取得）
  useEffect(() => {
    void (async () => {
      try {
        const [profiles, tabsState] = await Promise.all([
          window.sfx.loadProfiles(),
          window.sfx.loadTabs(),
        ]);
        if (tabsState && tabsState.tabs.length > 0) {
          const restored: SoqlTab[] = tabsState.tabs.map(t => ({
            id: t.id,
            name: t.name,
            soql: t.soql,
            fetchAll: t.fetchAll,
            result: null,
          }));
          const validId = restored.find(t => t.id === tabsState.activeTabId)?.id ?? restored[0]?.id;
          if (validId != null) {
            loadTabs(restored, validId);
          }
        }
        tabsHydrated.current = true;

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
        tabsHydrated.current = true;
        setAuthState('disconnected');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // タブ変更時の永続化（IPC saveTabs）。hydrate 前の保存はスキップする
  useEffect(() => {
    if (!tabsHydrated.current) return;
    void window.sfx.saveTabs(persistTabs({ tabs, activeTabId })).catch(() => {
      // 保存失敗は致命的でないのでログのみ
      window.sfx.rendererLog('warn', 'タブ状態の保存に失敗しました');
    });
  }, [tabs, activeTabId]);

  // 設定モーダル: Esc クローズ + 開閉時のフォーカス管理
  useEffect(() => {
    if (!showSettings) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowSettings(false);
    };
    document.addEventListener('keydown', onKey);
    // 開いた直後にモーダル内へフォーカスを移動
    settingsCloseBtnRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [showSettings]);

  if (authState === 'checking') {
    return (
      <>
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <p className="text-slate-500 text-sm">起動中...</p>
        </div>
        <ToastContainer />
      </>
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
          <div
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6"
            onClick={() => setShowSettings(false)}
          >
            <div
              ref={settingsCloseBtnRef}
              role="dialog"
              aria-modal="true"
              aria-label="設定"
              tabIndex={-1}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto outline-none"
            >
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
        <ToastContainer />
      </>
    );
  }

  return (
    <>
      <SettingsPage
        onConnect={(profileId) => {
          setActiveProfileId(profileId);
          setAuthState('connected');
        }}
      />
      <ToastContainer />
    </>
  );
};

export default App;
