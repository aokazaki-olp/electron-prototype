// @vitest-environment happy-dom
/**
 * useGlobalKeybindings.ts のテスト。Ctrl+T / Ctrl+W / Ctrl+Tab を中心に
 * IME composition 中スキップ・最後の 1 タブを閉じない等の境界を検証する。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { useGlobalKeybindings } from '../../../apps/explorer/src/renderer/hooks/useGlobalKeybindings.js';
import { useAppStore } from '../../../apps/explorer/src/renderer/store.js';

const Harness = (): JSX.Element => {
  useGlobalKeybindings();
  return <div />;
};

const seedTabs = (count: number, activeIndex = 0): void => {
  const tabs = Array.from({ length: count }, (_, i) => ({
    id: `t${i + 1}`,
    name: `クエリ ${i + 1}`,
    soql: '',
    result: null,
    fetchAll: false,
  }));
  useAppStore.setState({ tabs, activeTabId: tabs[activeIndex]!.id });
};

const dispatch = (key: string, opts: KeyboardEventInit = {}): void => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }));
};

beforeEach(() => {
  cleanup();
  seedTabs(1);
});

describe('useGlobalKeybindings', () => {
  it('Ctrl+T で新規タブが追加される', () => {
    render(<Harness />);
    expect(useAppStore.getState().tabs).toHaveLength(1);
    dispatch('t', { ctrlKey: true });
    expect(useAppStore.getState().tabs).toHaveLength(2);
  });

  it('IME composition 中の Ctrl+T は無視される', () => {
    render(<Harness />);
    dispatch('t', { ctrlKey: true, isComposing: true });
    expect(useAppStore.getState().tabs).toHaveLength(1);
  });

  it('Ctrl+W はタブが 2 件以上のときアクティブタブを閉じる', () => {
    seedTabs(3, 1);
    render(<Harness />);
    expect(useAppStore.getState().tabs).toHaveLength(3);
    expect(useAppStore.getState().activeTabId).toBe('t2');

    dispatch('w', { ctrlKey: true });

    const after = useAppStore.getState();
    expect(after.tabs).toHaveLength(2);
    expect(after.tabs.find(t => t.id === 't2')).toBeUndefined();
  });

  it('Ctrl+W はタブが 1 件のとき何もしない', () => {
    render(<Harness />);
    dispatch('w', { ctrlKey: true });
    expect(useAppStore.getState().tabs).toHaveLength(1);
  });

  it('Ctrl+Tab で次のタブにアクティブが移る', () => {
    seedTabs(3, 0);
    render(<Harness />);
    expect(useAppStore.getState().activeTabId).toBe('t1');

    dispatch('Tab', { ctrlKey: true });
    expect(useAppStore.getState().activeTabId).toBe('t2');

    dispatch('Tab', { ctrlKey: true });
    expect(useAppStore.getState().activeTabId).toBe('t3');

    // 末尾は最初に戻る
    dispatch('Tab', { ctrlKey: true });
    expect(useAppStore.getState().activeTabId).toBe('t1');
  });

  it('Ctrl+Shift+Tab で前のタブにアクティブが移る (先頭は末尾に回り込む)', () => {
    seedTabs(3, 0);
    render(<Harness />);
    dispatch('Tab', { ctrlKey: true, shiftKey: true });
    expect(useAppStore.getState().activeTabId).toBe('t3');
  });

  it('Cmd (metaKey) でも同じく動作する (macOS 想定)', () => {
    render(<Harness />);
    dispatch('t', { metaKey: true });
    expect(useAppStore.getState().tabs).toHaveLength(2);
  });

  it('修飾なしの T 単独打鍵では何も起きない', () => {
    render(<Harness />);
    dispatch('t');
    expect(useAppStore.getState().tabs).toHaveLength(1);
  });
});
