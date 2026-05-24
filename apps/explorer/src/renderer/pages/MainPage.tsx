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

type Environment = 'production' | 'sandbox' | 'scratch' | 'custom';

/**
 * loginUrl からおおまかな org 環境種別を推定する。
 * - login.salesforce.com → production
 * - test.salesforce.com → sandbox
 * - *.sandbox.my.salesforce.com → sandbox (My Domain 経由)
 * - *.scratch.my.salesforce.com / *.develop.my.salesforce.com → scratch
 * - それ以外 → custom (My Domain ベースの本番が多いが断定できない)
 */
const detectEnvironment = (loginUrl: string): Environment => {
  try {
    const host = new URL(loginUrl).hostname.toLowerCase();
    if (host === 'login.salesforce.com') return 'production';
    if (host === 'test.salesforce.com') return 'sandbox';
    if (host.endsWith('.sandbox.my.salesforce.com')) return 'sandbox';
    if (host.endsWith('.scratch.my.salesforce.com')) return 'scratch';
    if (host.endsWith('.develop.my.salesforce.com')) return 'scratch';
    return 'custom';
  } catch {
    return 'custom';
  }
};

const ENV_BADGE: Record<Environment, { label: string; className: string }> = {
  production: { label: 'Production', className: 'bg-red-700 text-red-50 border border-red-500' },
  sandbox:    { label: 'Sandbox',    className: 'bg-blue-700 text-blue-50 border border-blue-500' },
  scratch:    { label: 'Scratch',    className: 'bg-purple-700 text-purple-50 border border-purple-500' },
  custom:     { label: 'My Domain',  className: 'bg-slate-600 text-slate-200 border border-slate-500' },
};

interface Props {
  onDisconnect: () => void;
  onSettings: () => void;
}

export const MainPage = ({ onDisconnect, onSettings }: Props): JSX.Element => {
  const { profiles, activeProfileId, settings, tabs, activeTabId, setSoql } = useAppStore(
    useShallow(s => ({
      profiles: s.profiles,
      activeProfileId: s.activeProfileId,
      settings: s.settings,
      tabs: s.tabs,
      activeTabId: s.activeTabId,
      setSoql: s.setSoql,
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

  // 書き込み可モードは事故防止が最優先。ヘッダー帯ごと色を切り替えて視認性を上げる。
  // 通常: slate-800、書き込み可: orange-800（バッジの強調と合わせて二重防御）。
  const isWriteMode = activeProfile?.mode === 'readwrite';
  const headerBg = isWriteMode ? 'bg-orange-800' : 'bg-slate-800';
  const env = activeProfile ? detectEnvironment(activeProfile.loginUrl) : null;
  const envBadge = env ? ENV_BADGE[env] : null;
  const buttonHover = isWriteMode ? 'hover:bg-orange-700' : 'hover:bg-slate-700';

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* ヘッダー: アプリ名 / org 名 / 環境バッジ / モードバッジ / 設定・切断 */}
      <header className={`flex items-center gap-3 px-4 py-2 text-white flex-shrink-0 ${headerBg}`}>
        <span className="font-semibold text-sm">Salesforce Explorer</span>
        {activeProfile && (
          <>
            <span className="text-slate-400 text-xs">|</span>
            <span className="text-sm text-slate-100" title={activeProfile.loginUrl}>
              {activeProfile.name}
            </span>
            {envBadge && (
              <span
                className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${envBadge.className}`}
                title={`接続先: ${activeProfile.loginUrl}`}
              >
                {envBadge.label}
              </span>
            )}
            <span
              className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                isWriteMode
                  ? 'bg-orange-200 text-orange-900 border border-orange-300'
                  : 'bg-slate-600 text-slate-200 border border-slate-500'
              }`}
            >
              {isWriteMode ? '書き込み可' : '読み取り専用'}
            </span>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onSettings}
            className={`flex items-center gap-1 text-xs text-slate-100 hover:text-white px-2 py-1 rounded ${buttonHover}`}
          >
            <Settings size={13} /> 設定
          </button>
          <button
            type="button"
            onClick={handleDisconnect}
            className={`flex items-center gap-1 text-xs text-slate-100 hover:text-white px-2 py-1 rounded ${buttonHover}`}
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
              {bottomTab === 'result' && <ResultTable result={result} onSnippetClick={setSoql} />}
              {bottomTab === 'log' && <LogViewer />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
