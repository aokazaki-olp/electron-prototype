import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Download, FileSpreadsheet, ArrowUpDown, ArrowUp, ArrowDown, AlertCircle } from 'lucide-react';
import type { QueryResult, CsvExportOptions } from '@app/ipc-contract';

interface Props {
  result: QueryResult | null;
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

export const ResultTable = ({ result, onSnippetClick }: Props): JSX.Element => {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilterInput, setGlobalFilterInput] = useState('');
  const [globalFilter, setGlobalFilter] = useState('');
  const [exportError, setExportError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [exportDialog, setExportDialog] = useState<ExportDialogState>({
    open: false,
    bom: true,
    lineEnding: 'CRLF',
  });

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

  const table = useReactTable({
    data: result?.records ?? [],
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
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

  const handleExportCsv = async () => {
    if (!result) return;
    const options: CsvExportOptions = {
      bom: exportDialog.bom,
      lineEnding: exportDialog.lineEnding,
    };
    setExportError(null);
    try {
      await window.sfx.exportCsv(result.records, cols, options);
      setExportDialog(d => ({ ...d, open: false }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      window.sfx.rendererLog('error', `CSV エクスポート失敗: ${msg}`);
      setExportError(`CSV 保存に失敗しました: ${msg}`);
    }
  };

  const handleExportExcel = async () => {
    if (!result) return;
    setExportError(null);
    try {
      await window.sfx.exportQueryExcel(result.records, cols);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      window.sfx.rendererLog('error', `Excel エクスポート失敗: ${msg}`);
      setExportError(`Excel 保存に失敗しました: ${msg}`);
    }
  };

  // モーダル: Esc クローズ
  useEffect(() => {
    if (!exportDialog.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportDialog(d => ({ ...d, open: false }));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [exportDialog.open]);

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 text-sm gap-3 px-6 py-8">
        <p>SOQLを実行すると結果が表示されます</p>
        {onSnippetClick && (
          <div className="flex flex-col gap-1.5 max-w-2xl w-full">
            <p className="text-xs text-slate-500 mt-3 mb-1">まず試してみる:</p>
            {EMPTY_STATE_SNIPPETS.map(s => (
              <button
                key={s.soql}
                type="button"
                onClick={() => onSnippetClick(s.soql)}
                className="text-left px-3 py-2 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded transition-colors"
                title={`エディタにセット: ${s.soql}`}
              >
                <span className="block text-xs text-slate-600 mb-0.5">{s.label}</span>
                <span className="block text-xs font-mono text-slate-700 truncate">{s.soql}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* ツールバー */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border-b border-slate-200 flex-shrink-0">
        <span className="text-xs text-slate-600">
          {result.fetchedCount.toLocaleString()}件取得
          {result.totalSize > result.fetchedCount && (
            <span className="text-yellow-600">（全体: {result.totalSize.toLocaleString()}件）</span>
          )}
        </span>
        <input
          type="text"
          value={globalFilterInput}
          onChange={e => setGlobalFilterInput(e.target.value)}
          placeholder="フィルタ..."
          aria-label="結果テーブルをフィルタ"
          className="ml-auto w-48 px-2 py-0.5 text-xs border border-slate-300 rounded outline-none focus:border-blue-500"
        />
        <button
          type="button"
          onClick={() => setExportDialog(d => ({ ...d, open: true }))}
          className="flex items-center gap-1 px-2 py-0.5 text-xs bg-slate-200 hover:bg-slate-300 rounded"
        >
          <Download size={12} />
          CSV
        </button>
        <button
          type="button"
          onClick={handleExportExcel}
          className="flex items-center gap-1 px-2 py-0.5 text-xs bg-green-100 hover:bg-green-200 text-green-700 rounded"
        >
          <FileSpreadsheet size={12} />
          Excel
        </button>
      </div>

      {/* エラー表示 */}
      {exportError && (
        <div role="alert" className="flex items-start gap-2 px-3 py-2 bg-red-50 border-b border-red-200 text-xs text-red-700">
          <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
          <span>{exportError}</span>
        </div>
      )}

      {/* テーブル */}
      <div className="flex-1 overflow-auto" ref={scrollRef}>
        <table className="text-xs border-collapse w-full">
          <thead className="sticky top-0 bg-slate-100 z-10">
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(header => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className="px-2 py-1.5 text-left font-semibold text-slate-600 border-b border-r border-slate-200 whitespace-nowrap cursor-pointer hover:bg-slate-200 select-none"
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === 'asc' ? <ArrowUp size={10} /> :
                       header.column.getIsSorted() === 'desc' ? <ArrowDown size={10} /> :
                       <ArrowUpDown size={10} className="text-slate-300" />}
                    </div>
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
                  className={vRow.index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}
                >
                  {row.getVisibleCells().map(cell => (
                    <td
                      key={cell.id}
                      className="px-2 py-1 border-b border-r border-slate-100 max-w-xs truncate"
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
            className="bg-white rounded-lg shadow-xl p-6 w-80"
          >
            <h3 id="csv-export-title" className="text-sm font-semibold text-slate-800 mb-4">CSV エクスポート設定</h3>
            <label className="flex items-center gap-2 text-sm text-slate-700 mb-3 cursor-pointer">
              <input
                type="checkbox"
                checked={exportDialog.bom}
                onChange={e => setExportDialog(d => ({ ...d, bom: e.target.checked }))}
                className="accent-blue-500"
              />
              BOM を付与する（Excel で開く場合に推奨）
            </label>
            <div className="mb-4">
              <p className="text-sm text-slate-700 mb-1">改行コード</p>
              {(['CRLF', 'LF'] as const).map(le => (
                <label key={le} className="flex items-center gap-2 text-sm text-slate-600 mb-1 cursor-pointer">
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
                className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded"
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
