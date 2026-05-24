import { memo, useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type ColumnSizingState,
  type SortingState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { showToast } from './Toast.js';
import { useAppStore } from '../store.js';
import type { QueryResult, CsvExportOptions } from '@app/ipc-contract';

interface Props {
  result: QueryResult | null;
  /**
   * 列幅永続化の名前空間に使う sObject 名 (例: `'Account'`)。
   * `undefined` の場合は永続化しない (空のクエリ・サブクエリ等のフォールバック)。
   */
  sObjectName?: string;
  /**
   * 空状態に表示するスニペットをユーザーがクリックしたとき呼ばれる。
   * `undefined` の場合はスニペット自体を表示しない（テストや組み込み用途）。
   */
  onSnippetClick?: (soql: string) => void;
}

// 空状態のサンプル SOQL。Salesforce 新規ユーザーが「まず1個動かしてみる」体験を作るための導線。
// 標準オブジェクト中心に選び、どの org でも動く前提で組む。
const EMPTY_STATE_SNIPPETS: ReadonlyArray<{ label: string; soql: string }> = [
  { label: 'Account を 10 件', soql: 'SELECT Id, Name FROM Account LIMIT 10' },
  { label: '今日作成された Lead の件数', soql: 'SELECT COUNT(Id) FROM Lead WHERE CreatedDate = TODAY' },
  { label: 'オープン中の Opportunity', soql: 'SELECT Id, Name, Owner.Name, Amount, CloseDate FROM Opportunity WHERE IsClosed = false LIMIT 50' },
  { label: '有効な User', soql: 'SELECT Id, Name, Email FROM User WHERE IsActive = true LIMIT 10' },
];

const ATTRIBUTES_KEY = 'attributes';

const getColumns = (records: Record<string, unknown>[]): string[] => {
  if (records.length === 0) return [];
  const keys = new Set<string>();
  for (const record of records.slice(0, 10)) {
    for (const key of Object.keys(record)) {
      if (key !== ATTRIBUTES_KEY) {
        keys.add(key);
      }
    }
  }
  return Array.from(keys);
};

interface ExportDialogState {
  open: boolean;
  bom: boolean;
  lineEnding: 'CRLF' | 'LF';
}

/**
 * 読み込み中に既存テーブルを覆う skeleton。
 * Bulk 実行など数十秒の待ち時間に「動いている」ことを示すため、行・セル幅をランダム風に変えて表現する。
 */
const SkeletonTable = ({ colCount }: { colCount: number }): JSX.Element => {
  const rowCount = 6;
  return (
    <table
      className="text-xs border-collapse w-full"
      aria-label="読み込み中"
      data-testid="result-skeleton"
    >
      <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 z-10">
        <tr>
          {Array.from({ length: colCount }).map((_, i) => (
            <th
              key={i}
              className="px-2 py-1.5 text-left border-b border-r border-slate-200 dark:border-slate-700"
            >
              <div className="h-3 w-20 bg-slate-300/70 dark:bg-slate-600/70 rounded animate-pulse" />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rowCount }).map((_, r) => (
          <tr
            key={r}
            className={r % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-800/50'}
          >
            {Array.from({ length: colCount }).map((_, c) => (
              <td key={c} className="px-2 py-1.5 border-b border-r border-slate-100 dark:border-slate-800">
                <div
                  className="h-2.5 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"
                  style={{ width: `${50 + ((r + c) * 13) % 40}%` }}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const DEFAULT_COLUMN_SIZE = 150;
const COLUMN_SIZE_DEBOUNCE_MS = 500;

// useReactTable の options に渡す関数・オブジェクトは module スコープで固定する。
// 毎 render で新規参照を渡すと TanStack Table 内部の memoization が外れ、
// 行モデル全体を毎回 rebuild してしまい体感フリーズになる。
const DEFAULT_COLUMN_OPTIONS = { minSize: 50, size: DEFAULT_COLUMN_SIZE, maxSize: 800 } as const;
const CORE_ROW_MODEL = getCoreRowModel<Record<string, unknown>>();
const SORTED_ROW_MODEL = getSortedRowModel<Record<string, unknown>>();
const FILTERED_ROW_MODEL = getFilteredRowModel<Record<string, unknown>>();

const ResultTableInner = ({ result, sObjectName, onSnippetClick }: Props): JSX.Element => {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilterInput, setGlobalFilterInput] = useState('');
  const [globalFilter, setGlobalFilter] = useState('');
  const queryLoading = useAppStore(s => s.queryLoading);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [exportDialog, setExportDialog] = useState<ExportDialogState>({
    open: false,
    bom: true,
    lineEnding: 'CRLF',
  });
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // sObjectName 切替時に該当オブジェクトの保存済み列幅を呼び出して反映する。
  // 取得失敗時は黙って空 (=デフォルト幅) にフォールバック。
  useEffect(() => {
    if (!sObjectName) {
      setColumnSizing({});
      return;
    }
    let cancelled = false;
    void window.sfx.loadColumnSizes().then(all => {
      if (cancelled) return;
      setColumnSizing(all[sObjectName] ?? {});
    }).catch(() => { /* 起動直後の race 等は無視 */ });
    return () => { cancelled = true; };
  }, [sObjectName]);

  // 列幅変更を sObject 別に永続化 (500ms debounce)
  const handleColumnSizingChange = useCallback((updater: ColumnSizingState | ((prev: ColumnSizingState) => ColumnSizingState)) => {
    setColumnSizing(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (!sObjectName) return next;
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => {
        void window.sfx.loadColumnSizes().then(all => {
          const merged = { ...all, [sObjectName]: next };
          void window.sfx.saveColumnSizes(merged).catch(() => {
            window.sfx.rendererLog('warn', '列幅の保存に失敗しました');
          });
        }).catch(() => { /* 取得失敗は黙って諦める */ });
      }, COLUMN_SIZE_DEBOUNCE_MS);
      return next;
    });
  }, [sObjectName]);

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, []);

  // 実行中の経過秒数。Bulk は数十秒〜数分かかるので「動いている」感を出す。
  useEffect(() => {
    if (!queryLoading) {
      setElapsedSec(0);
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [queryLoading]);

  // 200ms debounce: 大規模クエリ結果でキーストロークごとに全行走査するのを防ぐ
  useEffect(() => {
    const timer = setTimeout(() => setGlobalFilter(globalFilterInput), 200);
    return () => clearTimeout(timer);
  }, [globalFilterInput]);

  // result から派生する値はすべて useMemo で一元化（getColumns の重複呼び出しを排除）
  const cols = useMemo(() => (result ? getColumns(result.records) : []), [result]);

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() =>
    cols.map(col => ({
      accessorKey: col,
      header: col,
      cell: ({ getValue }) => {
        const v = getValue();
        if (v === null || v === undefined) return <span className="text-slate-300">null</span>;
        if (typeof v === 'object') return <span className="text-slate-500">[object]</span>;
        return String(v);
      },
    })), [cols]);

  // data も useMemo で安定化。result が同一でも records が同一参照になるとは限らないため。
  const tableData = useMemo(() => result?.records ?? [], [result]);

  const table = useReactTable({
    data: tableData,
    columns,
    state: { sorting, globalFilter, columnSizing },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnSizingChange: handleColumnSizingChange,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    defaultColumn: DEFAULT_COLUMN_OPTIONS,
    getCoreRowModel: CORE_ROW_MODEL,
    getSortedRowModel: SORTED_ROW_MODEL,
    getFilteredRowModel: FILTERED_ROW_MODEL,
  });

  const rows = table.getRowModel().rows;
  const getScrollElement = useCallback(() => scrollRef.current, []);
  const estimateSize = useCallback(() => 28, []);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement,
    estimateSize,
    overscan: 20,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const paddingTop = virtualItems[0]?.start ?? 0;
  const lastItem = virtualItems[virtualItems.length - 1];
  const paddingBottom = lastItem != null
    ? virtualizer.getTotalSize() - lastItem.end
    : 0;

  const exportCsvWithOptions = async (options: CsvExportOptions) => {
    if (!result) return;
    try {
      await window.sfx.exportCsv(result.records, cols, options);
      setExportDialog(d => ({ ...d, open: false }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      window.sfx.rendererLog('error', `CSV エクスポート失敗: ${msg}`);
      showToast('error', `CSV 保存に失敗しました: ${msg}`);
    }
  };

  // ドロップダウンから直接呼ぶワンショット CSV (既定 = BOM + CRLF: Excel との互換を優先)
  const handleQuickCsv = async () => {
    setExportMenuOpen(false);
    await exportCsvWithOptions({ bom: true, lineEnding: 'CRLF' });
  };

  // 詳細ダイアログ経由 (BOM / 改行コード を選んでから保存)
  const handleExportCsv = () => exportCsvWithOptions({
    bom: exportDialog.bom,
    lineEnding: exportDialog.lineEnding,
  });

  const openCsvDetailDialog = () => {
    setExportMenuOpen(false);
    setExportDialog(d => ({ ...d, open: true }));
  };

  const handleExportExcel = async () => {
    setExportMenuOpen(false);
    if (!result) return;
    try {
      await window.sfx.exportQueryExcel(result.records, cols);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      window.sfx.rendererLog('error', `Excel エクスポート失敗: ${msg}`);
      showToast('error', `Excel 保存に失敗しました: ${msg}`);
    }
  };

  // ドロップダウン: 外側クリック / Esc で閉じる
  useEffect(() => {
    if (!exportMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!exportMenuRef.current?.contains(e.target as Node)) setExportMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [exportMenuOpen]);

  // モーダル: Esc クローズ
  useEffect(() => {
    if (!exportDialog.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportDialog(d => ({ ...d, open: false }));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [exportDialog.open]);

  // 結果がまだ無く実行中でもない: 空状態 (スニペット) を表示
  if (!result && !queryLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500 text-sm gap-3 px-6 py-8 bg-white dark:bg-slate-900">
        <p>SOQLを実行すると結果が表示されます</p>
        {onSnippetClick && (
          <div className="flex flex-col gap-1.5 max-w-2xl w-full">
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 mb-1">まず試してみる:</p>
            {EMPTY_STATE_SNIPPETS.map(s => (
              <button
                key={s.soql}
                type="button"
                onClick={() => onSnippetClick(s.soql)}
                className="text-left px-3 py-2 bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 border border-slate-200 dark:border-slate-700 hover:border-blue-300 rounded transition-colors"
                title={`エディタにセット: ${s.soql}`}
              >
                <span className="block text-xs text-slate-600 dark:text-slate-300 mb-0.5">{s.label}</span>
                <span className="block text-xs font-mono text-slate-700 dark:text-slate-200 truncate">{s.soql}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900">
      {/* ツールバー */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
        <span className="text-xs text-slate-600 dark:text-slate-300">
          {result ? (
            <>
              {result.fetchedCount.toLocaleString()}件取得
              {result.totalSize > result.fetchedCount && (
                <span className="text-yellow-600 dark:text-yellow-400">（全体: {result.totalSize.toLocaleString()}件）</span>
              )}
            </>
          ) : (
            <span className="text-slate-400 dark:text-slate-500">実行中...</span>
          )}
        </span>
        <input
          type="text"
          value={globalFilterInput}
          onChange={e => setGlobalFilterInput(e.target.value)}
          placeholder="フィルタ..."
          aria-label="結果テーブルをフィルタ"
          disabled={!result || queryLoading}
          className="ml-auto w-48 px-2 py-0.5 text-xs border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 rounded outline-none focus:border-blue-500 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:cursor-not-allowed"
        />
        {/* エクスポート: CSV (quick) / CSV 詳細 / Excel をまとめた dropdown */}
        <div className="relative" ref={exportMenuRef}>
          <button
            type="button"
            onClick={() => setExportMenuOpen(o => !o)}
            disabled={!result || queryLoading}
            aria-haspopup="menu"
            aria-expanded={exportMenuOpen}
            className="flex items-center gap-1 px-2 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 dark:text-slate-100 hover:bg-slate-300 dark:hover:bg-slate-600 rounded disabled:opacity-40 disabled:cursor-not-allowed"
          >
            エクスポート
            <ChevronDown size={12} />
          </button>
          {exportMenuOpen && (
            <div
              role="menu"
              aria-label="エクスポート形式"
              className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-lg z-30 py-1"
            >
              <button
                type="button"
                role="menuitem"
                onClick={handleQuickCsv}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 dark:hover:bg-blue-900/30 text-slate-700 dark:text-slate-200"
              >
                CSV (BOM + CRLF)
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={openCsvDetailDialog}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 dark:hover:bg-blue-900/30 text-slate-700 dark:text-slate-200"
              >
                CSV…（詳細設定）
              </button>
              <div className="border-t border-slate-100 dark:border-slate-700 my-1" />
              <button
                type="button"
                role="menuitem"
                onClick={handleExportExcel}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-green-50 dark:hover:bg-green-900/30 text-green-700 dark:text-green-300"
              >
                Excel (.xlsx)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 実行中: 経過秒数バー */}
      {queryLoading && (
        <div
          aria-live="polite"
          className="flex items-center gap-2 px-3 py-1 bg-blue-50 dark:bg-blue-900/30 border-b border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300 flex-shrink-0"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
          </span>
          <span>実行中... {elapsedSec}秒経過</span>
        </div>
      )}

      {/* テーブル (実行中は skeleton で覆う) */}
      <div className="flex-1 overflow-auto" ref={scrollRef}>
        {queryLoading ? (
          <SkeletonTable colCount={Math.min(Math.max(cols.length, 5), 8)} />
        ) : (
        <table className="text-xs border-collapse" style={{ width: table.getTotalSize() }}>
          <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 z-10">
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(header => (
                  <th
                    key={header.id}
                    style={{ width: header.getSize() }}
                    className="relative px-2 py-1.5 text-left font-semibold text-slate-600 dark:text-slate-200 border-b border-r border-slate-200 dark:border-slate-700 whitespace-nowrap select-none"
                  >
                    <div
                      onClick={header.column.getToggleSortingHandler()}
                      className="flex items-center gap-1 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 pr-2"
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === 'asc' ? <ArrowUp size={10} /> :
                       header.column.getIsSorted() === 'desc' ? <ArrowDown size={10} /> :
                       <ArrowUpDown size={10} className="text-slate-300 dark:text-slate-600" />}
                    </div>
                    {/* 列幅ドラッグハンドル: 右端の 4px 透明領域 */}
                    {header.column.getCanResize() && (
                      <div
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        onDoubleClick={() => header.column.resetSize()}
                        role="separator"
                        aria-label={`${String(header.column.columnDef.header)} 列幅を調整`}
                        className={`absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none ${
                          header.column.getIsResizing()
                            ? 'bg-blue-400'
                            : 'bg-transparent hover:bg-blue-300'
                        }`}
                      />
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {paddingTop > 0 && (
              <tr><td colSpan={cols.length} style={{ height: paddingTop }} /></tr>
            )}
            {virtualItems.map(vRow => {
              const row = rows[vRow.index];
              return (
                <tr
                  key={row.id}
                  className={vRow.index % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-800/50'}
                >
                  {row.getVisibleCells().map(cell => (
                    <td
                      key={cell.id}
                      style={{ width: cell.column.getSize() }}
                      className="px-2 py-1 border-b border-r border-slate-100 dark:border-slate-800 dark:text-slate-200 truncate"
                      title={String(cell.getValue() ?? '')}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
            {paddingBottom > 0 && (
              <tr><td colSpan={cols.length} style={{ height: paddingBottom }} /></tr>
            )}
          </tbody>
        </table>
        )}
      </div>

      {/* CSVエクスポートダイアログ */}
      {exportDialog.open && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => setExportDialog(d => ({ ...d, open: false }))}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="csv-export-title"
            onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-slate-800 rounded-lg shadow-xl p-6 w-80"
          >
            <h3 id="csv-export-title" className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-4">CSV エクスポート設定</h3>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 mb-3 cursor-pointer">
              <input
                type="checkbox"
                checked={exportDialog.bom}
                onChange={e => setExportDialog(d => ({ ...d, bom: e.target.checked }))}
                className="accent-blue-500"
              />
              BOM を付与する（Excel で開く場合に推奨）
            </label>
            <div className="mb-4">
              <p className="text-sm text-slate-700 dark:text-slate-200 mb-1">改行コード</p>
              {(['CRLF', 'LF'] as const).map(le => (
                <label key={le} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 mb-1 cursor-pointer">
                  <input
                    type="radio"
                    name="lineEnding"
                    value={le}
                    checked={exportDialog.lineEnding === le}
                    onChange={() => setExportDialog(d => ({ ...d, lineEnding: le }))}
                    className="accent-blue-500"
                  />
                  {le}
                </label>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setExportDialog(d => ({ ...d, open: false }))}
                className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleExportCsv}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// MainPage が tabs/activeTabId を購読しているため、SOQL タイピング 1 文字や activeTab 切替で
// 親が再 render する。memo で props 不変時の re-render をスキップする。
export const ResultTable = memo(ResultTableInner);
