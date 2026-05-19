import { useEffect, useState } from 'react';
import { Search, Table2, RefreshCw } from 'lucide-react';
import { useAppStore } from '../store.js';
import type { SObjectDescribe } from '../../ipc/contract.js';

export const SObjectBrowser = (): JSX.Element => {
  const { sobjects, selectedObject, sobjectsLoading, setSobjects, setSelectedObject, setSobjectsLoading, setSoql } = useAppStore();
  const [search, setSearch] = useState('');
  const [describe, setDescribe] = useState<SObjectDescribe | null>(null);
  const [describeLoading, setDescribeLoading] = useState(false);

  const loadSObjects = async () => {
    setSobjectsLoading(true);
    try {
      const list = await window.sfx.listSObjects();
      setSobjects(list.sort((a, b) => a.label.localeCompare(b.label)));
    } catch (e) {
      console.error(e);
    } finally {
      setSobjectsLoading(false);
    }
  };

  useEffect(() => {
    if (sobjects.length === 0) {
      loadSObjects();
    }
  }, []);

  useEffect(() => {
    if (!selectedObject) {
      setDescribe(null);
      return;
    }
    setDescribeLoading(true);
    window.sfx.describeObject(selectedObject)
      .then(setDescribe)
      .catch(console.error)
      .finally(() => setDescribeLoading(false));
  }, [selectedObject]);

  const filtered = sobjects.filter(o =>
    o.label.toLowerCase().includes(search.toLowerCase()) ||
    o.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelectObject = (name: string) => {
    setSelectedObject(name);
    setSoql(`SELECT Id, Name FROM ${name} LIMIT 200`);
  };

  const handleExportDefinition = async () => {
    if (!selectedObject) return;
    try {
      await window.sfx.exportObjectDefinition(selectedObject);
    } catch (e) {
      console.error(e);
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
              className="w-full pl-7 pr-2 py-1 text-sm border border-slate-300 rounded outline-none focus:border-blue-500"
            />
          </div>
          <button
            onClick={loadSObjects}
            disabled={sobjectsLoading}
            className="p-1 text-slate-500 hover:text-blue-600 disabled:opacity-50"
            title="再読み込み"
          >
            <RefreshCw size={14} className={sobjectsLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* オブジェクト一覧 */}
      <div className="flex-1 overflow-y-auto">
        {filtered.map(o => (
          <button
            key={o.name}
            onClick={() => handleSelectObject(o.name)}
            className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-blue-50 border-b border-slate-100 ${
              selectedObject === o.name ? 'bg-blue-100 text-blue-700' : 'text-slate-700'
            }`}
          >
            <Table2 size={13} className="flex-shrink-0 text-slate-400" />
            <span className="truncate">{o.label}</span>
            {o.custom && (
              <span className="ml-auto text-xs text-slate-400 flex-shrink-0">カスタム</span>
            )}
          </button>
        ))}
      </div>

      {/* フィールド詳細 */}
      {selectedObject && (
        <div className="border-t border-slate-200 flex flex-col" style={{ height: '50%' }}>
          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 border-b border-slate-200">
            <span className="text-xs font-semibold text-slate-600">{selectedObject}</span>
            <button
              onClick={handleExportDefinition}
              className="text-xs text-blue-600 hover:underline"
            >
              定義書出力
            </button>
          </div>
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
