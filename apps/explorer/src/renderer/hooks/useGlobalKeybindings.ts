/**
 * useGlobalKeybindings.ts
 * @description App ルートに 1 つだけ install するグローバルキーバインド。
 *
 * 対応キー (B7 グローバルショートカット):
 * - `Ctrl/Cmd + T`         → 新規タブ
 * - `Ctrl/Cmd + W`         → アクティブタブを閉じる（タブが 2 件以上のとき）
 * - `Ctrl/Cmd + Tab`       → 次のタブへ
 * - `Ctrl/Cmd + Shift + Tab` → 前のタブへ
 *
 * IME composition 中 (`isComposing`) は誤発火を避けるため必ずスキップする。
 * input / textarea / contenteditable にフォーカスがある場合でも、Ctrl/Cmd 修飾を持つこれらのキーは
 * テキスト編集の標準ショートカット (Ctrl+A/C/V/X/Z/Y/S) と衝突しないため有効化する。
 *
 * Ctrl+P / Ctrl+K / Ctrl+/ は将来のコマンドパレット用に予約 (本実装は別 commit)。
 */
import { useEffect } from 'react';
import { useAppStore } from '../store.js';

const isShortcutKey = (e: KeyboardEvent): boolean => e.ctrlKey || e.metaKey;

export const useGlobalKeybindings = (): void => {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      // IME composition 中の Enter / 文字キーで暴発しないよう必ず先に弾く
      if (e.isComposing) return;
      if (!isShortcutKey(e)) return;

      const key = e.key.toLowerCase();
      const store = useAppStore.getState();

      // Ctrl+Tab / Ctrl+Shift+Tab — タブ切替
      if (e.key === 'Tab') {
        const tabs = store.tabs;
        if (tabs.length <= 1) return;
        const idx = tabs.findIndex(t => t.id === store.activeTabId);
        if (idx < 0) return;
        const delta = e.shiftKey ? -1 : 1;
        const nextIdx = (idx + delta + tabs.length) % tabs.length;
        e.preventDefault();
        store.setActiveTabId(tabs[nextIdx]!.id);
        return;
      }

      // Ctrl+T — 新規タブ
      if (key === 't' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        store.addTab();
        return;
      }

      // Ctrl+W — アクティブタブを閉じる
      if (key === 'w' && !e.shiftKey && !e.altKey) {
        if (store.tabs.length <= 1) return; // 最後の 1 枚は残す
        e.preventDefault();
        store.closeTab(store.activeTabId);
        return;
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);
};
