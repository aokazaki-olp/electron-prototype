/**
 * useTheme.ts
 * @description AppSettings.theme から実際の dark/light を解決して
 *   `document.documentElement` に `dark` クラスを付け外しする。
 *
 *   - `'light'` / `'dark'` は明示モード。
 *   - `'system'` は `prefers-color-scheme: dark` を購読して追従する。
 *
 *   一度だけ install する（App ルート）。SoqlEditor の CodeMirror などは
 *   この hook が返す `isDark` を購読して表示テーマを切替える。
 */
import { useEffect } from 'react';
import { useAppStore } from '../store.js';

const computeIsDark = (theme: 'light' | 'dark' | 'system'): boolean => {
  if (theme === 'dark') {
    return true;
  }
  if (theme === 'light') {
    return false;
  }
  // 'system': prefers-color-scheme
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

const apply = (isDark: boolean): void => {
  document.documentElement.classList.toggle('dark', isDark);
  useAppStore.getState().setIsDark(isDark);
};

export const useTheme = (): void => {
  const theme = useAppStore(s => s.settings?.theme ?? 'system');

  useEffect(() => {
    apply(computeIsDark(theme));

    // 'system' の場合のみ matchMedia を購読し、OS 側の変更で再評価する
    if (theme !== 'system') {
      return;
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => apply(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);
};
