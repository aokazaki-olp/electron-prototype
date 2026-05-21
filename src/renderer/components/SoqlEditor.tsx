import { useState, useEffect, useCallback } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { Play, AlertCircle, Plus, X } from 'lucide-react';
import { useAppStore } from '../store.js';
import type { QueryResult } from '../../ipc/contract.js';

const STORAGE_KEY = 'sfx-soql-tabs';

interface Props {
  onResult: (result: QueryResult) => void;
  settings: { defaultMaxRows: number } | null;
}

export const SoqlEditor = ({ onResult, settings }: Props): JSX.Element => {
  const {
    tabs, activeTabId, queryLoading, setQueryLoading,
    setSoql, addTab, closeTab, setActiveTabId, loadTabs, runTrigger,
  } = useAppStore();
  const [fetchAll, setFetchAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeTab = tabs.find(t => t.id === activeTabId);
  const soql = activeTab?.soql ?? '';
  const maxRows = fetchAll ? 0 : (settings?.defaultMaxRows ?? 2000);

  // 起動時にlocalStorageから復元
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const { tabs: saved, activeTabId: savedId } = JSON.parse(raw) as { tabs: typeof tabs; activeTabId: string };
        if (Array.isArray(saved) && saved.length > 0) {
          loadTabs(saved, savedId ?? saved[0].id);
        }
      }
    } catch { /* 無視 */ }
  }, []);

  // タブ変更時に自動保存
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs, activeTabId }));
  }, [tabs, activeTabId]);

  const runQuery = useCallback(async () => {
    const trimmed = soql.trim();
    if (!trimmed) return;

    setError(null);
    setQueryLoading(true);
    try {
      const result = await window.sfx.query(trimmed, maxRows);
      onResult(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setQueryLoading(false);
    }
  }, [soql, maxRows, onResult, setQueryLoading]);

  useEffect(() => {
    if (runTrigger > 0) {
      runQuery();
    }
  }, [runTrigger]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runQuery();
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
            <span className="max-w-32 truncate">{tab.name}</span>
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
          extensions={[sql()]}
          height="100%"
          theme="light"
          basicSetup={{ lineNumbers: true, foldGutter: false }}
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

        <label className="flex items-center gap-1 text-xs text-slate-600 ml-auto cursor-pointer">
          <input
            type="checkbox"
            checked={fetchAll}
            onChange={e => setFetchAll(e.target.checked)}
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
