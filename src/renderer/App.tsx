/**
 * App.tsx
 * @description 左ペイン（エンドポイント一覧）+ 右ペイン（入力フォーム・レスポンス・住所正規化）
 *              プロトタイプなので Redux 等は使わず useState のみ。
 */

import { useMemo, useState } from 'react';
import type { JSX } from 'react';
import { ENDPOINTS, extractFirstAddress } from './endpoints.js';
import type { EndpointDef, EndpointCategory, FieldDef } from './endpoints.js';
import type { GBizChannel, NjaResult } from '../ipc/contract.js';
import { JsonViewer } from './JsonViewer.js';
import { ResponseTable, extractRows } from './ResponseTable.js';

type FormState = Record<string, string>;

const CATEGORIES: EndpointCategory[] = ['基本', '関連情報', '更新情報'];

const groupByCategory = (): Record<EndpointCategory, EndpointDef[]> => {
  const out: Record<EndpointCategory, EndpointDef[]> = { 基本: [], 関連情報: [], 更新情報: [] };
  for (const e of ENDPOINTS) {
    out[e.category].push(e);
  }
  return out;
};

const buildParams = (endpoint: EndpointDef, form: FormState): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const f of endpoint.fields) {
    const raw = form[f.name];
    if (raw == null || raw === '') {
      continue;
    }
    if (f.type === 'number') {
      const n = Number(raw);
      if (!Number.isNaN(n)) {
        out[f.name] = n;
      }
    } else if (f.type === 'checkbox') {
      // checkbox は "true" のときのみクエリに含める（"false" はサーバ既定と同じため省略）
      if (raw === 'true') {
        out[f.name] = 'true';
      }
    } else {
      out[f.name] = raw;
    }
  }
  return out;
};

const Sidebar = ({
  selected,
  onSelect,
}: {
  selected: GBizChannel;
  onSelect: (id: GBizChannel) => void;
}): JSX.Element => {
  const grouped = useMemo(groupByCategory, []);
  return (
    <aside className="w-64 border-r border-slate-200 bg-slate-50 overflow-y-auto">
      {CATEGORIES.map((cat) => (
        <div key={cat} className="py-2">
          <div className="px-3 py-1 text-xs font-semibold text-slate-500">{cat}</div>
          {grouped[cat].map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => onSelect(e.id)}
              className={
                'block w-full text-left px-4 py-1.5 text-sm hover:bg-slate-200 ' +
                (selected === e.id ? 'bg-slate-300 font-semibold' : '')
              }
            >
              {e.label}
            </button>
          ))}
        </div>
      ))}
    </aside>
  );
};

const FieldInput = ({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: string;
  onChange: (v: string) => void;
}): JSX.Element => {
  if (field.type === 'checkbox') {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value === 'true'}
          onChange={(e) => onChange(e.target.checked ? 'true' : '')}
        />
        <span className="text-slate-700">{field.label}</span>
      </label>
    );
  }
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-slate-700">
        {field.label}
        {field.required ? <span className="text-red-500"> *</span> : null}
      </span>
      <input
        type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
        value={value}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="border border-slate-300 rounded px-2 py-1"
      />
    </label>
  );
};

