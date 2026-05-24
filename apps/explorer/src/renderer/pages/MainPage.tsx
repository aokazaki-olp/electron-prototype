import { useState, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Settings, LogOut, AlertCircle } from 'lucide-react';
import { SObjectBrowser } from '../components/SObjectBrowser.js';
import { SoqlEditor } from '../components/SoqlEditor.js';
import { ResultTable } from '../components/ResultTable.js';
import { LogViewer } from '../components/LogViewer.js';
import { useAppStore } from '../store.js';

type BottomTab = 'result' | 'log';

const BOTTOM_TABS: readonly BottomTab[] = ['result', 'log'];

interface Props {
  onDisconnect: () => void;
  onSettings: () => void;
}

export const MainPage = ({ onDisconnect, onSettings }: Props): JSX.Element => {
  const { profiles, activeProfileId, settings, tabs, activeTabId } = useAppStore(
    useShallow(s => ({
      profiles: s.profiles,
      activeProfileId: s.activeProfileId,
      settings: s.settings,
      tabs: s.tabs,
      activeTabId: s.activeTabId,
    }))
  );
  const [bottomTab, setBottomTab] = useState<BottomTab>('result');
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  const activeTab = tabs.find(t => t.id === activeTabId);
  const result = activeTab?.result ?? null;

  useEffect(() => {
    if (result) setBottomTab('result');
  }, [result]);

  const activeProfile = profiles.find(p => p.id === activeProfileId);

  const handleDisconnect = async () => {
    if (!activeProfileId) return;
    setDisconnectError(null);
    try {
      await window.sfx.disconnect(activeProfileId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      window.sfx.rendererLog('error', `disconnect 失敗: ${msg}`);
      setDisconnectError(`切断に失敗しました: ${msg}`);
    } finally {
      // 例外が出てもローカル状態は切断扱いにする
      onDisconnect();
    }
  };

  const tabLabel = (key: BottomTab): string => {
    if (key === 'result') {
      return `結果${result != null ? ` (${result.fetchedCount.toLocaleString()}件)` : ''}`;
    }
    return 'ログ';
  };

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* ヘッダー */}
      <header className="flex items-center gap-3 px-4 py-2 bg-slate-800 text-white flex-shrink-0">
        <span className="font-semibold text-sm">Salesforce Explorer</span>
        {activeProfile && (
          <>
            <span className="text-slate-400 text-xs">|</span>
            <span className="text-sm text-slate-300">{activeProfile.name}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded ${
              activeProfile.mode === 'readonly'
                ? 'bg-slate-600 text-slate-300'
                : 'bg-orange-900 text-orange-300'
            }`}>
              {activeProfile.mode === 'readonly' ? '読み取り専用' : '読み書き'}
            </span>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onSettings}
            className="flex items-center gap-1 text-xs text-slate-300 hover:text-white px-2 py-1 rounded hover:bg-slate-700"
          >
            <Settings size={13} /> 設定
          </button>
          <button
            type="button"
            onClick={handleDisconnect}
            className="flex items-center gap-1 text-xs text-slate-300 hover:text-white px-2 py-1 rounded hover:bg-slate-700"
          >
            <LogOut size={13} /> 切断
          </button>
        </div>
      </header>

      {disconnectError && (
        <div role="alert" className="flex items-start gap-2 px-3 py-2 bg-red-50 border-b border-red-200 text-xs text-red-700">
          <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
          <span>{disconnectError}</span>
        </div>
      )}

      {/* メインコンテンツ */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左ペイン: sObjectブラウザ */}
        <div className="w-64 flex-shrink-0 overflow-hidden">
          <SObjectBrowser />
        </div>

        {/* 右ペイン */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* SOQLエディタ (上部 40%) */}
          <div style={{ height: '40%' }} className="flex-shrink-0 overflow-hidden">
            <SoqlEditor settings={settings} />
          </div>

          {/* 下部タブ */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* タブバー */}
            <div role="tablist" className="flex items-center border-b border-slate-200 bg-slate-50 flex-shrink-0">
              {BOTTOM_TABS.map(key => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={bottomTab === key}
                  onClick={() => setBottomTab(key)}
                  className={`px-4 py-1.5 text-xs font-medium border-b-2 ${
                    bottomTab === key
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {tabLabel(key)}
                </button>
              ))}
            </div>

            {/* タブコンテンツ */}
            <div className="flex-1 overflow-hidden">
              {bottomTab === 'result' && <ResultTable result={result} />}
              {bottomTab === 'log' && <LogViewer />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
