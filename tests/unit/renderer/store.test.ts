/**
 * Zustand ストアのユニットテスト。
 * DOM 環境不要。タブ管理ロジックと状態遷移を検証する。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../../../src/renderer/store.js';
import { makeQueryResult } from '../../fixtures/contract.js';

const DEFAULT_TAB_ID = 'tab-1';

const resetStore = () => {
  useAppStore.setState({
    tabs: [{ id: DEFAULT_TAB_ID, name: 'クエリ 1', soql: '', result: null, fetchAll: false }],
    activeTabId: DEFAULT_TAB_ID,
    runTrigger: 0,
    sobjects: [],
    selectedObject: null,
    logs: [],
    queryLoading: false,
  });
};

describe('useAppStore — タブ管理', () => {
  beforeEach(resetStore);

  describe('addTab', () => {
    it('タブが追加される', () => {
      useAppStore.getState().addTab();
      expect(useAppStore.getState().tabs).toHaveLength(2);
    });

    it('追加したタブがアクティブになる', () => {
      useAppStore.getState().addTab();
      const { tabs, activeTabId } = useAppStore.getState();
      expect(activeTabId).toBe(tabs[1].id);
    });

    it('タブ名が連番になる', () => {
      useAppStore.getState().addTab();
      useAppStore.getState().addTab();
      const { tabs } = useAppStore.getState();
      expect(tabs[1].name).toBe('クエリ 2');
      expect(tabs[2].name).toBe('クエリ 3');
    });

    it('タブを閉じた後に追加しても番号が重複しない', () => {
      const { addTab, closeTab } = useAppStore.getState();
      addTab(); // クエリ 2
      addTab(); // クエリ 3
      const { tabs } = useAppStore.getState();
      closeTab(tabs[1].id); // クエリ 2 を削除
      addTab(); // クエリ 4 になるべき

      const after = useAppStore.getState().tabs;
      const names = after.map(t => t.name);
      expect(names).toContain('クエリ 4');
      const unique = new Set(names);
      expect(unique.size).toBe(names.length);
    });

    it('fetchAll はデフォルト false', () => {
      useAppStore.getState().addTab();
      const { tabs } = useAppStore.getState();
      expect(tabs[1].fetchAll).toBe(false);
    });
  });

  describe('closeTab', () => {
    it('タブが1つのときは閉じられない', () => {
      useAppStore.getState().closeTab(DEFAULT_TAB_ID);
      expect(useAppStore.getState().tabs).toHaveLength(1);
    });

    it('アクティブでない隣タブを閉じてもアクティブは変わらない', () => {
      useAppStore.getState().addTab();
      const { tabs } = useAppStore.getState();
      // tab[0] がアクティブのまま tab[1] を閉じる
      useAppStore.setState({ activeTabId: tabs[0].id });
      useAppStore.getState().closeTab(tabs[1].id);
      expect(useAppStore.getState().activeTabId).toBe(tabs[0].id);
    });

    it('アクティブタブを閉じると左隣がアクティブになる', () => {
      useAppStore.getState().addTab();
      const { tabs, closeTab } = useAppStore.getState();
      const [first, second] = tabs;
      useAppStore.setState({ activeTabId: second.id });
      closeTab(second.id);
      expect(useAppStore.getState().activeTabId).toBe(first.id);
    });
  });

  describe('renameTab', () => {
    it('指定したタブの名前が変わる', () => {
      useAppStore.getState().renameTab(DEFAULT_TAB_ID, '売上クエリ');
      const { tabs } = useAppStore.getState();
      expect(tabs[0].name).toBe('売上クエリ');
    });
  });

  describe('loadTabs', () => {
    it('タブと activeTabId が置き換わる', () => {
      const newTabs = [
        { id: 'x1', name: 'X1', soql: 'SELECT Id FROM Lead', result: null, fetchAll: false },
        { id: 'x2', name: 'X2', soql: '', result: null, fetchAll: true },
      ];
      useAppStore.getState().loadTabs(newTabs, 'x2');
      const { tabs, activeTabId } = useAppStore.getState();
      expect(tabs).toHaveLength(2);
      expect(activeTabId).toBe('x2');
      expect(tabs[1].fetchAll).toBe(true);
    });
  });
});

describe('useAppStore — SOQL 操作', () => {
  beforeEach(resetStore);

  it('setSoql でアクティブタブの soql が更新される', () => {
    useAppStore.getState().setSoql('SELECT Id FROM Account');
    const { tabs, activeTabId } = useAppStore.getState();
    const active = tabs.find(t => t.id === activeTabId);
    expect(active?.soql).toBe('SELECT Id FROM Account');
  });

  it('setTabFetchAll でアクティブタブの fetchAll が更新される', () => {
    useAppStore.getState().setTabFetchAll(true);
    const { tabs, activeTabId } = useAppStore.getState();
    const active = tabs.find(t => t.id === activeTabId);
    expect(active?.fetchAll).toBe(true);
  });

  it('setTabResult でアクティブタブの result が更新される', () => {
    const result = makeQueryResult({ totalSize: 5, fetchedCount: 5 });
    useAppStore.getState().setTabResult(result);
    const { tabs, activeTabId } = useAppStore.getState();
    const active = tabs.find(t => t.id === activeTabId);
    expect(active?.result).toEqual(result);
  });

  it('setTabResult は非アクティブタブには影響しない', () => {
    useAppStore.getState().addTab();
    const firstTabId = DEFAULT_TAB_ID;
    const { tabs, activeTabId } = useAppStore.getState();
    expect(activeTabId).not.toBe(firstTabId);

    const result = makeQueryResult({ totalSize: 3, fetchedCount: 3 });
    useAppStore.getState().setTabResult(result);

    const { tabs: after } = useAppStore.getState();
    const firstTab = after.find(t => t.id === firstTabId);
    expect(firstTab?.result).toBeNull();
  });
});

describe('useAppStore — runTrigger', () => {
  beforeEach(resetStore);

  it('incrementRunTrigger で runTrigger が +1 される', () => {
    const before = useAppStore.getState().runTrigger;
    useAppStore.getState().incrementRunTrigger();
    expect(useAppStore.getState().runTrigger).toBe(before + 1);
  });

  it('複数回 increment すると値が積み上がる', () => {
    const { incrementRunTrigger } = useAppStore.getState();
    incrementRunTrigger();
    incrementRunTrigger();
    incrementRunTrigger();
    expect(useAppStore.getState().runTrigger).toBe(3);
  });
});

describe('useAppStore — ログ', () => {
  beforeEach(resetStore);

  it('appendLog でログが追加される', () => {
    useAppStore.getState().appendLog({ date: '2026-01-01T00:00:00.000Z', level: 'info', text: 'テスト' });
    expect(useAppStore.getState().logs).toHaveLength(1);
  });

  it('1000件を超えたら古いログが捨てられる', () => {
    for (let i = 0; i < 1001; i++) {
      useAppStore.getState().appendLog({ date: new Date().toISOString(), level: 'debug', text: `log ${i}` });
    }
    expect(useAppStore.getState().logs.length).toBeLessThanOrEqual(1000);
  });
});
