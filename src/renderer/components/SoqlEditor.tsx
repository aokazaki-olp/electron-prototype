import { useState, useEffect, useCallback } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { Play, AlertCircle } from 'lucide-react';
import { useAppStore } from '../store.js';
import type { QueryResult } from '../../ipc/contract.js';

interface Props {
  onResult: (result: QueryResult) => void;
  settings: { defaultMaxRows: number } | null;
}

export const SoqlEditor = ({ onResult, settings }: Props): JSX.Element => {
  const { soql, setSoql, queryLoading, setQueryLoading, runTrigger } = useAppStore();
  const [fetchAll, setFetchAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maxRows = fetchAll ? 0 : (settings?.defaultMaxRows ?? 2000);

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
      {/* エディタ */}
      <div className="flex-1 overflow-hidden" onKeyDown={handleKeyDown}>
        <CodeMirror
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
