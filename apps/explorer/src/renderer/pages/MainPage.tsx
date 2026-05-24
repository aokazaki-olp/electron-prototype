import { useState, useEffect, useRef, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle, type Layout } from 'react-resizable-panels';
import { Settings, LogOut } from 'lucide-react';
import { SObjectBrowser } from '../components/SObjectBrowser.js';
import { SoqlEditor } from '../components/SoqlEditor.js';
import { ResultTable } from '../components/ResultTable.js';
import { LogViewer } from '../components/LogViewer.js';
import { showToast } from '../components/Toast.js';
import { useAppStore } from '../store.js';
import type { AppSettings, PaneSizes } from '@app/ipc-contract';

const DEFAULT_PANE_SIZES: PaneSizes = { leftPanel: 18, soqlPanel: 40 };
const SAVE_DEBOUNCE_MS = 300;

/**
 * SOQL の最初の `FROM <sObject>` を取り出す。サブクエリ・関係参照は無視 (最初のヒットを採用)。
 * 大文字小文字混在を許容する。
 *
 * @param soql - 評価対象 SOQL
 * @returns sObject API 名。マッチしない場合は `undefined`
 */
const extractSObject = (soql: string): string | undefined => {
  const m = soql.match(/\bFROM\s+([A-Za-z0-9_]+)/i);
  return m?.[1];
};

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
  const { profiles, activeProfileId, settings, setSettings, tabs, activeTabId, setSoql } = useAppStore(
    useShallow(s => ({
      profiles: s.profiles,
      activeProfileId: s.activeProfileId,
      settings: s.settings,
      setSettings: s.setSettings,
      tabs: s.tabs,
      activeTabId: s.activeTabId,
      setSoql: s.setSoql,
    }))
  );
  const [bottomTab, setBottomTab] = useState<BottomTab>('result');
  const activeTab = tabs.find(t => t.id === activeTabId);
  const result = activeTab?.result ?? null;

  useEffect(() => {
    if (result) setBottomTab('result');
  }, [result]);

  // ペインサイズ: settings.paneSizes から初期値を取り、ドラッグ後 IPC で永続化する。
  // defaultSize は Panel のマウント時にだけ参照されるため、初回レンダ時点で settings が
  // null だと既定値で固定されてしまう。App.tsx で起動時に必ず先読みする前提。
  const initialPaneSizes = settings?.paneSizes ?? DEFAULT_PANE_SIZES;
  // ref で最新値を保持し、horizontal/vertical の片方が変わっても他方を保持できるようにする
  const paneSizesRef = useRef<PaneSizes>(initialPaneSizes);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsRef = useRef<AppSettings | null>(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  const schedulePersist = useCallback((next: PaneSizes) => {
    paneSizesRef.current = next;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const current = settingsRef.current;
      if (!current) return;
      const updated: AppSettings = { ...current, paneSizes: next };
      setSettings(updated);
      // 保存失敗は致命的でない (起動時に再ロードできる)。toast を出すほどでもないのでログのみ。
      void window.sfx.saveSettings(updated).catch(() => {
        window.sfx.rendererLog('warn', 'ペインサイズの保存に失敗しました');
      });
    }, SAVE_DEBOUNCE_MS);
  }, [setSettings]);

  // unmount 時に pending save を flush
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // react-resizable-panels v4 の onLayoutChanged は Panel id をキーとしたサイズマップを返す
  const handleHorizontalLayout = useCallback((layout: Layout) => {
    const leftPanel = layout['main-left'];
    if (typeof leftPanel !== 'number') return;
    schedulePersist({ ...paneSizesRef.current, leftPanel });
  }, [schedulePersist]);

  const handleVerticalLayout = useCallback((layout: Layout) => {
    const soqlPanel = layout['main-soql'];
    if (typeof soqlPanel !== 'number') return;
    schedulePersist({ ...paneSizesRef.current, soqlPanel });
  }, [schedulePersist]);

  const activeProfile = profiles.find(p => p.id === activeProfileId);

  const handleDisconnect = async () => {
    if (!activeProfileId) return;
    try {
      await window.sfx.disconnect(activeProfileId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      window.sfx.rendererLog('error', `disconnect 失敗: ${msg}`);
      showToast('error', `切断に失敗しました: ${msg}`);
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

      {/* メインコンテンツ: 左右 + 中央上下の 2 段 PanelGroup */}
      <PanelGroup
        orientation="horizontal"
        onLayoutChanged={handleHorizontalLayout}
        className="flex-1 overflow-hidden"
      >
        {/* 左ペイン: sObjectブラウザ */}
        <Panel
          id="main-left"
          defaultSize={initialPaneSizes.leftPanel}
          minSize={12}
          maxSize={40}
          className="overflow-hidden"
        >
          <SObjectBrowser />
        </Panel>

        <PanelResizeHandle
          className="w-1 bg-slate-200 hover:bg-blue-300 active:bg-blue-400 transition-colors"
          aria-label="左ペインの幅を調整"
        />

        {/* 右ペイン: SOQL エディタと結果/ログ */}
        <Panel id="main-right" className="overflow-hidden">
          <PanelGroup
            orientation="vertical"
            onLayoutChanged={handleVerticalLayout}
            className="h-full"
          >
            {/* SOQLエディタ */}
            <Panel
              id="main-soql"
              defaultSize={initialPaneSizes.soqlPanel}
              minSize={15}
              maxSize={85}
              className="overflow-hidden"
            >
              <SoqlEditor settings={settings} />
            </Panel>

            <PanelResizeHandle
              className="h-1 bg-slate-200 hover:bg-blue-300 active:bg-blue-400 transition-colors"
              aria-label="エディタと結果の高さを調整"
            />

            {/* 下部タブ */}
            <Panel id="main-bottom" className="overflow-hidden">
              <div className="flex flex-col h-full">
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
                  {bottomTab === 'result' && (
                    <ResultTable
                      result={result}
                      sObjectName={activeTab ? extractSObject(activeTab.soql) : undefined}
                      onSnippetClick={setSoql}
                    />
                  )}
                  {bottomTab === 'log' && <LogViewer />}
                </div>
              </div>
            </Panel>
          </PanelGroup>
        </Panel>
      </PanelGroup>
    </div>
  );
};
