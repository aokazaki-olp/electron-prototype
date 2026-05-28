import { useState } from 'react';
import { Check } from 'lucide-react';
import { useAppStore } from '../store.js';

interface Props {
  onClose?: () => void;
}

export const SettingsPage = ({ onClose }: Props): JSX.Element => {
  const { settings, setSettings } = useAppStore();
  const [appId, setAppId] = useState(settings?.yahooAppId ?? '');
  const [saving, setSaving] = useState(false);

  const save = async (): Promise<void> => {
    setSaving(true);
    const updated = { ...settings, yahooAppId: appId.trim() };
    await window.sfx.saveSettings(updated);
    setSettings(updated);
    setSaving(false);
    onClose?.();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
      <div className="bg-white rounded-lg border border-slate-200 w-full max-w-md">
        <div className="px-6 py-4 border-b border-slate-200">
          <h1 className="font-semibold text-slate-800">POI検索 — 設定</h1>
        </div>
        <div className="px-6 py-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Yahoo! アプリケーションID
            </label>
            <input
              type="text"
              value={appId}
              onChange={e => setAppId(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && appId.trim()) save(); }}
              placeholder="Yahoo! Developer Network で取得した Client ID"
              className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono text-sm outline-none focus:border-blue-500"
              autoFocus
            />
            <p className="mt-1.5 text-xs text-slate-400">
              e.developer.yahoo.co.jp でサーバサイドアプリとして登録し、発行された Client ID を入力してください
            </p>
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            {onClose && (
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
              >
                キャンセル
              </button>
            )}
            <button
              onClick={save}
              disabled={!appId.trim() || saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              <Check size={14} /> {saving ? '保存中...' : '保存して開始'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
