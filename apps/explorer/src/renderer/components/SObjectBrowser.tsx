import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Search, Table2, RefreshCw, AlertCircle } from 'lucide-react';
import { useAppStore } from '../store.js';
import type { SObjectDescribe } from '@app/ipc-contract';

const SObjectBrowserInner = (): JSX.Element => {
  const {
    sobjects, selectedObject, sobjectsLoading,
    setSobjects, setSelectedObject, setSobjectsLoading, setSoqlAndRun,
  } = useAppStore(
    useShallow(s => ({
      sobjects: s.sobjects,
      selectedObject: s.selectedObject,
      sobjectsLoading: s.sobjectsLoading,
      setSobjects: s.setSobjects,
      setSelectedObject: s.setSelectedObject,
      setSobjectsLoading: s.setSobjectsLoading,
      setSoqlAndRun: s.setSoqlAndRun,
    }))
  );
  const [search, setSearch] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [describe, setDescribe] = useState<SObjectDescribe | null>(null);
  const [describeLoading, setDescribeLoading] = useState(false);
  const pendingRun = useRef(false);
  const listScrollRef = useRef<HTMLDivElement>(null);

  const loadSObjects = useCallback(async () => {
    setSobjectsLoading(true);
    setLoadError(null);
    try {
      const list = await window.sfx.listSObjects();
      setSobjects(list.sort((a, b) => a.label.localeCompare(b.label)));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setSobjectsLoading(false);
    }
  }, [setSobjects, setSobjectsLoading]);

  useEffect(() => {
    if (sobjects.length === 0 && !sobjectsLoading) {
      loadSObjects();
    }
    // 初回マウント時のみ実行（loadSObjects はクロージャ参照のため exhaustive-deps 警告対象だが意図的）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedObject) {
      setDescribe(null);
      return;
    }
    setDescribeLoading(true);
    let cancelled = false;

    const fetchDescribe = async () => {
      try {
        const desc = await window.sfx.describeObject(selectedObject);
        if (cancelled) return;
        setDescribe(desc);
        if (pendingRun.current) {
          pendingRun.current = false;
          const fields = desc.fields.map(f => f.name).join(',\n  ');
          setSoqlAndRun(`SELECT\n  ${fields}\nFROM ${selectedObject}\nLIMIT 200`);
        }
      } catch (e) {
        if (!cancelled) {
          window.sfx.rendererLog('error', `describe失敗: ${e instanceof Error ? e.message : String(e)}`);
        }
      } finally {
        if (!cancelled) setDescribeLoading(false);
      }
    };

    fetchDescribe();
    return () => { cancelled = true; };
  }, [selectedObject, setSoqlAndRun]);

  // 万単位 SObject 規模に備えて検索文字列の lower 化は一度だけ + useMemo でフィルタ
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return sobjects;
    return sobjects.filter(o =>
      o.label.toLowerCase().includes(q) || o.name.toLowerCase().includes(q)
    );
  }, [sobjects, search]);

  // レンダーごとに新しい関数を作ると virtualizer が毎回リセットされてフリーズする（CM_EXTENSIONS と同じ問題）
  const getScrollElement = useCallback(() => listScrollRef.current, []);
  const estimateSize = useCallback(() => 33, []);

  const listVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement,
    estimateSize,
    overscan: 10,
  });

  const handleSelectObject = (name: string) => {
    pendingRun.current = false;
    setSelectedObject(name);
  };

  const handleDoubleClickObject = (name: string, desc: typeof describe) => {
    if (desc && desc.name === name) {
      // describe が name と同じオブジェクトのもの → fast path
      const fields = desc.fields.map(f => f.name).join(',\n  ');
      setSoqlAndRun(`SELECT\n  ${fields}\nFROM ${name}\nLIMIT 200`);
    } else {
      pendingRun.current = true;
      setSelectedObject(name);
    }
  };

  const handleExportDefinition = async () => {
    if (!selectedObject) return;
    setExportError(null);
    try {
      await window.sfx.exportObjectDefinition(selectedObject);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      window.sfx.rendererLog('error', `定義書出力失敗: ${msg}`);
      setExportError(`定義書出力に失敗しました: ${msg}`);
    }
  };

  return (
    <div className="flex flex-col h-full border-r border-slate-200">
      {/* 検索バー */}
      <div className="p-2 border-b border-slate-200">
        <div className="flex items-center gap-1">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="オブジェクトを検索..."
              aria-label="オブジェクト検索"
              className="w-full pl-7 pr-2 py-1 text-sm border border-slate-300 rounded outline-none focus:border-blue-500"
            />
          </div>
          <button
            type="button"
            onClick={loadSObjects}
            disabled={sobjectsLoading}
            className="p-1 text-slate-500 hover:text-blue-600 disabled:opacity-50"
            title="再読み込み"
            aria-label="オブジェクト一覧を再読み込み"
          >
            <RefreshCw size={14} className={sobjectsLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* エラー表示 */}
      {loadError && (
        <div role="alert" className="flex items-start gap-1.5 px-3 py-2 text-xs text-red-600 bg-red-50 border-b border-red-200">
          <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
          <span>{loadError}</span>
        </div>
      )}

      {/* オブジェクト一覧（仮想スクロール） */}
      <div className="flex-1 overflow-y-auto" ref={listScrollRef}>
        <div style={{ height: `${listVirtualizer.getTotalSize()}px`, position: 'relative' }}>
          {listVirtualizer.getVirtualItems().map(vItem => {
            const o = filtered[vItem.index];
            if (!o) return null;
            return (
              <button
                key={o.name}
                type="button"
                style={{ position: 'absolute', top: vItem.start, left: 0, width: '100%' }}
                onClick={() => handleSelectObject(o.name)}
                onDoubleClick={() => handleDoubleClickObject(o.name, describe)}
                className={`text-left px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-blue-50 border-b border-slate-100 ${
                  selectedObject === o.name ? 'bg-blue-100 text-blue-700' : 'text-slate-700'
                }`}
              >
                <Table2 size={13} className="flex-shrink-0 text-slate-400" />
                <span className="truncate">{o.label}</span>
                {o.custom && (
                  <span className="ml-auto text-xs text-slate-400 flex-shrink-0">カスタム</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* フィールド詳細 */}
      {selectedObject && (
        <div className="border-t border-slate-200 flex flex-col" style={{ height: '50%' }}>
          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 border-b border-slate-200">
            <span className="text-xs font-semibold text-slate-600">{selectedObject}</span>
            <button
              type="button"
              onClick={handleExportDefinition}
              className="text-xs text-blue-600 hover:underline"
            >
              定義書出力
            </button>
          </div>
          {exportError && (
            <div role="alert" className="flex items-start gap-1.5 px-3 py-2 text-xs text-red-600 bg-red-50 border-b border-red-200">
              <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
              <span>{exportError}</span>
            </div>
          )}
          <div className="flex-1 overflow-y-auto text-xs">
            {describeLoading ? (
              <div className="p-3 text-slate-500">読み込み中...</div>
            ) : describe ? (
              describe.fields.map(f => (
                <div key={f.name} className="px-3 py-1 border-b border-slate-100 hover:bg-slate-50">
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-slate-700 truncate">{f.label}</span>
                    {f.custom && <span className="text-slate-400 text-xs">C</span>}
                  </div>
                  <div className="text-slate-400">{f.name} · {f.type}</div>
                </div>
              ))
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

export const SObjectBrowser = memo(SObjectBrowserInner);
