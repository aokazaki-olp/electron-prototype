import { useState, useEffect, useRef, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle, type Layout } from 'react-resizable-panels';
import { SObjectBrowser } from '../components/SObjectBrowser.js';
import { SoqlEditor } from '../components/SoqlEditor.js';
import { ResultTable } from '../components/ResultTable.js';
import { LogViewer } from '../components/LogViewer.js';
import { Header } from '../components/Header.js';
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
    if (result) {
      setBottomTab('result');
    }
  }, [result]);

  // ペインサイズ: settings.paneSizes から初期値を取り、ドラッグ後 IPC で永続化する。
  // defaultSize は Panel のマウント時にだけ参照されるため、初回レンダ時点で settings が
  // null だと既定値で固定されてしまう。App.tsx で起動時に必ず先読みする前提。
  const initialPaneSizes = settings?.paneSizes ?? DEFAULT_PANE_SIZES;
  // ref で最新値を保持し、horizontal/vertical の片方が変わっても他方を保持できるようにする
  const paneSizesRef = useRef<PaneSizes>(initialPaneSizes);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsRef = useRef<AppSettings | null>(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const schedulePersist = useCallback((next: PaneSizes) => {
    paneSizesRef.current = next;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      const current = settingsRef.current;
      if (!current) {
        return;
      }
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
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  // react-resizable-panels v4 の onLayoutChanged は Panel id をキーとしたサイズマップを返す
  const handleHorizontalLayout = useCallback((layout: Layout) => {
    const leftPanel = layout['main-left'];
    if (typeof leftPanel !== 'number') {
      return;
    }
    schedulePersist({ ...paneSizesRef.current, leftPanel });
  }, [schedulePersist]);

  const handleVerticalLayout = useCallback((layout: Layout) => {
    const soqlPanel = layout['main-soql'];
    if (typeof soqlPanel !== 'number') {
      return;
    }
    schedulePersist({ ...paneSizesRef.current, soqlPanel });
  }, [schedulePersist]);

  const activeProfile = profiles.find(p => p.id === activeProfileId);

  const handleDisconnect = async () => {
    if (!activeProfileId) {
      return;
    }
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

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-slate-900">
      <Header
        activeProfile={activeProfile}
        onSettings={onSettings}
        onDisconnect={handleDisconnect}
      />

      {/* メインコンテンツ: 左右 + 中央上下の 2 段 PanelGroup */}
      <PanelGroup
        orientation="horizontal"
        onLayoutChanged={handleHorizontalLayout}
        className="flex-1 overflow-hidden"
      >
        {/* 左ペイン: sObjectブラウザ */}
        <Panel
          id="main-left"
          defaultSize={`${initialPaneSizes.leftPanel}%`}
          minSize="8%"
          maxSize="60%"
          className="overflow-hidden"
        >
          <SObjectBrowser />
        </Panel>

        <PanelResizeHandle
          className="w-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-blue-400 dark:hover:bg-blue-500 active:bg-blue-500 transition-colors"
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
              defaultSize={`${initialPaneSizes.soqlPanel}%`}
              minSize="10%"
              maxSize="90%"
              className="overflow-hidden"
            >
              <SoqlEditor settings={settings} />
            </Panel>

            <PanelResizeHandle
              className="h-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-blue-400 dark:hover:bg-blue-500 active:bg-blue-500 transition-colors"
              aria-label="エディタと結果の高さを調整"
            />

            {/* 下部タブ */}
            <Panel id="main-bottom" className="overflow-hidden">
              <div className="flex flex-col h-full">
                {/* タブバー */}
                <div role="tablist" className="flex items-center border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex-shrink-0">
                  {BOTTOM_TABS.map(key => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={bottomTab === key}
                      onClick={() => setBottomTab(key)}
                      className={`px-4 py-1.5 text-xs font-medium border-b-2 ${
                        bottomTab === key
                          ? 'border-blue-600 text-blue-500 dark:text-blue-400'
                          : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
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
