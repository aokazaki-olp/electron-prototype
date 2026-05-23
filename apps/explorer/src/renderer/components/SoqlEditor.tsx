import { memo, useState, useEffect, useCallback, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import CodeMirror from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { Play, AlertCircle, Plus, X, Save, FolderOpen } from 'lucide-react';
import { useAppStore } from '../store.js';
import type { SoqlTab } from '../store.js';

const STORAGE_KEY = 'sfx-soql-tabs';

// モジュールスコープで固定: レンダーのたびに新しいオブジェクトが生まれると
// @uiw/react-codemirror が StateEffect.reconfigure を毎回実行してしまいフリーズする
const CM_EXTENSIONS = [sql()];
const CM_BASIC_SETUP = { lineNumbers: true, foldGutter: false } as const;

interface Props {
  settings: { defaultMaxRows: number } | null;
}

const SoqlEditorInner = ({ settings }: Props): JSX.Element => {
  const {
    tabs, activeTabId, queryLoading, setQueryLoading,
    setSoql, setTabFetchAll, setTabResult, addTab, addTabWithContent, closeTab,
    setActiveTabId, renameTab, loadTabs, runTrigger,
  } = useAppStore(
    useShallow(s => ({
      tabs: s.tabs,
      activeTabId: s.activeTabId,
      queryLoading: s.queryLoading,
      setQueryLoading: s.setQueryLoading,
      setSoql: s.setSoql,
      setTabFetchAll: s.setTabFetchAll,
      setTabResult: s.setTabResult,
      addTab: s.addTab,
      addTabWithContent: s.addTabWithContent,
      closeTab: s.closeTab,
      setActiveTabId: s.setActiveTabId,
      renameTab: s.renameTab,
      loadTabs: s.loadTabs,
      runTrigger: s.runTrigger,
    }))
  );
  const [error, setError] = useState<string | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  const activeTab = tabs.find(t => t.id === activeTabId);
  const soql = activeTab?.soql ?? '';
  const fetchAll = activeTab?.fetchAll ?? false;
  const maxRows = fetchAll ? 0 : (settings?.defaultMaxRows ?? 2000);

  // 起動時にlocalStorageから復元（activeTabId の存在確認 + fetchAll デフォルト補完）
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { tabs: unknown[]; activeTabId: string };
      if (!Array.isArray(parsed.tabs) || parsed.tabs.length === 0) return;
      const restored: SoqlTab[] = parsed.tabs
        .filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null)
        .map(t => ({
          id: typeof t['id'] === 'string' ? t['id'] : `tab-${Date.now()}`,
          name: typeof t['name'] === 'string' ? t['name'] : 'クエリ',
          soql: typeof t['soql'] === 'string' ? t['soql'] : '',
          result: null,
          fetchAll: typeof t['fetchAll'] === 'boolean' ? t['fetchAll'] : false,
        }));
      const validId = restored.find(t => t.id === parsed.activeTabId)?.id ?? restored[0].id;
      loadTabs(restored, validId);
    } catch { /* 無視 */ }
  }, []);

  // タブ変更時に自動保存（result は除外、fetchAll は保存対象）
  useEffect(() => {
    const toSave = tabs.map(({ id, name, soql, fetchAll }) => ({ id, name, soql, fetchAll, result: null }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs: toSave, activeTabId }));
  }, [tabs, activeTabId]);

  const runQuery = useCallback(async () => {
    const trimmed = soql.trim();
    if (!trimmed) return;
    setError(null);
    setQueryLoading(true);
    try {
      const result = await window.sfx.query(trimmed, maxRows);
      setTabResult(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      window.sfx.rendererLog('error', `runQuery失敗: ${msg}`);
      setError(msg);
    } finally {
      setQueryLoading(false);
    }
  }, [soql, maxRows, setQueryLoading, setTabResult]);

  // runQuery の最新版を ref で保持し、useEffect の依存を runTrigger のみに絞る。
  // これにより soql 変更時に useEffect が誤発火してクエリが繰り返し実行されるのを防ぐ。
  // lastRunTriggerRef で同一 trigger 値による二重実行（StrictMode の effect 二回呼び出し）を防ぐ。
  const runQueryRef = useRef(runQuery);
  useEffect(() => {
    runQueryRef.current = runQuery;
  });

  const lastRunTriggerRef = useRef(0);
  useEffect(() => {
    if (runTrigger <= 0 || runTrigger === lastRunTriggerRef.current) return;
    lastRunTriggerRef.current = runTrigger;
    runQueryRef.current();
  }, [runTrigger]);

  const handleSaveFile = async () => {
    if (!soql.trim()) return;
    try {
      await window.sfx.saveSoqlFile(soql, activeTab?.name ?? 'クエリ');
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenFile = async () => {
    try {
      const file = await window.sfx.openSoqlFile();
      if (file) {
        addTabWithContent(file.name, file.soql);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const startRename = (tab: { id: string; name: string }) => {
    setEditingTabId(tab.id);
    setEditingName(tab.name);
    setTimeout(() => renameInputRef.current?.select(), 0);
  };

  const commitRename = () => {
    if (editingTabId && editingName.trim()) {
      renameTab(editingTabId, editingName.trim());
    }
    setEditingTabId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
    <div className="flex flex-col h-full border-b border-slate-200">
      {/* タブバー */}
      <div className="flex items-center border-b border-slate-200 bg-slate-100 overflow-x-auto flex-shrink-0">
        {tabs.map(tab => (
          <div
            key={tab.id}
            onClick={() => setActiveTabId(tab.id)}
            className={`group flex items-center gap-1 px-3 py-1.5 text-xs whitespace-nowrap cursor-pointer border-r border-slate-200 select-none ${
              tab.id === activeTabId
                ? 'bg-white text-slate-800 border-b-2 border-b-blue-500'
                : 'text-slate-500 hover:bg-slate-200'
            }`}
          >
            {editingTabId === tab.id ? (
              <input
                ref={renameInputRef}
                value={editingName}
                onChange={e => setEditingName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setEditingTabId(null);
                  e.stopPropagation();
                }}
                onClick={e => e.stopPropagation()}
                className="w-24 px-1 border border-blue-400 rounded outline-none text-xs"
              />
            ) : (
              <span
                className="max-w-32 truncate"
                onDoubleClick={e => { e.stopPropagation(); startRename(tab); }}
              >
                {tab.name}
              </span>
            )}
            {tabs.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                className="opacity-0 group-hover:opacity-100 hover:text-red-500 ml-0.5"
              >
                <X size={10} />
              </button>
            )}
          </div>
        ))}
        <button
          onClick={addTab}
          className="px-2 py-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 flex-shrink-0"
          title="新しいタブ"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* エディタ */}
      <div className="flex-1 overflow-hidden" onKeyDown={handleKeyDown}>
        <CodeMirror
          key={activeTabId}
          value={soql}
          onChange={setSoql}
          extensions={CM_EXTENSIONS}
          height="100%"
          theme="light"
          basicSetup={CM_BASIC_SETUP}
          className="h-full text-sm"
        />
      </div>

      {/* ツールバー */}
      <div className="flex items-center gap-3 px-3 py-1.5 bg-slate-50 border-t border-slate-200 flex-shrink-0">
        <button
          onClick={runQuery}
          disabled={queryLoading || !soql.trim()}
          className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
        >
          <Play size={13} />
          {queryLoading ? '実行中...' : '実行'}
        </button>
        <span className="text-xs text-slate-400">Ctrl+Enter</span>
        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={handleOpenFile}
            className="flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:bg-slate-200 rounded"
            title="ファイルを開く"
          >
            <FolderOpen size={13} /> 開く
          </button>
          <button
            onClick={handleSaveFile}
            disabled={!soql.trim()}
            className="flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:bg-slate-200 rounded disabled:opacity-40"
            title="名前を付けて保存 (Ctrl+S)"
          >
            <Save size={13} /> 保存
          </button>
        </div>

        <label className="flex items-center gap-1 text-xs text-slate-600 ml-auto cursor-pointer">
          <input
            type="checkbox"
            checked={fetchAll}
            onChange={e => setTabFetchAll(e.target.checked)}
            className="accent-blue-500"
          />
          件数制限を無効にして全件取得
          {fetchAll && <span className="text-yellow-600 font-medium">（大量データに注意）</span>}
        </label>

        <span className="text-xs text-slate-400">
          上限: {fetchAll ? '無制限' : `${maxRows.toLocaleString()}件`}
        </span>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="flex items-start gap-2 px-3 py-2 bg-red-50 border-t border-red-200 text-sm text-red-700">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

export const SoqlEditor = memo(SoqlEditorInner);
