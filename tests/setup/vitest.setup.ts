import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';
import { makeMockSfx } from '../mocks/sfx.js';
import { useToastStore } from '../../apps/explorer/src/renderer/components/Toast.js';

// @tanstack/react-virtual は happy-dom で viewport=0 になり 0 件描画になる。
// テスト時は仮想化を無効化して全件描画する mock に差し替える。
// （仮想化自体のテストは E2E に任せ、unit ではコンポーネントの本質を検証する）
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: <T>(opts: { count: number; estimateSize: () => number }) => {
    const size = opts.estimateSize();
    const items = Array.from({ length: opts.count }, (_, i) => ({
      index: i,
      start: i * size,
      end: (i + 1) * size,
      size,
      key: i,
      lane: 0,
    }));
    return {
      getVirtualItems: () => items,
      getTotalSize: () => opts.count * size,
      scrollToIndex: () => {},
      _: undefined as unknown as T,
    };
  },
}));

// renderer 環境（happy-dom）では window.sfx を最初に一度セットしておく。
// preload 経由でしか取得できない実 sfx の代わりに、契約準拠のモックを置く。
// setupFiles 内では beforeEach が runner 外で評価されエラーになるため、
// モジュール load 時 + afterEach で毎回作り直す方式を取る。
if (typeof window !== 'undefined') {
  (window as unknown as { sfx?: unknown }).sfx = makeMockSfx();

  // virtualizer mock 後も Element 系 API は依然必要になる可能性があるため、
  // getBoundingClientRect だけは大きい viewport を返すよう noop パッチ。
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      width: 1000, height: 1000, top: 0, left: 0, right: 1000, bottom: 1000, x: 0, y: 0,
      toJSON: () => ({}),
    }),
  });

  if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
    (globalThis as { ResizeObserver: unknown }).ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  if (typeof window !== 'undefined') {
    (window as unknown as { sfx?: unknown }).sfx = makeMockSfx();
  }
  // 共有 toast store はテスト間で漏れるため明示的にクリアする
  useToastStore.setState({ toasts: [] });
});
