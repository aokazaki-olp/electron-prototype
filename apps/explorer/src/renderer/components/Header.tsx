import { Settings, LogOut } from 'lucide-react';
import type { SfConnectionProfile } from '@app/ipc-contract';
import { detectEnvironment, type Environment } from '../utils/detectEnvironment.js';

// detectEnvironment は utils に切り出し済 (Header.test.tsx などからも参照可能にするため)。
// re-export して既存 import (`from '../components/Header'`) との互換性を保つ。
export { detectEnvironment } from '../utils/detectEnvironment.js';

const ENV_BADGE: Record<Environment, { label: string; className: string }> = {
  production: { label: 'Production', className: 'bg-red-700 text-red-50 border border-red-500' },
  sandbox:    { label: 'Sandbox',    className: 'bg-blue-700 text-blue-50 border border-blue-500' },
  scratch:    { label: 'Scratch',    className: 'bg-purple-700 text-purple-50 border border-purple-500' },
  custom:     { label: 'My Domain',  className: 'bg-slate-600 text-slate-200 border border-slate-500' },
};

interface Props {
  activeProfile: SfConnectionProfile | undefined;
  onSettings: () => void;
  onDisconnect: () => void;
}

/**
 * アプリ上部のヘッダー。アプリ名 / org 名 / 環境バッジ / モードバッジ / 設定・切断ボタンを表示する。
 *
 * 書き込み可モード時はヘッダー帯全体を orange に変えて事故防止の視認性を上げる
 * (バッジの強調と合わせて二重防御)。
 */
export const Header = ({ activeProfile, onSettings, onDisconnect }: Props): JSX.Element => {
  const isWriteMode = activeProfile?.mode === 'readwrite';
  const headerBg = isWriteMode ? 'bg-orange-800' : 'bg-slate-800';
  const buttonHover = isWriteMode ? 'hover:bg-orange-700' : 'hover:bg-slate-700';
  const env = activeProfile ? detectEnvironment(activeProfile.loginUrl) : null;
  const envBadge = env ? ENV_BADGE[env] : null;

  return (
    <header className={`flex items-center gap-3 px-4 py-2 text-white flex-shrink-0 ${headerBg}`}>
      <span className="font-semibold text-sm">Salesforce Explorer</span>
      {activeProfile && (
        <>
          <span className="text-slate-400 text-xs">|</span>
          <span className="text-sm text-slate-100" title={activeProfile.loginUrl}>
            {activeProfile.name}
          </span>
          {envBadge && (
            <span
              className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${envBadge.className}`}
              title={`接続先: ${activeProfile.loginUrl}`}
            >
              {envBadge.label}
            </span>
          )}
          <span
            className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
              isWriteMode
                ? 'bg-orange-200 text-orange-900 border border-orange-300'
                : 'bg-slate-600 text-slate-200 border border-slate-500'
            }`}
          >
            {isWriteMode ? '書き込み可' : '読み取り専用'}
          </span>
        </>
      )}
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onSettings}
          className={`flex items-center gap-1 text-xs text-slate-100 hover:text-white px-2 py-1 rounded ${buttonHover}`}
        >
          <Settings size={13} /> 設定
        </button>
        <button
          type="button"
          onClick={onDisconnect}
          className={`flex items-center gap-1 text-xs text-slate-100 hover:text-white px-2 py-1 rounded ${buttonHover}`}
        >
          <LogOut size={13} /> 切断
        </button>
      </div>
    </header>
  );
};