const AddressPanel = ({
  address,
  onNormalize,
  result,
  error,
  loading,
}: {
  address: string | undefined;
  onNormalize: () => void;
  result: NjaResult | null;
  error: string | null;
  loading: boolean;
}): JSX.Element | null => {
  if (!address) {
    return null;
  }
  const point = result?.point;
  const openMap = (): void => {
    if (point) {
      void window.shell.openExternal(`https://www.google.com/maps?q=${point.lat},${point.lng}`);
    }
  };
  return (
    <div className="border-t border-slate-200 pt-3 mt-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-600">住所: {address}</span>
        <button
          type="button"
          onClick={onNormalize}
          disabled={loading}
          className="px-2 py-1 text-sm bg-emerald-600 text-white rounded disabled:opacity-50"
        >
          {loading ? '正規化中…' : '住所を正規化'}
        </button>
      </div>
      {error ? <div className="mt-2 text-sm text-red-600">{error}</div> : null}
      {result ? (
        <div className="mt-2 text-sm space-y-1">
          <div>
            <span className="inline-block px-2 py-0.5 mr-2 text-xs rounded bg-slate-200">
              level {result.level}
            </span>
            {result.pref} / {result.city} / {result.town}
          </div>
          <div className="text-slate-600">addr: {result.addr || '(なし)'}</div>
          <div className="text-slate-600">other: {result.other || '(なし)'}</div>
          {point ? (
            <div className="flex items-center gap-2">
              <span>
                lat: {point.lat}, lng: {point.lng}
              </span>
              <button
                type="button"
                onClick={openMap}
                className="px-2 py-0.5 text-xs bg-blue-600 text-white rounded"
              >
                Google Mapsで開く
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

const App = (): JSX.Element => {
  const [selectedId, setSelectedId] = useState<GBizChannel>('searchHojin');
  const [form, setForm] = useState<FormState>({});
  const [response, setResponse] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [nja, setNja] = useState<NjaResult | null>(null);
  const [njaError, setNjaError] = useState<string | null>(null);
  const [njaLoading, setNjaLoading] = useState(false);

  const endpoint = useMemo(
    () => ENDPOINTS.find((e) => e.id === selectedId) ?? ENDPOINTS[0]!,
    [selectedId],
  );

  const address = useMemo(
    () => extractFirstAddress(response, endpoint.addressFieldPaths),
    [response, endpoint],
  );

  const selectEndpoint = (id: GBizChannel): void => {
    setSelectedId(id);
    setForm({});
    setResponse(null);
    setError(null);
    setNja(null);
    setNjaError(null);
  };

  const onSend = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    setResponse(null);
    setNja(null);
    setNjaError(null);
    try {
      const params = buildParams(endpoint, form);
      const method = window.gbiz[endpoint.id] as (a: Record<string, unknown>) => Promise<unknown>;
      const data = await method(params);
      setResponse(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const onNormalize = async (): Promise<void> => {
    if (!address) {
      return;
    }
    setNjaLoading(true);
    setNjaError(null);
    setNja(null);
    try {
      const r = await window.nja.normalize(address);
      setNja(r);
    } catch (e) {
      setNjaError(e instanceof Error ? e.message : String(e));
    } finally {
      setNjaLoading(false);
    }
  };

  return (
    <div className="h-screen flex">
      <Sidebar selected={selectedId} onSelect={selectEndpoint} />
      <main className="flex-1 overflow-y-auto p-4">
        <h1 className="text-xl font-bold text-slate-800 mb-3">{endpoint.label}</h1>
        <div className="grid grid-cols-2 gap-3 mb-3">
          {endpoint.fields.map((f) => (
            <FieldInput
              key={f.name}
              field={f}
              value={form[f.name] ?? ''}
              onChange={(v) => setForm((prev) => ({ ...prev, [f.name]: v }))}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => void onSend()}
          disabled={loading}
          className="px-4 py-1.5 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          {loading ? '送信中…' : 'Send'}
        </button>

        {error ? (
          <div className="mt-3 p-2 bg-red-50 text-red-700 border border-red-200 rounded text-sm">
            {error}
          </div>
        ) : null}

        {response != null ? (
          <>
            <h2 className="mt-4 mb-2 text-sm font-semibold text-slate-700">Response</h2>
            {extractRows(response).rows.length > 0 ? (
              <>
                <ResponseTable data={response} endpoint={endpoint} />
                <details className="mt-3">
                  <summary className="text-xs text-slate-500 cursor-pointer select-none hover:text-slate-700">
                    生 JSON
                  </summary>
                  <div className="mt-2">
                    <JsonViewer data={response} />
                  </div>
                </details>
              </>
            ) : (
              <>
                <JsonViewer data={response} />
                <AddressPanel
                  address={address}
                  onNormalize={() => void onNormalize()}
                  result={nja}
                  error={njaError}
                  loading={njaLoading}
                />
              </>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
};

export default App;
