import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAppStore } from '../store.js';
import type { LogLevel } from '@app/ipc-contract';

const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: 'text-slate-400',
  info:  'text-slate-200',
  warn:  'text-yellow-400',
  error: 'text-red-400',
};

const LEVEL_BG: Record<LogLevel, string> = {
  debug: 'bg-slate-700',
  info:  'bg-slate-600',
  warn:  'bg-yellow-900',
  error: 'bg-red-900',
};

const FILTERABLE_LEVELS = ['debug', 'info', 'warn', 'error'] as const satisfies readonly LogLevel[];

const LogViewerInner = (): JSX.Element => {
  const { logs, setLogs } = useAppStore(
    useShallow(s => ({ logs: s.logs, setLogs: s.setLogs }))
  );
  const [filter, setFilter] = useState<Record<LogLevel, boolean>>({
    debug: true, info: true, warn: true, error: true,
  });
  const [search, setSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const toggleLevel = (level: LogLevel) => {
    setFilter(f => ({ ...f, [level]: !f[level] }));
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return logs.filter(e =>
      filter[e.level] && (q === '' || e.text.toLowerCase().includes(q))
    );
  }, [logs, filter, search]);

  // 仮想化（@tanstack/react-virtual）: 1000 件全描画による reflow を防ぐ
  const getScrollElement = useCallback(() => scrollRef.current, []);
  const estimateSize = useCallback(() => 22, []);
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement,
    estimateSize,
    overscan: 20,
  });

  // 自動スクロール: smooth は大量ログでアニメ詰まりを起こすため auto を使う
  useEffect(() => {
    if (autoScroll && filtered.length > 0) {
      virtualizer.scrollToIndex(filtered.length - 1, { align: 'end', behavior: 'auto' });
    }
  }, [filtered.length, autoScroll, virtualizer]);

  const totalSize = virtualizer.getTotalSize();
  const items = virtualizer.getVirtualItems();

  return (
    <div className="flex flex-col h-full bg-slate-900 text-xs font-mono">
      {/* ツールバー */}
      <div className="flex items-center gap-2 px-2 py-1 border-b border-slate-700 flex-shrink-0">
        {FILTERABLE_LEVELS.map(level => (
          <button
            key={level}
            type="button"
            onClick={() => toggleLevel(level)}
            aria-pressed={filter[level]}
            aria-label={`${level} レベルを${filter[level] ? '非表示' : '表示'}`}
            className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
              filter[level] ? LEVEL_BG[level] + ' ' + LEVEL_COLOR[level] : 'bg-slate-800 text-slate-600'
            }`}
          >
            {level}
          </button>
        ))}
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="検索..."
          aria-label="ログ検索"
          className="flex-1 bg-slate-800 text-slate-200 px-2 py-0.5 rounded border border-slate-600 outline-none text-xs"
        />
        <label className="flex items-center gap-1 text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={e => setAutoScroll(e.target.checked)}
            className="accent-blue-500"
          />
          自動スクロール
        </label>
        <button
          type="button"
          onClick={() => setLogs([])}
          className="px-2 py-0.5 bg-slate-700 text-slate-300 rounded hover:bg-slate-600"
        >
          クリア
        </button>
      </div>

      {/* ログ一覧（仮想化） */}
      <div className="flex-1 overflow-y-auto" ref={scrollRef}>
        <div style={{ height: totalSize, position: 'relative' }}>
          {items.map(vItem => {
            const entry = filtered[vItem.index];
            if (!entry) return null;
            // LogEntry に id が無いため、date + index を複合キーにして
            // フィルタ条件変更時の reconciliation 破綻を抑える
            const time = (() => {
              const date = new Date(entry.date);
              return Number.isNaN(date.getTime()) ? entry.date : date.toLocaleTimeString('ja-JP', { hour12: false });
            })();
            return (
              <div
                key={`${entry.date}-${vItem.index}`}
                style={{ position: 'absolute', top: vItem.start, left: 0, right: 0, height: vItem.size }}
                className={`px-2 py-0.5 border-b border-slate-800 flex gap-2 ${LEVEL_COLOR[entry.level]}`}
              >
                <span className="text-slate-500 flex-shrink-0">{time}</span>
                <span className={`uppercase flex-shrink-0 w-10 ${LEVEL_COLOR[entry.level]}`}>
                  {entry.level}
                </span>
                <span className="break-all">{entry.text}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const LogViewer = memo(LogViewerInner);
