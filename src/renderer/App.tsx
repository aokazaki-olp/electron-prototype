import { useState, useCallback } from 'react';
import type { ConnectParams, QueryResult } from '../ipc/contract.js';

type Screen = 'connect' | 'explorer';

const INITIAL_SOQL = 'SELECT Id, Name FROM Account LIMIT 10';

const formatCell = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

interface ResultTableProps {
  result: QueryResult;
}

const ResultTable = ({ result }: ResultTableProps): JSX.Element => {
  if (result.records.length === 0) {
    return <p className="mt-4 text-sm text-slate-500">レコードが見つかりませんでした。</p>;
  }

  const columns = Object.keys(result.records[0]).filter(k => k !== 'attributes');

  return (
    <div className="mt-4 overflow-auto rounded border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="sticky top-0 bg-slate-100">
          <tr>
            {columns.map(col => (
              <th
                key={col}
                className="border-b border-slate-200 px-3 py-2 text-left font-medium text-slate-700"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.records.map((record, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
              {columns.map(col => (
                <td
                  key={col}
                  className="border-b border-slate-100 px-3 py-2 font-mono text-xs text-slate-700"
                >
                  {formatCell(record[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const App = (): JSX.Element => {
  const [screen, setScreen] = useState<Screen>('connect');
  const [instanceUrl, setInstanceUrl] = useState('');
  const [form, setForm] = useState<ConnectParams>({
    consumerKey: '',
    username: '',
    privateKey: '',
    tokenHost: '',
  });
  const [soql, setSoql] = useState(INITIAL_SOQL);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [querying, setQuerying] = useState(false);

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    setError('');
    try {
      const res = await window.salesforce.connect(form);
      setInstanceUrl(res.instanceUrl);
      setScreen('explorer');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  }, [form]);

  const handleQuery = useCallback(async () => {
    setQuerying(true);
    setError('');
    setResult(null);
    try {
      const res = await window.salesforce.query(soql);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setQuerying(false);
    }
  }, [soql]);

  const handleDisconnect = useCallback(async () => {
    await window.salesforce.disconnect();
    setScreen('connect');
    setResult(null);
    setError('');
  }, []);

  if (screen === 'connect') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="w-full max-w-lg rounded-lg bg-white p-8 shadow-md">
          <h1 className="mb-6 text-2xl font-bold text-slate-800">Salesforce Explorer</h1>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Consumer Key</label>
              <input
                type="text"
                value={form.consumerKey}
                onChange={e => setForm(f => ({ ...f, consumerKey: e.target.value }))}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="External Client App の Consumer Key"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">ユーザー名</label>
              <input
                type="text"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="integration@example.com"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Token Host (My Domain URL)
              </label>
              <input
                type="text"
                value={form.tokenHost}
                onChange={e => setForm(f => ({ ...f, tokenHost: e.target.value }))}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://yourorg.my.salesforce.com"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                秘密鍵 (PEM / PKCS#8)
              </label>
              <textarea
                value={form.privateKey}
                onChange={e => setForm(f => ({ ...f, privateKey: e.target.value }))}
                rows={6}
                className="w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={'-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----'}
                spellCheck={false}
              />
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            onClick={handleConnect}
            disabled={connecting}
            className="mt-6 w-full rounded bg-blue-600 py-2 font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {connecting ? '接続中...' : '接続'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div>
          <h1 className="text-lg font-bold text-slate-800">Salesforce Explorer</h1>
          <p className="text-xs text-slate-500">{instanceUrl}</p>
        </div>
        <button
          onClick={handleDisconnect}
          className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:text-slate-800"
        >
          切断
        </button>
      </header>

      <main className="flex flex-1 flex-col p-6">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <label className="mb-2 block text-sm font-medium text-slate-700">SOQL クエリ</label>
          <textarea
            value={soql}
            onChange={e => setSoql(e.target.value)}
            rows={4}
            className="w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            spellCheck={false}
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={handleQuery}
              disabled={querying}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {querying ? '実行中...' : '実行'}
            </button>
            {result && (
              <span className="text-sm text-slate-600">
                {result.totalSize.toLocaleString()} 件
                {!result.done && ' (部分取得)'}
              </span>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {result && <ResultTable result={result} />}
      </main>
    </div>
  );
};

export default App;
