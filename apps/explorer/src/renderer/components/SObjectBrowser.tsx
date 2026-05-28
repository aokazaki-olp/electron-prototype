import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Search, Table2, RefreshCw } from 'lucide-react';
import { useAppStore } from '../store.js';
import { showToast } from './Toast.js';
import type { SObjectDescribe } from '@app/ipc-contract';

const SObjectBrowserInner = (): JSX.Element => {
  const {
    sobjects, selectedObject, sobjectsLoading,
    setSobjects, setSelectedObject, setSobjectsLoading, setSelectedObjectDescribe, setSoqlAndRun,
  } = useAppStore(
    useShallow(s => ({
      sobjects: s.sobjects,
      selectedObject: s.selectedObject,
      sobjectsLoading: s.sobjectsLoading,
      setSobjects: s.setSobjects,
      setSelectedObject: s.setSelectedObject,
      setSobjectsLoading: s.setSobjectsLoading,
      setSelectedObjectDescribe: s.setSelectedObjectDescribe,
      setSoqlAndRun: s.setSoqlAndRun,
    }))
  );
  const [search, setSearch] = useState('');
  const [describe, setDescribe] = useState<SObjectDescribe | null>(null);
  const [describeLoading, setDescribeLoading] = useState(false);
  const pendingRun = useRef(false);
  const listScrollRef = useRef<HTMLDivElement>(null);

  const loadSObjects = useCallback(async () => {
    setSobjectsLoading(true);
    try {
      const list = await window.sfx.listSObjects();
      setSobjects(list.sort((a, b) => a.label.localeCompare(b.label)));
    } catch (e) {
      showToast('error', `オブジェクト一覧の読み込みに失敗しました: ${e instanceof Error ? e.message : String(e)}`);
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
      setSelectedObjectDescribe(null);
      return;
    }
    setDescribeLoading(true);
    let cancelled = false;

    const fetchDescribe = async () => {
      try {
        const desc = await window.sfx.describeObject(selectedObject);
        if (cancelled) {
          return;
        }
        setDescribe(desc);
        // store にも昇格させて SoqlEditor の補完で参照できるようにする
        setSelectedObjectDescribe(desc);
        if (pendingRun.current) {
          pendingRun.current = false;
          const fields = desc.fields.map(f => f.name).join(',\n  ');
          // タブ名は API 名（`Account` 等）で命名。既定パターン `クエリ N` の時だけ自動採用される。
          setSoqlAndRun(`SELECT\n  ${fields}\nFROM ${selectedObject}\nLIMIT 200`, selectedObject);
        }
      } catch (e) {
        if (!cancelled) {
          window.sfx.rendererLog('error', `describe失敗: ${e instanceof Error ? e.message : String(e)}`);
          // 失敗時もフラグは下げる。残しておくと次に成功した describe で
          // 古い意図のクエリが誤って自動実行される silent バグになる。
          pendingRun.current = false;
        }
      } finally {
        if (!cancelled) {
          setDescribeLoading(false);
        }
      }
    };

    fetchDescribe();
    return () => {
      cancelled = true;
    };
  }, [selectedObject, setSelectedObjectDescribe, setSoqlAndRun]);

  // 万単位 SObject 規模に備えて検索文字列の lower 化は一度だけ + useMemo でフィルタ
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) {
      return sobjects;
    }
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
      setSoqlAndRun(`SELECT\n  ${fields}\nFROM ${name}\nLIMIT 200`, name);
    } else {
      pendingRun.current = true;
      setSelectedObject(name);
    }
  };

  const handleExportDefinition = async (format: 'excel' | 'markdown' | 'json') => {
    if (!selectedObject) {
      return;
    }
    try {
      if (format === 'excel') {
        await window.sfx.exportObjectDefinition(selectedObject);
      } else if (format === 'markdown') {
        await window.sfx.exportObjectDefinitionMarkdown(selectedObject);
      } else {
        await window.sfx.exportObjectDefinitionJson(selectedObject);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      window.sfx.rendererLog('error', `定義書出力失敗: ${msg}`);
      showToast('error', `定義書出力に失敗しました: ${msg}`);
    }
  };

  return (
    <div className="flex flex-col h-full border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
      {/* 検索バー */}
      <div className="p-2 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-1">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="オブジェクトを検索..."
              aria-label="オブジェクト検索"
              className="w-full pl-7 pr-2 py-1 text-sm border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded outline-none focus:border-blue-500"
            />
          </div>
          <button
            type="button"
            onClick={loadSObjects}
            disabled={sobjectsLoading}
            className="p-1 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-50"
            title="再読み込み"
            aria-label="オブジェクト一覧を再読み込み"
          >
            <RefreshCw size={14} className={sobjectsLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* オブジェクト一覧（仮想スクロール） */}
      <div className="flex-1 overflow-y-auto" ref={listScrollRef}>
        <div style={{ height: `${listVirtualizer.getTotalSize()}px`, position: 'relative' }}>
          {listVirtualizer.getVirtualItems().map(vItem => {
            const o = filtered[vItem.index];
            if (!o) {
              return null;
            }
            return (
              <button
                key={o.name}
                type="button"
                style={{ position: 'absolute', top: vItem.start, left: 0, width: '100%' }}
                onClick={() => handleSelectObject(o.name)}
                onDoubleClick={() => handleDoubleClickObject(o.name, describe)}
                className={`text-left px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 border-b border-slate-100 dark:border-slate-800 ${
                  selectedObject === o.name
                    ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                    : 'text-slate-700 dark:text-slate-200'
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
        <div className="border-t border-slate-200 dark:border-slate-700 flex flex-col" style={{ height: '50%' }}>
          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{selectedObject}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleExportDefinition('excel')}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                title="Excel形式で定義書を出力"
              >
                Excel
              </button>
              <span className="text-xs text-slate-400">·</span>
              <button
                type="button"
                onClick={() => handleExportDefinition('markdown')}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                title="Markdown形式で定義書を出力"
              >
                MD
              </button>
              <span className="text-xs text-slate-400">·</span>
              <button
                type="button"
                onClick={() => handleExportDefinition('json')}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                title="JSON形式で定義書を出力"
              >
                JSON
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto text-xs">
            {describeLoading ? (
              <div className="p-3 text-slate-500 dark:text-slate-400">読み込み中...</div>
            ) : describe ? (
              describe.fields.map(f => (
                <div key={f.name} className="px-3 py-1 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800">
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-slate-700 dark:text-slate-200 truncate">{f.label}</span>
                    {f.custom && <span className="text-slate-400 text-xs">C</span>}
                  </div>
                  <div className="text-slate-400 dark:text-slate-500">{f.name} · {f.type}</div>
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
