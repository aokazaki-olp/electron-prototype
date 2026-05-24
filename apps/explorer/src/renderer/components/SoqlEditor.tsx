import { memo, useState, useEffect, useCallback, useRef } from 'react';
import type { ExecutionMode } from '@app/ipc-contract';
import { useShallow } from 'zustand/react/shallow';
import CodeMirror from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { autocompletion } from '@codemirror/autocomplete';
import { Play, AlertCircle, Plus, X, Save, FolderOpen } from 'lucide-react';
import { useAppStore } from '../store.js';
import { soqlCompletionSource } from './soqlCompletion.js';

// モジュールスコープで固定: レンダーのたびに新しいオブジェクトが生まれると
// @uiw/react-codemirror が StateEffect.reconfigure を毎回実行してしまいフリーズする
const CM_EXTENSIONS = [
  sql(),
  autocompletion({
    override: [soqlCompletionSource],
    // SF オブジェクト名・フィールド名は大文字小文字混在のため insensitive にしておく
    activateOnTyping: true,
  }),
];
const CM_BASIC_SETUP = { lineNumbers: true, foldGutter: false } as const;

interface Props {
  settings: { defaultMaxRows: number } | null;
}

const SoqlEditorInner = ({ settings }: Props): JSX.Element => {
  const {
    tabs, activeTabId, queryLoading, setQueryLoading,
    setSoql, setTabFetchAll, setTabExecutionMode, setTabResult, addTab, addTabWithContent, closeTab,
    setActiveTabId, renameTab, runTrigger, isDark,
  } = useAppStore(
    useShallow(s => ({
      tabs: s.tabs,
      activeTabId: s.activeTabId,
      queryLoading: s.queryLoading,
      setQueryLoading: s.setQueryLoading,
      setSoql: s.setSoql,
      setTabFetchAll: s.setTabFetchAll,
      setTabExecutionMode: s.setTabExecutionMode,
      setTabResult: s.setTabResult,
      addTab: s.addTab,
      addTabWithContent: s.addTabWithContent,
      closeTab: s.closeTab,
      setActiveTabId: s.setActiveTabId,
      renameTab: s.renameTab,
      runTrigger: s.runTrigger,
      isDark: s.isDark,
    }))
  );
  const [error, setError] = useState<string | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  const activeTab = tabs.find(t => t.id === activeTabId);
  const soql = activeTab?.soql ?? '';
  const fetchAll = activeTab?.fetchAll ?? false;
  // 実行方式 (rest / bulk) はタブごとに永続化する。store の SoqlTab を真ソースとし、
  // App.tsx の saveTabs (debounce 400ms) で main プロセスに永続化される。
  const executionMode: ExecutionMode = activeTab?.executionMode ?? 'rest';
  const maxRows = fetchAll ? 0 : (settings?.defaultMaxRows ?? 2000);

  const runQuery = useCallback(async () => {
    const trimmed = soql.trim();
    if (!trimmed) {
      return;
    }
    setError(null);
    setQueryLoading(true);
    try {
      // Bulk は常に全件取得（maxRows は無視）
      const result = executionMode === 'bulk'
        ? await window.sfx.bulkQuery(trimmed)
        : await window.sfx.query(trimmed, maxRows);
      setTabResult(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      window.sfx.rendererLog('error', `runQuery失敗: ${msg}`);
      setError(msg);
    } finally {
      setQueryLoading(false);
    }
  }, [soql, maxRows, executionMode, setQueryLoading, setTabResult]);

  // runQuery の最新版を ref で保持し、useEffect の依存を runTrigger のみに絞る。
  // これにより soql 変更時に useEffect が誤発火してクエリが繰り返し実行されるのを防ぐ。
  // lastRunTriggerRef で同一 trigger 値による二重実行（StrictMode の effect 二回呼び出し）を防ぐ。
  const runQueryRef = useRef(runQuery);
  useEffect(() => {
    runQueryRef.current = runQuery;
  });

  const lastRunTriggerRef = useRef(0);
  useEffect(() => {
    if (runTrigger <= 0 || runTrigger === lastRunTriggerRef.current) {
      return;
    }
    lastRunTriggerRef.current = runTrigger;
    runQueryRef.current();
  }, [runTrigger]);

  const handleSaveFile = async () => {
    if (!soql.trim()) return;
    try {
      await window.sfx.saveSoqlFile(soql, activeTab?.name ?? 'クエリ');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      window.sfx.rendererLog('error', `SOQL保存失敗: ${msg}`);
      setError(`保存に失敗しました: ${msg}`);
    }
  };

  const handleOpenFile = async () => {
    try {
      const file = await window.sfx.openSoqlFile();
      if (file) {
        addTabWithContent(file.name, file.soql);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      window.sfx.rendererLog('error', `SOQL読み込み失敗: ${msg}`);
      setError(`ファイルを開けませんでした: ${msg}`);
    }
  };

  const startRename = (tab: { id: string; name: string }) => {
    setEditingTabId(tab.id);
    setEditingName(tab.name);
  };

  // useLayoutEffect: 編集モード開始時にフォーカス + 全選択。setTimeout より同期的で確実。
  useEffect(() => {
    if (editingTabId != null) {
      renameInputRef.current?.select();
    }
  }, [editingTabId]);

  const commitRename = () => {
    if (editingTabId && editingName.trim()) {
      renameTab(editingTabId, editingName.trim());
    }
    setEditingTabId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 日本語 IME composition 中の Enter で SOQL 実行が暴発するのを防ぐ
    if (e.nativeEvent.isComposing) {
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runQuery();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSaveFile();
    }
  };

  return (
    <div className="flex flex-col h-full border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
      {/* タブバー */}
      <div className="flex items-center border-b border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 overflow-x-auto flex-shrink-0" role="tablist">
        {tabs.map(tab => (
          <div
            key={tab.id}
            onClick={() => setActiveTabId(tab.id)}
            onDoubleClick={e => {
              e.stopPropagation();
              startRename(tab);
            }}
            role="tab"
            aria-label={tab.name}
            aria-selected={tab.id === activeTabId}
            className={`group flex items-center gap-1 px-3 py-1.5 text-xs whitespace-nowrap cursor-pointer border-r border-slate-200 dark:border-slate-700 select-none ${
              tab.id === activeTabId
                ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border-b-2 border-b-blue-500'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {editingTabId === tab.id ? (
              <input
                ref={renameInputRef}
                value={editingName}
                onChange={e => setEditingName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={e => {
                  if (e.nativeEvent.isComposing) {
                    return;
                  }
                  if (e.key === 'Enter') {
                    commitRename();
                  }
                  if (e.key === 'Escape') {
                    setEditingTabId(null);
                  }
                  e.stopPropagation();
                }}
                onClick={e => e.stopPropagation()}
                aria-label="タブ名を編集"
                className="w-24 px-1 border border-blue-400 rounded outline-none text-xs"
              />
            ) : (
              <span className="max-w-32 truncate">
                {tab.name}
              </span>
            )}
            {tabs.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                aria-label={`${tab.name} を閉じる`}
                className="opacity-0 group-hover:opacity-100 hover:text-red-500 ml-0.5"
              >
                <X size={10} />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addTab}
          className="px-2 py-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 flex-shrink-0"
          title="新しいタブ"
          aria-label="新しいタブを追加"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* エディタ */}
      {/* key を外して unmount/remount を抑止し、CodeMirror インスタンスを再利用する */}
      <div className="flex-1 overflow-hidden" onKeyDown={handleKeyDown}>
        <CodeMirror
          value={soql}
          onChange={setSoql}
          extensions={CM_EXTENSIONS}
          height="100%"
          theme={isDark ? 'dark' : 'light'}
          basicSetup={CM_BASIC_SETUP}
          className="h-full text-sm"
        />
      </div>

      {/* ツールバー */}
      <div className="flex items-center gap-3 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
        <button
          type="button"
          onClick={runQuery}
          disabled={queryLoading || !soql.trim()}
          className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
        >
          <Play size={13} />
          {queryLoading
            ? (executionMode === 'bulk' ? 'Bulk実行中...' : '実行中...')
            : '実行'}
        </button>
        <span className="text-xs text-slate-400 dark:text-slate-500">Ctrl+Enter</span>

        {/* 実行方式 (REST / Bulk) */}
        <div
          role="radiogroup"
          aria-label="実行方式"
          className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 ml-1 border-l border-slate-300 dark:border-slate-600 pl-3"
        >
          <span>方式:</span>
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="radio"
              name="exec-mode"
              value="rest"
              checked={executionMode === 'rest'}
              onChange={() => setTabExecutionMode('rest')}
              className="accent-blue-500"
            />
            REST
          </label>
          <label className="flex items-center gap-1 cursor-pointer" title="Bulk API v2 経由で全件取得。大量件数向け。処理開始まで数十秒〜数分の overhead あり。">
            <input
              type="radio"
              name="exec-mode"
              value="bulk"
              checked={executionMode === 'bulk'}
              onChange={() => setTabExecutionMode('bulk')}
              className="accent-blue-500"
            />
            Bulk
          </label>
        </div>

        <div className="flex items-center gap-1 ml-2">
          <button
            type="button"
            onClick={handleOpenFile}
            className="flex items-center gap-1 px-2 py-1 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
            title="ファイルを開く"
          >
            <FolderOpen size={13} /> 開く
          </button>
          <button
            type="button"
            onClick={handleSaveFile}
            disabled={!soql.trim()}
            className="flex items-center gap-1 px-2 py-1 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded disabled:opacity-40"
            title="名前を付けて保存 (Ctrl+S)"
          >
            <Save size={13} /> 保存
          </button>
        </div>

        <label
          className={`flex items-center gap-1 text-xs ml-auto ${
            executionMode === 'bulk' ? 'text-slate-400 dark:text-slate-500 cursor-not-allowed' : 'text-slate-600 dark:text-slate-300 cursor-pointer'
          }`}
          title={executionMode === 'bulk' ? 'Bulk は常に全件取得するため件数制限は無効です' : undefined}
        >
          <input
            type="checkbox"
            checked={fetchAll}
            onChange={e => setTabFetchAll(e.target.checked)}
            disabled={executionMode === 'bulk'}
            className="accent-blue-500"
          />
          件数制限を無効にして全件取得
          {fetchAll && executionMode !== 'bulk' && <span className="text-yellow-600 dark:text-yellow-400 font-medium">（大量データに注意）</span>}
        </label>

        <span className="text-xs text-slate-400 dark:text-slate-500">
          上限: {executionMode === 'bulk' ? '全件 (Bulk)' : fetchAll ? '無制限' : `${maxRows.toLocaleString()}件`}
        </span>
      </div>

      {/* エラー表示 */}
      {error && (
        <div role="alert" className="flex items-start gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/30 border-t border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

export const SoqlEditor = memo(SoqlEditorInner);
