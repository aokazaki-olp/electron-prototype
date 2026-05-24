/**
 * Toast.tsx
 * @description アプリ全体で共通利用するトースト通知。
 *   従来は各画面で inline `role="alert"` を散らしていたが、視線移動が大きく一貫性も欠けていた。
 *   ここでは zustand store に集約して右下固定の stack として表示する。
 *
 * - error / warn は永続（手動 dismiss のみ）
 * - info / success は 4 秒で自動消去
 *
 * Provider を採用していないのは、テスト時の wrap を不要にする実利のため。
 */
import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export type ToastLevel = 'error' | 'warn' | 'info' | 'success';

export interface Toast {
  id: string;
  level: ToastLevel;
  message: string;
}

interface ToastStore {
  toasts: Toast[];
  push: (level: ToastLevel, message: string) => void;
  dismiss: (id: string) => void;
}

const AUTO_DISMISS_MS = 4000;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (level, message) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((s) => ({ toasts: [...s.toasts, { id, level, message }] }));
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));

/**
 * 任意の場所からトーストを表示する関数。React hook ではないため、
 * イベントハンドラ・useEffect・catch 節等から直接呼べる。
 */
export const showToast = (level: ToastLevel, message: string): void => {
  useToastStore.getState().push(level, message);
};

const LEVEL_STYLE: Record<ToastLevel, { container: string; icon: JSX.Element }> = {
  error:   { container: 'bg-red-50 border-red-300 text-red-800 dark:bg-red-950/80 dark:border-red-700 dark:text-red-100',                 icon: <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-red-600 dark:text-red-400" /> },
  warn:    { container: 'bg-yellow-50 border-yellow-300 text-yellow-800 dark:bg-yellow-950/80 dark:border-yellow-700 dark:text-yellow-100', icon: <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 text-yellow-600 dark:text-yellow-400" /> },
  info:    { container: 'bg-blue-50 border-blue-300 text-blue-800 dark:bg-blue-950/80 dark:border-blue-700 dark:text-blue-100',             icon: <Info size={16} className="flex-shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" /> },
  success: { container: 'bg-green-50 border-green-300 text-green-800 dark:bg-green-950/80 dark:border-green-700 dark:text-green-100',       icon: <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5 text-green-600 dark:text-green-400" /> },
};

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

const ToastItem = ({ toast, onDismiss }: ToastItemProps): JSX.Element => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // info / success は 4 秒で自動消去。error / warn は手動 dismiss のみ。
  useEffect(() => {
    if (toast.level === 'error' || toast.level === 'warn') return;
    timerRef.current = setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.id, toast.level, onDismiss]);

  const style = LEVEL_STYLE[toast.level];

  return (
    <div
      role="alert"
      className={`flex items-start gap-2 px-3 py-2 border rounded shadow-lg text-sm min-w-72 max-w-md pointer-events-auto ${style.container}`}
    >
      {style.icon}
      <span className="flex-1 break-words">{toast.message}</span>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="通知を閉じる"
        className="flex-shrink-0 mt-0.5 text-current opacity-60 hover:opacity-100"
      >
        <X size={14} />
      </button>
    </div>
  );
};

export const ToastContainer = (): JSX.Element => {
  const toasts = useToastStore(s => s.toasts);
  const dismiss = useToastStore(s => s.dismiss);

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
      ))}
    </div>
  );
};
