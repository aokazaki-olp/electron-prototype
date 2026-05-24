import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { SettingsPage } from './pages/SettingsPage.js';
import { MainPage } from './pages/MainPage.js';
import { ToastContainer } from './components/Toast.js';
import { useGlobalKeybindings } from './hooks/useGlobalKeybindings.js';
import { useTheme } from './hooks/useTheme.js';
import { useAppStore, persistTabs } from './store.js';
import type { SoqlTab } from './store.js';
import type { LogEntry } from '@app/ipc-contract';

const App = (): JSX.Element => {
  const {
    authState, activeProfileId, setAuthState, setActiveProfileId, appendLog,
    tabs, activeTabId, loadTabs, setSettings, setProfiles,
  } = useAppStore(
    useShallow(s => ({
      authState: s.authState,
      activeProfileId: s.activeProfileId,
      setAuthState: s.setAuthState,
      setActiveProfileId: s.setActiveProfileId,
      appendLog: s.appendLog,
      tabs: s.tabs,
      activeTabId: s.activeTabId,
      loadTabs: s.loadTabs,
      setSettings: s.setSettings,
      setProfiles: s.setProfiles,
    }))
  );
  const [showSettings, setShowSettings] = useState(false);
  const settingsCloseBtnRef = useRef<HTMLDivElement>(null);
  const tabsHydrated = useRef(false);

  // B7: グローバルショートカット (Ctrl+T / Ctrl+W / Ctrl+Tab)
  useGlobalKeybindings();
  // B8: settings.theme → documentElement.classList.dark
  useTheme();

  // ログストリーミング購読（マウント時のみ）
  useEffect(() => {
    const unsubscribe = window.sfx.onLogEntry((entry: LogEntry) => {
      appendLog(entry);
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 起動時: プロファイル接続試行 + タブ復元 + 設定読み込み（main プロセスから IPC で取得）
  // 設定 (paneSizes 等) はマウント直後に必要なため、SettingsPage を開かない場合でも先読みする。
  useEffect(() => {
    void (async () => {
      try {
        const [profiles, tabsState, loadedSettings] = await Promise.all([
          window.sfx.loadProfiles(),
          window.sfx.loadTabs(),
          window.sfx.loadSettings(),
        ]);
        // 起動時に store へ反映する。これを忘れると MainPage が activeProfile を引けず
        // ヘッダーの org 名・環境バッジ・モードバッジが表示されない事故になる。
        setProfiles(profiles);
        setSettings(loadedSettings);
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

  // タブ変更時の永続化（IPC saveTabs）。hydrate 前の保存はスキップする。
  // setSoql は 1 文字打つたびに tabs を新規参照にするので、毎タイプで saveTabs が走ると
  // main プロセスの同期 fs.writeFileSync (electron-store) で UI が体感フリーズする。
  // 400ms debounce で「タイピング停止後にまとめて保存」する。タブ切替・追加・閉じる等の
  // 単発操作は次の 400ms で保存され、UI 体感には影響しない。
  const saveTabsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!tabsHydrated.current) return;
    if (saveTabsTimerRef.current) clearTimeout(saveTabsTimerRef.current);
    saveTabsTimerRef.current = setTimeout(() => {
      void window.sfx.saveTabs(persistTabs({ tabs, activeTabId })).catch(() => {
        window.sfx.rendererLog('warn', 'タブ状態の保存に失敗しました');
      });
    }, 400);
    return () => {
      if (saveTabsTimerRef.current) clearTimeout(saveTabsTimerRef.current);
    };
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
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
          <p className="text-slate-500 dark:text-slate-400 text-sm">起動中...</p>
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
              className="bg-white dark:bg-slate-900 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto outline-none"
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
