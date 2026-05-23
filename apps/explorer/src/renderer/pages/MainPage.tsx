import { useState, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Settings, LogOut } from 'lucide-react';
import { SObjectBrowser } from '../components/SObjectBrowser.js';
import { SoqlEditor } from '../components/SoqlEditor.js';
import { ResultTable } from '../components/ResultTable.js';
import { LogViewer } from '../components/LogViewer.js';
import { useAppStore } from '../store.js';

type BottomTab = 'result' | 'log';

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
  const activeTab = tabs.find(t => t.id === activeTabId);
  const result = activeTab?.result ?? null;

  useEffect(() => {
    if (result) setBottomTab('result');
  }, [result]);

  const activeProfile = profiles.find(p => p.id === activeProfileId);

  const handleDisconnect = async () => {
    if (!activeProfileId) return;
    await window.sfx.disconnect(activeProfileId);
    onDisconnect();
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
            onClick={onSettings}
            className="flex items-center gap-1 text-xs text-slate-300 hover:text-white px-2 py-1 rounded hover:bg-slate-700"
          >
            <Settings size={13} /> 設定
          </button>
          <button
            onClick={handleDisconnect}
            className="flex items-center gap-1 text-xs text-slate-300 hover:text-white px-2 py-1 rounded hover:bg-slate-700"
          >
            <LogOut size={13} /> 切断
          </button>
        </div>
      </header>

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
            <div className="flex items-center border-b border-slate-200 bg-slate-50 flex-shrink-0">
              {([
                { key: 'result', label: `結果${result != null ? ` (${result.fetchedCount.toLocaleString()}件)` : ''}` },
                { key: 'log', label: 'ログ' },
              ] as { key: BottomTab; label: string }[]).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setBottomTab(tab.key)}
                  className={`px-4 py-1.5 text-xs font-medium border-b-2 ${
                    bottomTab === tab.key
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {tab.label}
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
