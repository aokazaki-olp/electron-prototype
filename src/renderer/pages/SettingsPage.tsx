import { useEffect, useState } from 'react';
import { Plus, Trash2, Edit2, Check, X, Wifi, MapPin } from 'lucide-react';
import { useAppStore } from '../store.js';
import type { SfConnectionProfile, AppSettings } from '../../ipc/contract.js';

const DEFAULT_PROFILE: Omit<SfConnectionProfile, 'id'> = {
  name: '',
  loginUrl: 'https://login.salesforce.com',
  clientId: '',
  mode: 'readonly',
  writeSessionTimeoutMin: 15,
};

const newId = () => `profile-${Date.now()}`;

interface Props {
  onConnect: (profileId: string) => void;
  onPoiSearch: () => void;
}

export const SettingsPage = ({ onConnect, onPoiSearch }: Props): JSX.Element => {
  const { profiles, setProfiles, settings, setSettings, setActiveProfileId, setAuthState } = useAppStore();
  const [editing, setEditing] = useState<SfConnectionProfile | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [authErrors, setAuthErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    window.sfx.loadProfiles().then(setProfiles);
    window.sfx.loadSettings().then(setSettings);
  }, []);

  const startNew = () => {
    setEditing({ id: newId(), ...DEFAULT_PROFILE });
    setIsNew(true);
  };

  const startEdit = (profile: SfConnectionProfile) => {
    setEditing({ ...profile });
    setIsNew(false);
  };

  const cancelEdit = () => {
    setEditing(null);
    setIsNew(false);
  };

  const saveEdit = async () => {
    if (!editing || !editing.name.trim() || !editing.clientId.trim()) return;
    await window.sfx.saveProfile(editing);
    const updated = await window.sfx.loadProfiles();
    setProfiles(updated);
    setEditing(null);
    setIsNew(false);
  };

  const deleteProfile = async (id: string) => {
    if (!confirm('このプロファイルを削除しますか？')) return;
    await window.sfx.deleteProfile(id);
    const updated = await window.sfx.loadProfiles();
    setProfiles(updated);
  };

  const handleConnect = async (profile: SfConnectionProfile) => {
    setConnecting(profile.id);
    setAuthErrors(e => ({ ...e, [profile.id]: '' }));
    try {
      await window.sfx.startOAuth(profile.id);
      setActiveProfileId(profile.id);
      setAuthState('connected');
      onConnect(profile.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAuthErrors(er => ({ ...er, [profile.id]: msg }));
      setAuthState('disconnected');
    } finally {
      setConnecting(null);
    }
  };

  const saveAppSettings = async (patch: Partial<AppSettings>) => {
    const updated = { ...settings!, ...patch };
    setSettings(updated);
    await window.sfx.saveSettings(updated);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-800 mb-6">Salesforce Explorer — 設定</h1>

        {/* 接続プロファイル */}
        <section className="bg-white rounded-lg border border-slate-200 mb-6">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
            <h2 className="font-semibold text-slate-700">接続プロファイル</h2>
            <button
              onClick={startNew}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
            >
              <Plus size={14} /> 追加
            </button>
          </div>

          {/* 新規・編集フォーム */}
          {editing && (
            <div className="p-4 bg-blue-50 border-b border-slate-200">
              <p className="text-sm font-medium text-slate-700 mb-3">
                {isNew ? '新規プロファイル' : '編集'}
              </p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <label className="col-span-2">
                  <span className="block text-slate-600 mb-1">プロファイル名 *</span>
                  <input
                    type="text"
                    value={editing.name}
                    onChange={e => setEditing(f => f && ({ ...f, name: e.target.value }))}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded outline-none focus:border-blue-500"
                    placeholder="本番org"
                  />
                </label>
                <label className="col-span-2">
                  <span className="block text-slate-600 mb-1">ログインURL</span>
                  <input
                    type="text"
                    value={editing.loginUrl}
                    onChange={e => setEditing(f => f && ({ ...f, loginUrl: e.target.value }))}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded outline-none focus:border-blue-500"
                  />
                </label>
                <label className="col-span-2">
                  <span className="block text-slate-600 mb-1">Consumer Key (Client ID) *</span>
                  <input
                    type="text"
                    value={editing.clientId}
                    onChange={e => setEditing(f => f && ({ ...f, clientId: e.target.value }))}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded font-mono text-xs outline-none focus:border-blue-500"
                    placeholder="3MVG9..."
                  />
                </label>
                <label>
                  <span className="block text-slate-600 mb-1">モード</span>
                  <select
                    value={editing.mode}
                    onChange={e => setEditing(f => f && ({ ...f, mode: e.target.value as SfConnectionProfile['mode'] }))}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded outline-none focus:border-blue-500"
                  >
                    <option value="readonly">読み取り専用</option>
                    <option value="readwrite">読み取り/書き込み</option>
                  </select>
                </label>
                {editing.mode === 'readwrite' && (
                  <label>
                    <span className="block text-slate-600 mb-1">書き込みセッション有効期間</span>
                    <select
                      value={editing.writeSessionTimeoutMin}
                      onChange={e => setEditing(f => f && ({ ...f, writeSessionTimeoutMin: Number(e.target.value) }))}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded outline-none focus:border-blue-500"
                    >
                      <option value={0}>毎回確認</option>
                      <option value={5}>5分</option>
                      <option value={15}>15分</option>
                      <option value={30}>30分</option>
                      <option value={60}>1時間</option>
                    </select>
                  </label>
                )}
              </div>
              <div className="flex gap-2 mt-3 justify-end">
                <button onClick={cancelEdit} className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-800">
                  <X size={13} /> キャンセル
                </button>
                <button
                  onClick={saveEdit}
                  disabled={!editing.name.trim() || !editing.clientId.trim()}
                  className="flex items-center gap-1 text-sm px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  <Check size={13} /> 保存
                </button>
              </div>
            </div>
          )}

          {/* プロファイル一覧 */}
          {profiles.length === 0 && !editing ? (
            <div className="px-4 py-6 text-center text-sm text-slate-400">
              プロファイルがありません。「追加」から作成してください。
            </div>
          ) : (
            profiles.map(p => (
              <div key={p.id} className="px-4 py-3 border-b border-slate-100 last:border-0">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800 truncate">{p.name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        p.mode === 'readonly'
                          ? 'bg-slate-100 text-slate-500'
                          : 'bg-orange-100 text-orange-600'
                      }`}>
                        {p.mode === 'readonly' ? '読み取り専用' : '読み書き'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 truncate">{p.loginUrl}</div>
                  </div>
                  <button
                    onClick={() => handleConnect(p)}
                    disabled={connecting === p.id}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Wifi size={12} />
                    {connecting === p.id ? '接続中...' : '接続'}
                  </button>
                  <button onClick={() => startEdit(p)} className="text-slate-400 hover:text-blue-600">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => deleteProfile(p.id)} className="text-slate-400 hover:text-red-600">
                    <Trash2 size={14} />
                  </button>
                </div>
                {authErrors[p.id] && (
                  <div className="mt-1 text-xs text-red-600">{authErrors[p.id]}</div>
                )}
              </div>
            ))
          )}
        </section>

        {/* アプリ設定 */}
        {settings && (
          <section className="bg-white rounded-lg border border-slate-200">
            <div className="px-4 py-3 border-b border-slate-200">
              <h2 className="font-semibold text-slate-700">クエリ設定</h2>
            </div>
            <div className="px-4 py-4">
              <label className="text-sm text-slate-700">
                デフォルト最大取得件数
                <select
                  value={settings.defaultMaxRows}
                  onChange={e => saveAppSettings({ defaultMaxRows: Number(e.target.value) })}
                  className="ml-3 px-2 py-1 border border-slate-300 rounded text-sm outline-none focus:border-blue-500"
                >
                  {[500, 1000, 2000, 5000, 10000, 0].map(n => (
                    <option key={n} value={n}>{n === 0 ? '無制限' : n.toLocaleString()}</option>
                  ))}
                </select>
              </label>
            </div>
          </section>
        )}

        {/* POI検索 */}
        {settings && (
          <section className="bg-white rounded-lg border border-slate-200">
            <div className="px-4 py-3 border-b border-slate-200">
              <h2 className="font-semibold text-slate-700">POI検索（Yahoo! API）</h2>
            </div>
            <div className="px-4 py-4 space-y-4">
              <label className="block text-sm text-slate-700">
                <span className="block mb-1">Yahoo! アプリケーションID</span>
                <input
                  type="text"
                  value={settings.yahooAppId ?? ''}
                  onChange={e => saveAppSettings({ yahooAppId: e.target.value })}
                  placeholder="Yahoo! Developer Network で取得した AppID"
                  className="w-full px-2 py-1.5 border border-slate-300 rounded font-mono text-xs outline-none focus:border-blue-500"
                />
              </label>
              <button
                onClick={onPoiSearch}
                disabled={!settings.yahooAppId?.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                <MapPin size={13} /> POI検索テストを開く
              </button>
              {!settings.yahooAppId?.trim() && (
                <p className="text-xs text-slate-400">AppIDを入力すると検索テストが使えます</p>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
