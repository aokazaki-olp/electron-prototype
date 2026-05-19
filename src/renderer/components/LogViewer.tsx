import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store.js';
import type { LogLevel } from '../../ipc/contract.js';

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

export const LogViewer = (): JSX.Element => {
  const logs = useAppStore(s => s.logs);
  const [filter, setFilter] = useState<Record<LogLevel, boolean>>({
    debug: true, info: true, warn: true, error: true,
  });
  const [search, setSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const toggleLevel = (level: LogLevel) => {
    setFilter(f => ({ ...f, [level]: !f[level] }));
  };

  const filtered = logs.filter(e =>
    filter[e.level] &&
    (search === '' || e.text.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="flex flex-col h-full bg-slate-900 text-xs font-mono">
      {/* ツールバー */}
      <div className="flex items-center gap-2 px-2 py-1 border-b border-slate-700 flex-shrink-0">
        {(['debug', 'info', 'warn', 'error'] as LogLevel[]).map(level => (
          <button
            key={level}
            onClick={() => toggleLevel(level)}
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
          onClick={() => useAppStore.getState().setLogs([])}
          className="px-2 py-0.5 bg-slate-700 text-slate-300 rounded hover:bg-slate-600"
        >
          クリア
        </button>
      </div>

      {/* ログ一覧 */}
      <div className="flex-1 overflow-y-auto">
        {filtered.map((entry, i) => (
          <div key={i} className={`px-2 py-0.5 border-b border-slate-800 flex gap-2 ${LEVEL_COLOR[entry.level]}`}>
            <span className="text-slate-500 flex-shrink-0">
              {entry.date.slice(11, 23)}
            </span>
            <span className={`uppercase flex-shrink-0 w-10 ${LEVEL_COLOR[entry.level]}`}>
              {entry.level}
            </span>
            <span className="break-all">{entry.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};
