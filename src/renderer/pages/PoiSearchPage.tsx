import { useState, useRef, useCallback } from 'react';
import { Search, ArrowLeft, X } from 'lucide-react';
import type { PoiCandidate, PoiQueryType, PoiSearchResult } from '../../ipc/contract.js';

const TOTAL_FIELDS = 10;

const QUERY_TYPE_LABEL: Record<PoiQueryType, string> = {
  name: '企業名',
  address: '住所',
  ambiguous: '不明',
} as const;

const SOURCE_LABEL: Record<string, string> = {
  'yahoo-local': 'ローカルサーチ',
  'yahoo-geocoder': 'ジオコーダ',
} as const;

const SOURCE_CLASS: Record<string, string> = {
  'yahoo-local': 'bg-orange-100 text-orange-700',
  'yahoo-geocoder': 'bg-purple-100 text-purple-700',
} as const;

const joinParts = (a: string, b: string, sep = '-'): string =>
  [a, b].filter(Boolean).join(sep);

const Empty = (): JSX.Element => <span className="text-slate-300">—</span>;

interface Props {
  onBack: () => void;
}

export const PoiSearchPage = ({ onBack }: Props): JSX.Element => {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<PoiSearchResult | null>(null);
  const [selected, setSelected] = useState<PoiCandidate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string): Promise<void> => {
    if (!q.trim()) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await window.sfx.poiSearch(q.trim());
      setResult(r);
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (value: string): void => {
    setQuery(value);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => search(value), 300);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key !== 'Enter') {
      return;
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    search(query);
  };

  const handleSearch = (): void => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    search(query);
  };

  const filledColor = (count: number): string => {
    if (count >= 7) return 'text-green-700';
    if (count >= 4) return 'text-yellow-700';
    return 'text-red-600';
  };

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* ヘッダー */}
      <header className="flex items-center gap-3 px-4 py-2 bg-slate-800 text-white flex-shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-slate-300 hover:text-white px-2 py-1 rounded hover:bg-slate-700"
        >
          <ArrowLeft size={13} /> 戻る
        </button>
        <span className="text-slate-400 text-xs">|</span>
        <span className="font-semibold text-sm">POI検索テスト</span>
      </header>

      {/* 検索バー */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 flex-shrink-0">
        <div className="relative flex-1 max-w-xl">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={e => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="企業名または住所を入力（例: セブンイレブン品川駅前店 / 東京都品川区大崎1）"
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-300 rounded-md outline-none focus:border-blue-500"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? '検索中...' : '検索'}
        </button>
        {result && (
          <div className="flex items-center gap-2 text-xs">
            <span className={`px-2 py-0.5 rounded-full font-medium ${
              result.queryType === 'name'
                ? 'bg-blue-100 text-blue-700'
                : result.queryType === 'address'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-slate-100 text-slate-600'
            }`}>
              {QUERY_TYPE_LABEL[result.queryType]}
            </span>
            <span className="text-slate-500">{result.candidates.length}件</span>
          </div>
        )}
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-sm text-red-700 flex-shrink-0">
          {error}
        </div>
      )}

      {/* メインコンテンツ */}
      <div className="flex flex-1 overflow-hidden">
        {/* 結果テーブル */}
        <div className="flex-1 overflow-auto">
          {!result && !loading && (
            <div className="flex items-center justify-center h-full text-sm text-slate-400">
              企業名または住所を入力して検索してください
            </div>
          )}
          {result && result.candidates.length === 0 && (
            <div className="flex items-center justify-center h-full text-sm text-slate-400">
              候補が見つかりませんでした
            </div>
          )}
          {result && result.candidates.length > 0 && (
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-slate-50 z-10">
                <tr>
                  {[
                    '正式名称', 'ソース', '充填率', '電話番号',
                    '郵便番号', '都道府県', '市区町村',
                    '大字・丁目', '街区・住居', '建物名',
                  ].map(h => (
                    <th
                      key={h}
                      className="px-2 py-1.5 text-left font-medium text-slate-600 border-b border-slate-200 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.candidates.map(c => {
                  const isSelected = selected?.id === c.id && selected?.source === c.source;
                  return (
                    <tr
                      key={`${c.source}-${c.id}`}
                      onClick={() => setSelected(isSelected ? null : c)}
                      className={`cursor-pointer border-b border-slate-100 hover:bg-blue-50 ${isSelected ? 'bg-blue-50' : ''}`}
                    >
                      <td className="px-2 py-1.5 max-w-[160px]">
                        <span className="block truncate font-medium" title={c.officialName}>
                          {c.officialName || <Empty />}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <span className={`px-1.5 py-0.5 rounded ${SOURCE_CLASS[c.source] ?? 'bg-slate-100 text-slate-600'}`}>
                          {SOURCE_LABEL[c.source] ?? c.source}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <span className={`font-mono font-medium ${filledColor(c.filledCount)}`}>
                          {c.filledCount}/{TOTAL_FIELDS}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 font-mono">{c.phone || <Empty />}</td>
                      <td className="px-2 py-1.5 font-mono">{c.postalCode || <Empty />}</td>
                      <td className="px-2 py-1.5">{c.address.prefecture || <Empty />}</td>
                      <td className="px-2 py-1.5">{c.address.city || <Empty />}</td>
                      <td className="px-2 py-1.5">
                        {(c.address.oaza || c.address.aza)
                          ? joinParts(c.address.oaza, c.address.aza, '')
                          : <Empty />}
                      </td>
                      <td className="px-2 py-1.5 font-mono">
                        {(c.address.detail1 || c.address.detail2)
                          ? joinParts(c.address.detail1, c.address.detail2)
                          : <Empty />}
                      </td>
                      <td className="px-2 py-1.5">{c.address.building || <Empty />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Raw JSON パネル */}
        {selected && (
          <div className="w-96 flex-shrink-0 border-l border-slate-200 flex flex-col bg-slate-950">
            <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-700 flex-shrink-0">
              <span className="text-xs text-slate-300 font-medium truncate max-w-[280px]" title={selected.officialName}>
                {selected.officialName || '（名称なし）'}
              </span>
              <button
                onClick={() => setSelected(null)}
                className="text-slate-400 hover:text-slate-200 ml-2"
              >
                <X size={13} />
              </button>
            </div>
            <pre className="flex-1 overflow-auto p-3 text-xs text-green-400 whitespace-pre font-mono leading-relaxed">
              {selected.rawJson}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
