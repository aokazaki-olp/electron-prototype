/**
 * App.tsx
 * @description 左ペイン（エンドポイント一覧）+ 右ペイン（入力フォーム・レスポンス・住所正規化）
 *              プロトタイプなので Redux 等は使わず useState のみ。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import { COMMON_FIELDS, ENDPOINTS, extractFirstAddress } from './endpoints.js';
import type { EndpointCategory, EndpointDef, FieldDef } from './endpoints.js';
import type { GBizChannel, NjaResult } from '../ipc/contract.js';
import { JsonViewer } from './JsonViewer.js';
import { ResponseTable, extractRows } from './ResponseTable.js';

type FormState = Record<string, string>;

const CATEGORIES = ['基本', '関連情報', '更新情報'] as const satisfies readonly EndpointCategory[];

const groupByCategory = (): Record<EndpointCategory, EndpointDef[]> => {
  const out: Record<EndpointCategory, EndpointDef[]> = { 基本: [], 関連情報: [], 更新情報: [] };
  for (const e of ENDPOINTS) {
    out[e.category].push(e);
  }
  return out;
};

// ============================================================================
// エラーメッセージの人間語化
// ============================================================================

const humanizeError = (msg: string): string => {
  if (msg.startsWith('HTTP 400')) return '入力値が不正です。パラメータを確認してください。';
  if (msg.startsWith('HTTP 401')) return '認証エラーです。APIトークンを確認してください。';
  if (msg.startsWith('HTTP 403')) return 'アクセス権限がありません。';
  if (msg.startsWith('HTTP 429')) return 'リクエスト制限に達しました。しばらく待ってから再試行してください。';
  if (msg.startsWith('HTTP 5')) return 'サーバーエラーが発生しました。しばらく待ってから再試行してください。';
  if (msg.toLowerCase().includes('retry') || msg.toLowerCase().includes('exhausted')) {
    return 'ネットワークエラーが繰り返し発生しました。接続を確認してください。';
  }
  return msg;
};

// ============================================================================
// フォームパラメータ構築
// ============================================================================

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
    } else if (f.type === 'date') {
      // gBizINFO v2 の updateInfo 系は yyyyMMdd を要求するため、'-' を除去して送る
      out[f.name] = raw.replace(/-/g, '');
    } else {
      out[f.name] = raw;
    }
  }
  return out;
};

// ============================================================================
// バリデーション
// ============================================================================

const validate = (endpoint: EndpointDef, form: FormState): string | null => {
  for (const f of endpoint.fields) {
    if (f.required && !form[f.name]) {
      return `「${f.label}」は必須項目です`;
    }
  }
  const from = form['from'];
  const to = form['to'];
  if (from && to && from > to) {
    return '期間開始日は期間終了日より前の日付を指定してください';
  }
  return null;
};

// ============================================================================
// 小コンポーネント
// ============================================================================

const Spinner = (): JSX.Element => (
  <svg
    className="animate-spin h-4 w-4"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

const Sidebar = ({
  selected,
  onSelect,
  corporateContext,
  onClearContext,
}: {
  selected: GBizChannel;
  onSelect: (id: GBizChannel) => void;
  corporateContext: string | null;
  onClearContext: () => void;
}): JSX.Element => {
  const grouped = useMemo(groupByCategory, []);
  return (
    <aside className="w-56 border-r border-slate-200 bg-slate-50 overflow-y-auto flex flex-col shrink-0">
      {corporateContext ? (
        <div className="p-3 bg-amber-50 border-b border-amber-200">
          <div className="text-xs font-semibold text-amber-700 mb-0.5">選択中の法人番号</div>
          <div className="font-mono text-xs text-amber-900 break-all">{corporateContext}</div>
          <button
            type="button"
            onClick={onClearContext}
            className="mt-1 text-xs text-amber-600 hover:underline"
          >
            クリア
          </button>
        </div>
      ) : null}
      {CATEGORIES.map((cat) => (
        <div key={cat} className="py-2">
          <div className="px-3 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wide">
            {cat}
          </div>
          {grouped[cat].map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => onSelect(e.id)}
              className={
                'block w-full text-left px-4 py-1.5 text-sm hover:bg-slate-200 transition-colors ' +
                (selected === e.id ? 'bg-slate-300 font-semibold text-slate-900' : 'text-slate-700')
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
      <label className="flex items-center gap-2 text-sm py-1">
        <input
          type="checkbox"
          checked={value === 'true'}
          onChange={(e) => onChange(e.target.checked ? 'true' : '')}
        />
        <span className="text-slate-700">{field.label}</span>
        {field.hint ? (
          <span
            title={field.hint}
            className="inline-flex items-center justify-center w-4 h-4 text-xs bg-slate-200 text-slate-500 rounded-full cursor-help shrink-0"
          >
            ?
          </span>
        ) : null}
      </label>
    );
  }
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-slate-700 flex items-center gap-1">
        {field.label}
        {field.required ? <span className="text-red-500">*</span> : null}
        {field.hint ? (
          <span
            title={field.hint}
            className="inline-flex items-center justify-center w-4 h-4 text-xs bg-slate-200 text-slate-500 rounded-full cursor-help shrink-0"
          >
            ?
          </span>
        ) : null}
      </span>
      <input
        type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
        value={value}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
      />
    </label>
  );
};

const AddressPanel = ({
  address,
  result,
  error,
  loading,
}: {
  address: string | undefined;
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
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-slate-600">住所: {address}</span>
        {loading ? (
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <Spinner />
            正規化中…
          </span>
        ) : null}
      </div>
      {error ? <div className="mt-2 text-sm text-red-600">{error}</div> : null}
      {result ? (
        <div className="mt-2 text-sm space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              title="住所の正規化レベル。8 = 番地まで確定、0 = 都道府県以下不明"
              className="inline-block px-2 py-0.5 text-xs rounded bg-slate-200 cursor-help"
            >
              level {result.level}
            </span>
            <span>{result.pref} / {result.city} / {result.town}</span>
          </div>
          {result.addr ? <div className="text-slate-600">番地: {result.addr}</div> : null}
          {result.other ? <div className="text-slate-600">その他: {result.other}</div> : null}
          {point ? (
            <div className="flex items-center gap-2">
              <span className="text-slate-500 text-xs">lat: {point.lat}, lng: {point.lng}</span>
              <button
                type="button"
                onClick={openMap}
                className="px-2 py-0.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Google Maps で開く
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

// ============================================================================
// App
// ============================================================================

const App = (): JSX.Element => {
  const [selectedId, setSelectedId] = useState<GBizChannel>('searchHojin');
  const [forms, setForms] = useState<Partial<Record<GBizChannel, FormState>>>({});
  const [lastCorporateNumber, setLastCorporateNumber] = useState<string | null>(null);
  const [response, setResponse] = useState<unknown>(null);
  const [responseTimestamp, setResponseTimestamp] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [nja, setNja] = useState<NjaResult | null>(null);
  const [njaError, setNjaError] = useState<string | null>(null);
  const [njaLoading, setNjaLoading] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState<Partial<Record<GBizChannel, boolean>>>({});
  const [toast, setToast] = useState<{ msg: string; key: number } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const endpoint = useMemo(
    () => ENDPOINTS.find((e) => e.id === selectedId) ?? ENDPOINTS[0],
    [selectedId],
  );

  const form: FormState = forms[selectedId] ?? {};
  const setField = (name: string, value: string): void => {
    setForms((prev) => ({
      ...prev,
      [selectedId]: { ...(prev[selectedId] ?? {}), [name]: value },
    }));
  };

  const address = useMemo(
    () => extractFirstAddress(response, endpoint.addressFieldPaths),
    [response, endpoint],
  );

  const { rows } = useMemo(() => extractRows(response), [response]);

  // フォームフィールドを 基本 / 詳細 / 共通 の3グループに分割する
  const sectionBreakIdx = endpoint.fields.findIndex((f) => f.sectionBreak);
  const regularEnd = endpoint.fields.length - COMMON_FIELDS.length;
  const basicFields = endpoint.fields.slice(0, sectionBreakIdx >= 0 ? sectionBreakIdx : regularEnd);
  const advancedFields = sectionBreakIdx >= 0 ? endpoint.fields.slice(sectionBreakIdx, regularEnd) : [];
  const commonFields = endpoint.fields.slice(regularEnd);
  const isAdvancedOpen = advancedOpen[selectedId] ?? false;

  const showToast = (msg: string): void => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    const key = Date.now();
    setToast({ msg, key });
    toastTimerRef.current = setTimeout(() => setToast(null), 2500);
  };

  const selectEndpoint = (id: GBizChannel): void => {
    setSelectedId(id);
    // corporate_number フィールドを持つエンドポイントへの切り替え時、
    // フォームが未入力の場合のみコンテキストから自動入力する
    if (lastCorporateNumber) {
      const newEndpoint = ENDPOINTS.find((e) => e.id === id);
      const hasCorporateField = newEndpoint?.fields.some((f) => f.name === 'corporate_number');
      if (hasCorporateField) {
        setForms((prev) => {
          const existing = prev[id];
          if (!existing?.corporate_number) {
            return { ...prev, [id]: { ...(existing ?? {}), corporate_number: lastCorporateNumber } };
          }
          return prev;
        });
      }
    }
    setResponse(null);
    setResponseTimestamp(null);
    setError(null);
    setNja(null);
    setNjaError(null);
  };

  const triggerNja = async (addr: string): Promise<void> => {
    setNjaLoading(true);
    setNjaError(null);
    setNja(null);
    try {
      const r = await window.nja.normalize(addr);
      setNja(r);
    } catch (e) {
      setNjaError(e instanceof Error ? e.message : String(e));
    } finally {
      setNjaLoading(false);
    }
  };

  const onSend = async (): Promise<void> => {
    const validationError = validate(endpoint, form);
    if (validationError) {
      setError(validationError);
      return;
    }
    setLoading(true);
    setError(null);
    setResponse(null);
    setResponseTimestamp(null);
    setNja(null);
    setNjaError(null);
    try {
      const params = buildParams(endpoint, form);
      // GBizApi の各メソッドはパラメータ型が異なるため共通シグネチャにキャストして呼び出す
      const method = window.gbiz[endpoint.id] as (a: Record<string, unknown>) => Promise<unknown>;
      const data = await method(params);
      setResponse(data);
      setResponseTimestamp(new Date());
      // 単体レスポンス（テーブル非表示）で住所が抽出できる場合は自動正規化する
      const extractedAddr = extractFirstAddress(data, endpoint.addressFieldPaths);
      if (extractedAddr && extractRows(data).rows.length === 0) {
        void triggerNja(extractedAddr);
      }
    } catch (e) {
      setError(humanizeError(e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCorporate = (corpNumber: string): void => {
    setLastCorporateNumber(corpNumber);
    showToast(`法人番号 ${corpNumber} を設定しました。他のエンドポイントに切り替えると自動入力されます。`);
  };

  // レスポンスがクリアされたら NJA 結果もリセットする
  useEffect(() => {
    if (response == null) {
      setNja(null);
      setNjaError(null);
    }
  }, [response]);

  const sendLabel = endpoint.sendLabel ?? '取得';

  return (
    <div className="h-screen flex">
      <Sidebar
        selected={selectedId}
        onSelect={selectEndpoint}
        corporateContext={lastCorporateNumber}
        onClearContext={() => setLastCorporateNumber(null)}
      />

      <main
        className="flex-1 overflow-y-auto p-5"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !loading) {
            void onSend();
          }
        }}
      >
        {/* ヘッダー */}
        <div className="mb-4">
          <h1 className="text-lg font-bold text-slate-800">{endpoint.label}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{endpoint.description}</p>
        </div>

        {/* 基本フィールド */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          {basicFields.map((f) => (
            <div key={f.name} className={f.required && f.type !== 'checkbox' ? 'col-span-2' : ''}>
              <FieldInput field={f} value={form[f.name] ?? ''} onChange={(v) => setField(f.name, v)} />
            </div>
          ))}
        </div>

        {/* 詳細条件（折りたたみ）*/}
        {advancedFields.length > 0 ? (
          <details
            open={isAdvancedOpen}
            onToggle={(e) =>
              setAdvancedOpen((prev) => ({ ...prev, [selectedId]: e.currentTarget.open }))
            }
            className="mb-3 border border-slate-200 rounded p-3 bg-slate-50"
          >
            <summary className="text-xs font-medium text-slate-500 cursor-pointer select-none hover:text-slate-700 list-none flex items-center gap-1">
              <span className="text-slate-400">{isAdvancedOpen ? '▲' : '▼'}</span>
              詳細条件
              <span className="text-slate-400 font-normal ml-1">（{advancedFields.length}項目）</span>
            </summary>
            <div className="grid grid-cols-2 gap-3 mt-3">
              {advancedFields.map((f) => (
                <FieldInput
                  key={f.name}
                  field={f}
                  value={form[f.name] ?? ''}
                  onChange={(v) => setField(f.name, v)}
                />
              ))}
            </div>
          </details>
        ) : null}

        {/* 共通フィールド（metadata_flg など） */}
        {commonFields.length > 0 ? (
          <div className="flex flex-wrap gap-4 mb-3">
            {commonFields.map((f) => (
              <FieldInput
                key={f.name}
                field={f}
                value={form[f.name] ?? ''}
                onChange={(v) => setField(f.name, v)}
              />
            ))}
          </div>
        ) : null}

        {/* 送信ボタン */}
        <div className="flex items-center gap-3 mb-1">
          <button
            type="button"
            onClick={() => void onSend()}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 font-medium text-sm transition-colors"
          >
            {loading ? (
              <>
                <Spinner />
                {sendLabel === '検索' ? '検索中…' : '取得中…'}
              </>
            ) : (
              sendLabel
            )}
          </button>
          <span className="text-xs text-slate-400">Ctrl+Enter でも送信できます</span>
        </div>

        {/* バリデーション / API エラー */}
        {error ? (
          <div className="mt-3 p-3 bg-red-50 text-red-700 border border-red-200 rounded text-sm">
            {error}
          </div>
        ) : null}

        {/* 初期ガイダンス（未送信・エラーなし） */}
        {response == null && !error && !loading ? (
          <div className="mt-10 text-center text-slate-400">
            <p className="text-sm">条件を入力して「{sendLabel}」を押してください</p>
            {selectedId === 'searchHojin' ? (
              <p className="text-xs mt-2">
                まず法人名で検索し、結果行の「選択」ボタンで法人番号を取得するとスムーズです
              </p>
            ) : null}
          </div>
        ) : null}

        {/* レスポンス表示 */}
        {response != null ? (
          <>
            <div className="flex items-center gap-3 mt-5 mb-2">
              <h2 className="text-sm font-semibold text-slate-700">レスポンス</h2>
              {responseTimestamp ? (
                <span className="text-xs text-slate-400">
                  {responseTimestamp.toLocaleTimeString('ja-JP')}
                </span>
              ) : null}
            </div>

            {rows.length > 0 ? (
              <>
                <ResponseTable
                  key={endpoint.id}
                  data={response}
                  endpoint={endpoint}
                  onSelectCorporate={handleSelectCorporate}
                />
                <details className="mt-3">
                  <summary className="text-xs text-slate-500 cursor-pointer select-none hover:text-slate-700">
                    詳細データ（JSON）
                  </summary>
                  <div className="mt-2">
                    <JsonViewer data={response} />
                  </div>
                </details>
              </>
            ) : (
              <>
                {isResponseEmpty(response) ? (
                  <p className="mb-2 text-sm text-slate-500">
                    該当するデータはありませんでした。条件を変えて再検索してください。
                  </p>
                ) : null}
                <JsonViewer data={response} />
                <AddressPanel
                  address={address}
                  result={nja}
                  error={njaError}
                  loading={njaLoading}
                />
              </>
            )}
          </>
        ) : null}
      </main>

      {/* トースト通知 */}
      {toast ? (
        <div
          key={toast.key}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-slate-800 text-white text-sm rounded-lg shadow-lg max-w-sm text-center"
        >
          {toast.msg}
        </div>
      ) : null}
    </div>
  );
};

/** レスポンスが空配列しか持たない場合（該当データなし）を検出する */
const isResponseEmpty = (data: unknown): boolean => {
  if (data == null || typeof data !== 'object') {
    return false;
  }
  return Object.values(data as Record<string, unknown>).some(
    (v) => Array.isArray(v) && v.length === 0,
  );
};

export default App;
