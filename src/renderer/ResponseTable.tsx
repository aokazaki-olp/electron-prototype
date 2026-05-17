import { useEffect, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import ReactPaginate from 'react-paginate';
import type { NjaResult } from '../ipc/contract.js';
import type { EndpointDef } from './endpoints.js';

const PAGE_SIZE = 20;

const NJA_COL_DEFS = [
  { header: '正規化Lv', key: 'level',       title: 'level — 住所の正規化レベル (0=不明〜8=番地)' },
  { header: '都道府県',  key: 'pref',        title: 'pref — 都道府県名' },
  { header: '市区町村',  key: 'city',        title: 'city — 市区町村名' },
  { header: '大字・丁目', key: 'town',       title: 'town — 大字・丁目名' },
  { header: '番地',     key: 'addr',        title: 'addr — 街区符号・住居符号または地番' },
  { header: 'その他',   key: 'other',       title: 'other — 正規化できなかった文字列' },
  { header: '座標Lv',   key: 'point.level', title: 'point.level — 座標データの精度レベル' },
] as const;

type NjaColKey = (typeof NJA_COL_DEFS)[number]['key'];

export const extractRows = (
  data: unknown,
): { rows: unknown[]; arrayKey: string | null } => {
  if (Array.isArray(data)) return { rows: data, arrayKey: null };
  if (typeof data !== 'object' || data === null) return { rows: [], arrayKey: null };
  for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
      return { rows: val, arrayKey: key };
    }
  }
  return { rows: [], arrayKey: null };
};

const extractAddressFromRow = (
  row: unknown,
  paths: readonly string[],
  arrayKey: string | null,
): string | undefined => {
  if (row == null || typeof row !== 'object') return undefined;
  for (const path of paths) {
    let fieldPath: string;
    if (path.includes('[].')) {
      const bracketIdx = path.indexOf('[].');
      const pathArrayKey = path.slice(0, bracketIdx);
      if (arrayKey !== null && pathArrayKey !== arrayKey) continue;
      fieldPath = path.slice(bracketIdx + 3);
    } else {
      fieldPath = path;
    }
    const val = fieldPath.split('.').reduce((obj: unknown, k) => {
      if (obj == null || typeof obj !== 'object') return undefined;
      return (obj as Record<string, unknown>)[k];
    }, row);
    if (typeof val === 'string' && val !== '') return val;
  }
  return undefined;
};

const renderCell = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return `[${value.length}件]`;
  if (typeof value === 'object') return '{…}';
  return String(value);
};

const getNjaValue = (result: NjaResult, key: NjaColKey): string => {
  if (key === 'point.level') {
    return result.point != null ? String(result.point.level) : '—';
  }
  const val = result[key as keyof Omit<NjaResult, 'point'>];
  if (val === undefined || val === '') return '—';
  return String(val);
};

interface Props {
  data: unknown;
  endpoint: EndpointDef;
}

