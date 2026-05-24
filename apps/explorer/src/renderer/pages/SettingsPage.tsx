import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Plus, Trash2, Edit2, Check, X, Wifi, AlertCircle } from 'lucide-react';
import { useAppStore } from '../store.js';
import type { SfConnectionProfile, AppSettings } from '@app/ipc-contract';

const DEFAULT_PROFILE: Omit<SfConnectionProfile, 'id'> = {
  name: '',
  loginUrl: 'https://login.salesforce.com',
  clientId: '',
  mode: 'readonly',
  writeSessionTimeoutMin: 15,
};

const newId = () => `profile-${Date.now()}`;

const toMode = (raw: string): SfConnectionProfile['mode'] =>
  raw === 'readwrite' ? 'readwrite' : 'readonly';

interface Props {
  onConnect: (profileId: string) => void;
  onClose?: () => void;
}

export const SettingsPage = ({ onConnect, onClose }: Props): JSX.Element => {
  // useShallow で必要フィールドのみ subscribe する。引数なし useAppStore() は store 全体を返すため、
  // ログ追加など無関係な更新で SettingsPage が毎回再レンダリングされる事故を防ぐ。
  const { profiles, setProfiles, settings, setSettings } = useAppStore(
    useShallow(s => ({
      profiles: s.profiles,
      setProfiles: s.setProfiles,
      settings: s.settings,
      setSettings: s.setSettings,
    }))
  );
  const [editing, setEditing] = useState<SfConnectionProfile | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [authErrors, setAuthErrors] = useState<Record<string, string>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const pendingSave = useRef<Promise<void> | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [loadedProfiles, loadedSettings] = await Promise.all([
          window.sfx.loadProfiles(),
          window.sfx.loadSettings(),
        ]);
        setProfiles(loadedProfiles);
        setSettings(loadedSettings);
      } catch (e) {
        setSaveError(`設定の読み込みに失敗しました: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    // 初回マウントのみで読み込む（setProfiles / setSettings は安定参照だが exhaustive-deps 警告対策）
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    try {
      await window.sfx.saveProfile(editing);
      const updated = await window.sfx.loadProfiles();
      setProfiles(updated);
      setEditing(null);
      setIsNew(false);
    } catch (e) {
      setSaveError(`プロファイル保存に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const deleteProfile = async (id: string) => {
    try {
      await window.sfx.deleteProfile(id);
      const updated = await window.sfx.loadProfiles();
      setProfiles(updated);
    } catch (e) {
      setSaveError(`プロファイル削除に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDeleteConfirm(null);
    }
  };

  const handleConnect = async (profile: SfConnectionProfile) => {
    setConnecting(profile.id);
    setAuthErrors(e => ({ ...e, [profile.id]: '' }));
    try {
      await window.sfx.startOAuth(profile.id);
      // store 更新は呼び出し側（App.tsx onConnect）に一元化する。
      // ここで setActiveProfileId / setAuthState すると二重伝播になる。
      onConnect(profile.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAuthErrors(er => ({ ...er, [profile.id]: msg }));
    } finally {
      setConnecting(null);
    }
  };

  // saveAppSettings は連打 race を避けるため in-flight save を待ってから次を投げる
  const saveAppSettings = async (patch: Partial<AppSettings>) => {
    if (!settings) return;
    const updated = { ...settings, ...patch };
    setSettings(updated); // 楽観更新
    if (pendingSave.current) {
      try { await pendingSave.current; } catch { /* 直前のエラーは個別に扱う */ }
    }
    const p = (async () => {
      try {
        await window.sfx.saveSettings(updated);
      } catch (e) {
        setSaveError(`設定保存に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
        // ロールバックは行わない（楽観更新の方針を維持し、後続の save で正規化される）
      }
    })();
    pendingSave.current = p;
    await p;
  };

  return (
    <div className="bg-slate-50 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Salesforce Explorer — 設定</h1>
          {onClose && (
            <button type="button" onClick={onClose} aria-label="設定を閉じる" className="text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>
          )}
        </div>

        {saveError && (
          <div role="alert" className="mb-4 flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-200 text-sm text-red-700 rounded">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            <span>{saveError}</span>
          </div>
        )}

        {/* 接続プロファイル */}
        <section className="bg-white rounded-lg border border-slate-200 mb-6">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
            <h2 className="font-semibold text-slate-700">接続プロファイル</h2>
            <button
              type="button"
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
                    onChange={e => setEditing(f => f && ({ ...f, mode: toMode(e.target.value) }))}
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
                <button type="button" onClick={cancelEdit} className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-800">
                  <X size={13} /> キャンセル
                </button>
                <button
                  type="button"
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
                    type="button"
                    onClick={() => handleConnect(p)}
                    disabled={connecting === p.id}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Wifi size={12} />
                    {connecting === p.id ? '接続中...' : '接続'}
                  </button>
                  <button type="button" onClick={() => startEdit(p)} aria-label={`${p.name} を編集`} className="text-slate-400 hover:text-blue-600">
                    <Edit2 size={14} />
                  </button>
                  <button type="button" onClick={() => setDeleteConfirm(p.id)} aria-label={`${p.name} を削除`} className="text-slate-400 hover:text-red-600">
                    <Trash2 size={14} />
                  </button>
                </div>
                {authErrors[p.id] && (
                  <div role="alert" className="mt-1 text-xs text-red-600">{authErrors[p.id]}</div>
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
            <div className="px-4 py-4 space-y-3">
              <label className="text-sm text-slate-700 block">
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
              <label className="text-sm text-slate-700 block">
                ログの保持件数
                <select
                  value={settings.logBufferSize}
                  onChange={e => saveAppSettings({ logBufferSize: Number(e.target.value) })}
                  className="ml-3 px-2 py-1 border border-slate-300 rounded text-sm outline-none focus:border-blue-500"
                >
                  {[500, 1000, 5000, 10000, 0].map(n => (
                    <option key={n} value={n}>{n === 0 ? '無制限' : n.toLocaleString()}</option>
                  ))}
                </select>
                <span className="ml-2 text-xs text-slate-400">無制限はメモリに注意</span>
              </label>
            </div>
          </section>
        )}
      </div>

      {/* 削除確認モーダル（confirm() の置換: アプリ内 UI に統一） */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-lg shadow-xl p-6 w-80"
          >
            <h3 id="delete-confirm-title" className="text-sm font-semibold text-slate-800 mb-2">プロファイルを削除</h3>
            <p className="text-sm text-slate-600 mb-4">この操作は取り消せません。続行しますか？</p>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setDeleteConfirm(null)} className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded">
                キャンセル
              </button>
              <button type="button" onClick={() => deleteProfile(deleteConfirm)} className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700">
                削除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
