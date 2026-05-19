/**
 * ResponseTable.tsx
 * @description 配列レスポンスをページネーション付きテーブルで表示する。
 *              NJA 正規化結果と Google Maps リンクを各行に付与する。
 *              テーブル内インクリメンタル検索（ハイライト・大文字小文字区別）に対応。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import ReactPaginate from 'react-paginate';
import type { NjaResult } from '../ipc/contract.js';
import type { EndpointDef } from './endpoints.js';
import { highlightText, testMatch } from './highlight.js';

const PAGE_SIZES = [10, 20, 50, 100] as const;
type PageSize = (typeof PAGE_SIZES)[number];

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

/** ネスト値を title 属性に使うための JSON 文字列（長すぎる場合は省略） */
const renderCellTitle = (value: unknown, displayText: string): string => {
  if (typeof value === 'object' && value !== null) {
    const json = JSON.stringify(value, null, 2);
    return json.length < 500 ? json : displayText;
  }
  return displayText;
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
  onSelectCorporate?: (corpNumber: string) => void;
}

export const ResponseTable = ({ data, endpoint, onSelectCorporate }: Props): JSX.Element | null => {
  const { rows, arrayKey } = useMemo(() => extractRows(data), [data]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(20);
  const njaCache = useRef(new Map<string, NjaResult>());
  const [njaResults, setNjaResults] = useState<Map<string, NjaResult>>(new Map());
  const [searchQuery, setSearchQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);

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

  // rows が変わったら先頭へ戻し検索もリセット。pageSize 変更は先頭リセットのみ。
  useEffect(() => { setPage(0); setSearchQuery(''); }, [rows]);
  useEffect(() => { setPage(0); }, [pageSize]);

  useEffect(() => {
    const paths = endpoint.addressFieldPaths;
    if (!paths || rows.length === 0) return;

    const pageRows = rows.slice(page * pageSize, (page + 1) * pageSize);
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

    void (async () => {
      await Promise.all(
        uncached.map(async (addr) => {
          try {
            const result = await window.nja.normalize(addr);
            njaCache.current.set(addr, result);
          } catch {
            // NJA 失敗は行単位で無視（他の行は表示を継続する）
          }
        }),
      );
      setNjaResults(new Map(njaCache.current));
    })();
  }, [page, pageSize, rows, endpoint.addressFieldPaths, arrayKey]);

  // addressFieldPaths を事前に取り出すことで !（非 null アサーション）を使わずに済む
  const paths = endpoint.addressFieldPaths;
  const hasAddress = !!paths;
  const hasCorporateColumn = columns.includes('corporate_number') && !!onSelectCorporate;

  // データカラム + キャッシュ済み NJA カラムの両方を対象にした一致行数
  const matchRowCount = useMemo(() => {
    if (!searchQuery) return 0;
    return rows.filter((row) => {
      if (typeof row !== 'object' || row === null) return false;
      const dataMatch = columns.some((col) =>
        testMatch(renderCell((row as Record<string, unknown>)[col]), searchQuery, caseSensitive),
      );
      if (dataMatch) return true;
      if (!paths) return false;
      const addr = extractAddressFromRow(row, paths, arrayKey);
      if (!addr) return false;
      const njaResult = njaResults.get(addr);
      if (!njaResult) return false;
      return NJA_COL_DEFS.some((def) =>
        testMatch(getNjaValue(njaResult, def.key), searchQuery, caseSensitive),
      );
    }).length;
  }, [rows, columns, searchQuery, caseSensitive, njaResults, paths, arrayKey]);

  if (rows.length === 0) return null;

  const pageCount = Math.ceil(rows.length / pageSize);
  const currentRows = rows.slice(page * pageSize, (page + 1) * pageSize);
  const rangeStart = page * pageSize + 1;
  const rangeEnd = Math.min((page + 1) * pageSize, rows.length);

  return (
    <div>
      {/* 検索バー */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <div className="relative flex items-center">
          <svg
            className="absolute left-1.5 w-3.5 h-3.5 text-slate-400 pointer-events-none"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
              clipRule="evenodd"
            />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
            placeholder="テーブル内を検索…"
            className="border border-slate-300 rounded pl-6 pr-6 py-1 text-xs w-52 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
            aria-label="テーブル内検索"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-1.5 text-slate-400 hover:text-slate-600 leading-none text-sm"
              aria-label="検索クリア"
            >
              ×
            </button>
          ) : null}
        </div>

        {/* 大文字小文字区別チェックボックス */}
        <label
          className="flex items-center gap-1 text-xs select-none cursor-pointer text-slate-600"
          title="大文字と小文字を区別する"
        >
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => { setCaseSensitive(e.target.checked); setPage(0); }}
          />
          <span className="font-mono font-semibold tracking-tight">Aa</span>
        </label>

        {/* 一致行数 */}
        {searchQuery ? (
          <span className={`text-xs font-medium ${matchRowCount > 0 ? 'text-blue-600' : 'text-amber-600'}`}>
            {matchRowCount > 0 ? `${matchRowCount} 行一致` : '一致なし'}
          </span>
        ) : null}

        {/* 件数 + 表示件数セレクタ */}
        <span className="text-xs text-slate-500 ml-auto">
          全{rows.length}件中 {rangeStart}〜{rangeEnd}件
        </span>
        <label className="flex items-center gap-1 text-xs text-slate-600">
          表示件数
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value) as PageSize)}
            className="border border-slate-300 rounded px-1 py-0.5"
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>{s}件</option>
            ))}
          </select>
        </label>
      </div>

      {/* NJA レベル凡例（住所列がある場合） */}
      {hasAddress ? (
        <details className="mb-2 text-xs text-slate-500">
          <summary className="cursor-pointer select-none hover:text-slate-700 inline-flex items-center gap-1">
            住所正規化レベルの見方
          </summary>
          <div className="mt-1 pl-2 grid grid-cols-2 gap-x-6 gap-y-0.5 text-slate-500">
            {[
              ['0', '認識不能'],
              ['1', '都道府県'],
              ['2', '市区町村'],
              ['3', '大字・丁目'],
              ['7', '街区符号'],
              ['8', '住居番号・地番'],
            ].map(([lv, desc]) => (
              <span key={lv}><b className="text-slate-700">{lv}</b>: {desc}</span>
            ))}
          </div>
        </details>
      ) : null}

      <div className="overflow-x-auto">
        <table className="text-xs border-collapse min-w-full">
          <thead>
            <tr>
              {hasCorporateColumn ? (
                <th className="bg-amber-100 px-2 py-1 text-left font-semibold whitespace-nowrap border border-slate-300">
                  選択
                </th>
              ) : null}
              {columns.map((col) => (
                <th
                  key={col}
                  title={col}
                  className="bg-slate-200 px-2 py-1 text-left font-semibold whitespace-nowrap border border-slate-300 cursor-help"
                >
                  {col}
                </th>
              ))}
              {hasAddress &&
                NJA_COL_DEFS.map((def) => (
                  <th
                    key={def.key}
                    title={def.title}
                    className="bg-emerald-100 px-2 py-1 text-left font-semibold whitespace-nowrap border border-slate-300 cursor-help"
                  >
                    {def.header}
                  </th>
                ))}
              {hasAddress ? (
                <th
                  title="Google Maps で開く"
                  className="bg-emerald-100 px-2 py-1 text-left font-semibold whitespace-nowrap border border-slate-300"
                >
                  地図
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {currentRows.map((row, i) => {
              const addr = paths
                ? extractAddressFromRow(row, paths, arrayKey)
                : undefined;
              const njaResult = addr ? njaResults.get(addr) : undefined;
              const corpNumber = hasCorporateColumn
                ? (row as Record<string, unknown>).corporate_number
                : undefined;

              return (
                <tr key={page * pageSize + i} className="hover:bg-slate-50">
                  {hasCorporateColumn ? (
                    <td className="px-2 py-1 border border-slate-200 whitespace-nowrap">
                      {typeof corpNumber === 'string' ? (
                        <button
                          type="button"
                          onClick={() => onSelectCorporate?.(corpNumber)}
                          className="px-2 py-1 text-xs bg-amber-500 text-white rounded hover:bg-amber-600 font-medium"
                        >
                          選択
                        </button>
                      ) : null}
                    </td>
                  ) : null}
                  {columns.map((col) => {
                    const rawVal = (row as Record<string, unknown>)[col];
                    const cellText = renderCell(rawVal);
                    return (
                      <td
                        key={col}
                        title={renderCellTitle(rawVal, cellText)}
                        className="px-2 py-1 border border-slate-200 max-w-xs truncate"
                      >
                        {searchQuery
                          ? highlightText(cellText, searchQuery, caseSensitive)
                          : cellText}
                      </td>
                    );
                  })}
                  {hasAddress &&
                    NJA_COL_DEFS.map((def) => (
                      <td
                        key={def.key}
                        className="px-2 py-1 border border-slate-200 whitespace-nowrap"
                      >
                        {!addr ? (
                          '—'
                        ) : njaResult ? (
                          searchQuery
                            ? highlightText(getNjaValue(njaResult, def.key), searchQuery, caseSensitive)
                            : getNjaValue(njaResult, def.key)
                        ) : (
                          <span
                            className="inline-block w-10 h-2.5 bg-slate-200 rounded animate-pulse"
                            aria-label="正規化中"
                          />
                        )}
                      </td>
                    ))}
                  {hasAddress ? (
                    <td className="px-2 py-1 border border-slate-200 whitespace-nowrap">
                      {njaResult && addr ? (
                        <button
                          type="button"
                          onClick={() => {
                            const url = njaResult.point
                              ? `https://www.google.com/maps?q=${njaResult.point.lat},${njaResult.point.lng}`
                              : `https://www.google.com/maps/search/${encodeURIComponent(addr)}`;
                            void window.shell.openExternal(url);
                          }}
                          className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs"
                        >
                          地図
                        </button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pageCount > 1 ? (
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
      ) : null}
    </div>
  );
};
