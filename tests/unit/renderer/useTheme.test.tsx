// @vitest-environment happy-dom
/**
 * useTheme.ts のテスト。
 *   settings.theme と prefers-color-scheme から documentElement の `dark` クラスを
 *   付け外しすることを検証する。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { useTheme } from '../../../apps/explorer/src/renderer/hooks/useTheme.js';
import { useAppStore } from '../../../apps/explorer/src/renderer/store.js';

const Harness = (): JSX.Element => {
  useTheme();
  return <div />;
};

const setMatchMedia = (matches: boolean): { listeners: Array<(e: MediaQueryListEvent) => void> } => {
  const listeners: Array<(e: MediaQueryListEvent) => void> = [];
  const fakeMql = {
    matches,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_type: 'change', cb: (e: MediaQueryListEvent) => void) => listeners.push(cb),
    removeEventListener: vi.fn(),
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
  // happy-dom の matchMedia を差し替え
  vi.stubGlobal('matchMedia', () => fakeMql);
  return { listeners };
};

const fullSettings = (theme: 'light' | 'dark' | 'system') => ({
  defaultMaxRows: 2000,
  logBufferSize: 1000,
  paneSizes: { leftPanel: 18, soqlPanel: 40 },
  theme,
});

beforeEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.classList.remove('dark');
  useAppStore.setState({ settings: null, isDark: false });
});

describe('useTheme', () => {
  it('theme=dark で documentElement に dark クラスが付く', () => {
    useAppStore.setState({ settings: fullSettings('dark') });
    setMatchMedia(false);
    render(<Harness />);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(useAppStore.getState().isDark).toBe(true);
  });

  it('theme=light で dark クラスが外れる', () => {
    useAppStore.setState({ settings: fullSettings('light') });
    document.documentElement.classList.add('dark');
    setMatchMedia(true);
    render(<Harness />);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(useAppStore.getState().isDark).toBe(false);
  });

  it('theme=system で prefers-color-scheme: dark が真なら dark になる', () => {
    useAppStore.setState({ settings: fullSettings('system') });
    setMatchMedia(true);
    render(<Harness />);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('theme=system で OS 側 prefers が後から変わると追従する', () => {
    useAppStore.setState({ settings: fullSettings('system') });
    const { listeners } = setMatchMedia(false);
    render(<Harness />);
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    // OS 側が dark に切り替わる
    for (const fn of listeners) {
      fn({ matches: true } as MediaQueryListEvent);
    }
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('settings 未取得時は system 扱いで matchMedia 結果に従う', () => {
    useAppStore.setState({ settings: null });
    setMatchMedia(true);
    render(<Harness />);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