export const ResponseTable = ({ data, endpoint }: Props): JSX.Element | null => {
  const { rows, arrayKey } = useMemo(() => extractRows(data), [data]);
  const [page, setPage] = useState(0);
  const njaCache = useRef(new Map<string, NjaResult>());
  const [njaResults, setNjaResults] = useState<Map<string, NjaResult>>(new Map());

  const columns = useMemo(() => {
    const keys = new Set<string>();
    for (const row of rows.slice(0, 5)) {
      if (typeof row === 'object' && row !== null) {
        for (const k of Object.keys(row as Record<string, unknown>)) {
          keys.add(k);
        }
      }
    }
    return [...keys];
  }, [rows]);

  // ページが変わったら先頭に戻す
  useEffect(() => { setPage(0); }, [rows]);

  useEffect(() => {
    const paths = endpoint.addressFieldPaths;
    if (!paths || rows.length === 0) return;

    const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const uncached: string[] = [];
    for (const row of pageRows) {
      const addr = extractAddressFromRow(row, paths, arrayKey);
      if (addr && !njaCache.current.has(addr)) {
        uncached.push(addr);
      }
    }

    if (uncached.length === 0) {
      setNjaResults(new Map(njaCache.current));
      return;
    }

    void Promise.all(
      uncached.map(addr =>
        window.nja
          .normalize(addr)
          .then(result => { njaCache.current.set(addr, result); })
          .catch(() => {}),
      ),
    ).then(() => { setNjaResults(new Map(njaCache.current)); });
  }, [page, rows, endpoint.addressFieldPaths, arrayKey]);

  if (rows.length === 0) return null;

  const hasAddress = !!endpoint.addressFieldPaths;
  const pageCount = Math.ceil(rows.length / PAGE_SIZE);
  const currentRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div>
      <div className="text-xs text-slate-500 mb-2">{rows.length}件</div>
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse min-w-full">
          <thead>
            <tr>
              {columns.map(col => (
                <th
                  key={col}
                  title={col}
                  className="bg-slate-200 px-2 py-1 text-left font-semibold whitespace-nowrap border border-slate-300 cursor-help"
                >
                  {col}
                </th>
              ))}
              {hasAddress &&
                NJA_COL_DEFS.map(def => (
                  <th
                    key={def.key}
                    title={def.title}
                    className="bg-emerald-100 px-2 py-1 text-left font-semibold whitespace-nowrap border border-slate-300 cursor-help"
                  >
                    {def.header}
                  </th>
                ))}
              {hasAddress && (
                <th
                  title="Google Maps で開く"
                  className="bg-emerald-100 px-2 py-1 text-left font-semibold whitespace-nowrap border border-slate-300 cursor-help"
                >
                  地図
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {currentRows.map((row, i) => {
              const addr = hasAddress
                ? extractAddressFromRow(row, endpoint.addressFieldPaths!, arrayKey)
                : undefined;
              const njaResult = addr ? njaResults.get(addr) : undefined;
              return (
                <tr key={i} className="hover:bg-slate-50">
                  {columns.map(col => {
                    const cellVal = renderCell(
                      (row as Record<string, unknown>)[col],
                    );
                    return (
                      <td
                        key={col}
                        title={cellVal}
                        className="px-2 py-1 border border-slate-200 max-w-xs truncate"
                      >
                        {cellVal}
                      </td>
                    );
                  })}
                  {hasAddress &&
                    NJA_COL_DEFS.map(def => (
                      <td
                        key={def.key}
                        className="px-2 py-1 border border-slate-200 whitespace-nowrap"
                      >
                        {addr ? (njaResult ? getNjaValue(njaResult, def.key) : '…') : '—'}
                      </td>
                    ))}
                  {hasAddress && (
                    <td className="px-2 py-1 border border-slate-200 whitespace-nowrap">
                      {njaResult && addr && (
                        <button
                          type="button"
                          onClick={() => {
                            const url = njaResult.point
                              ? `https://www.google.com/maps?q=${njaResult.point.lat},${njaResult.point.lng}`
                              : `https://www.google.com/maps/search/${encodeURIComponent(addr)}`;
                            void window.shell.openExternal(url);
                          }}
                          className="px-1.5 py-0.5 bg-blue-600 text-white rounded"
                        >
                          地図
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <ReactPaginate
          pageCount={pageCount}
          pageRangeDisplayed={5}
          marginPagesDisplayed={1}
          forcePage={page}
          onPageChange={({ selected }) => setPage(selected)}
          previousLabel="‹"
          nextLabel="›"
          containerClassName="flex flex-wrap gap-1 justify-center mt-3 text-sm select-none"
          pageLinkClassName="block px-2 py-1 rounded border border-slate-300 hover:bg-slate-100"
          activeLinkClassName="!bg-blue-600 !text-white !border-blue-600"
          previousLinkClassName="block px-2 py-1 rounded border border-slate-300 hover:bg-slate-100"
          nextLinkClassName="block px-2 py-1 rounded border border-slate-300 hover:bg-slate-100"
          disabledLinkClassName="opacity-40 cursor-not-allowed pointer-events-none"
          breakLinkClassName="block px-2 py-1"
        />
      )}
    </div>
  );
};
