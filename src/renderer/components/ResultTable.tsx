import { useState, useMemo, useRef, useCallback } from 'react';
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
import { Download, FileSpreadsheet, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import type { QueryResult, CsvExportOptions } from '@app/ipc-contract';

interface Props {
  result: QueryResult | null;
}

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

export const ResultTable = ({ result }: Props): JSX.Element => {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [exportDialog, setExportDialog] = useState<ExportDialogState>({
    open: false,
    bom: true,
    lineEnding: 'CRLF',
  });

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    if (!result) return [];
    const cols = getColumns(result.records);
    return cols.map(col => ({
      accessorKey: col,
      header: col,
      cell: ({ getValue }) => {
        const v = getValue();
        if (v === null || v === undefined) return <span className="text-slate-300">null</span>;
        if (typeof v === 'object') return <span className="text-slate-500">[object]</span>;
        return String(v);
      },
    }));
  }, [result]);

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
  const paddingBottom = virtualItems.length > 0
    ? virtualizer.getTotalSize() - virtualItems.at(-1)!.end
    : 0;

  const handleExportCsv = async () => {
    if (!result) return;
    const cols = getColumns(result.records);
    const options: CsvExportOptions = {
      bom: exportDialog.bom,
      lineEnding: exportDialog.lineEnding,
    };
    try {
      await window.sfx.exportCsv(result.records, cols, options);
    } catch (e) {
      console.error(e);
    }
    setExportDialog(d => ({ ...d, open: false }));
  };

  const handleExportExcel = async () => {
    if (!result) return;
    const cols = getColumns(result.records);
    try {
      await window.sfx.exportQueryExcel(result.records, cols);
    } catch (e) {
      console.error(e);
    }
  };

  if (!result) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        SOQLを実行すると結果が表示されます
      </div>
    );
  }

  const cols = getColumns(result.records);

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
          value={globalFilter}
          onChange={e => setGlobalFilter(e.target.value)}
          placeholder="フィルタ..."
          className="ml-auto w-48 px-2 py-0.5 text-xs border border-slate-300 rounded outline-none focus:border-blue-500"
        />
        <button
          onClick={() => setExportDialog(d => ({ ...d, open: true }))}
          className="flex items-center gap-1 px-2 py-0.5 text-xs bg-slate-200 hover:bg-slate-300 rounded"
        >
          <Download size={12} />
          CSV
        </button>
        <button
          onClick={handleExportExcel}
          className="flex items-center gap-1 px-2 py-0.5 text-xs bg-green-100 hover:bg-green-200 text-green-700 rounded"
        >
          <FileSpreadsheet size={12} />
          Excel
        </button>
      </div>

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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-80">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">CSV エクスポート設定</h3>
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
                onClick={() => setExportDialog(d => ({ ...d, open: false }))}
                className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded"
              >
                キャンセル
              </button>
              <button
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
