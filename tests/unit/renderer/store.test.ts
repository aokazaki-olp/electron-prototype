// @vitest-environment happy-dom
/**
 * Zustand ストアのユニットテスト。
 * 他の renderer テストとプラグマを揃えて happy-dom で実行する
 * (環境変数 globs を廃止したため明示する)。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore, persistTabs } from '../../../apps/explorer/src/renderer/store.js';
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

    it('末尾アクティブタブを閉じても直前タブにフォーカスが移る（idx-1 の境界）', () => {
      useAppStore.getState().addTab();
      useAppStore.getState().addTab();
      const { tabs } = useAppStore.getState();
      // tabs[2] がアクティブ。末尾を閉じる
      useAppStore.setState({ activeTabId: tabs[2].id });
      useAppStore.getState().closeTab(tabs[2].id);
      expect(useAppStore.getState().activeTabId).toBe(tabs[1].id);
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

  it('setSoql は同値スキップで参照同一性を保つ', () => {
    useAppStore.getState().setSoql('SELECT Id FROM Account');
    const before = useAppStore.getState().tabs;
    useAppStore.getState().setSoql('SELECT Id FROM Account');
    const after = useAppStore.getState().tabs;
    expect(after).toBe(before);
  });

  it('setSoqlAndRun で runTrigger が +1 される', () => {
    const before = useAppStore.getState().runTrigger;
    useAppStore.getState().setSoqlAndRun('SELECT Id FROM Account');
    const after = useAppStore.getState().runTrigger;
    expect(after).toBe(before + 1);
    const { tabs, activeTabId } = useAppStore.getState();
    expect(tabs.find(t => t.id === activeTabId)?.soql).toBe('SELECT Id FROM Account');
  });

  it('setSoqlAndRun は soql 同値でも runTrigger を増やす', () => {
    useAppStore.getState().setSoql('SELECT Id FROM Account');
    const before = useAppStore.getState().runTrigger;
    useAppStore.getState().setSoqlAndRun('SELECT Id FROM Account');
    expect(useAppStore.getState().runTrigger).toBe(before + 1);
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

describe('persistTabs — 永続化シリアライズ', () => {
  beforeEach(resetStore);

  it('result フィールドは含まない', () => {
    useAppStore.getState().setTabResult(makeQueryResult({ totalSize: 10, fetchedCount: 10 }));
    const { tabs, activeTabId } = useAppStore.getState();
    const persisted = persistTabs({ tabs, activeTabId });
    expect(persisted.tabs[0]).not.toHaveProperty('result');
    expect(persisted.tabs[0]).toHaveProperty('id');
    expect(persisted.tabs[0]).toHaveProperty('name');
    expect(persisted.tabs[0]).toHaveProperty('soql');
    expect(persisted.tabs[0]).toHaveProperty('fetchAll');
  });

  it('activeTabId をそのまま含める', () => {
    useAppStore.getState().addTab();
    const { tabs, activeTabId } = useAppStore.getState();
    const persisted = persistTabs({ tabs, activeTabId });
    expect(persisted.activeTabId).toBe(activeTabId);
  });
});

// ============================================================
// エッジケース
// ============================================================

describe('useAppStore — タブ管理エッジケース', () => {
  beforeEach(resetStore);

  it('100 タブまで追加してもパフォーマンス劣化なく動く', () => {
    const { addTab } = useAppStore.getState();
    for (let i = 0; i < 100; i++) {
      addTab();
    }
    expect(useAppStore.getState().tabs).toHaveLength(101);
  });

  it('renameTab に空文字は無効化 (店子の責務だが、現状は通る → 仕様確認テスト)', () => {
    useAppStore.getState().renameTab(DEFAULT_TAB_ID, '   ');
    // store 層では trim 検証しない（UI 層が trim する責務）
    expect(useAppStore.getState().tabs[0].name).toBe('   ');
  });

  it('closeTab で存在しない ID を指定しても変化しない', () => {
    useAppStore.getState().addTab();
    const before = useAppStore.getState().tabs;
    useAppStore.getState().closeTab('nonexistent-id');
    expect(useAppStore.getState().tabs).toEqual(before);
  });

  it('setActiveTabId は存在しない ID も受け入れる (UI 側の整合は呼び出し責務)', () => {
    useAppStore.getState().setActiveTabId('ghost-id');
    expect(useAppStore.getState().activeTabId).toBe('ghost-id');
  });

  it('closeTab で中間タブを削除すると左隣にフォーカス移動', () => {
    useAppStore.getState().addTab(); // tab[1]
    useAppStore.getState().addTab(); // tab[2]
    const tabs = useAppStore.getState().tabs;
    useAppStore.setState({ activeTabId: tabs[1].id });
    useAppStore.getState().closeTab(tabs[1].id);
    // 中間 (idx=1) を消すと idx-1 = tabs[0] にフォーカス
    expect(useAppStore.getState().activeTabId).toBe(tabs[0].id);
    expect(useAppStore.getState().tabs).toHaveLength(2);
  });

  it('setSoql で非アクティブタブの soql は変わらない', () => {
    useAppStore.getState().addTab();
    const firstId = DEFAULT_TAB_ID;
    useAppStore.getState().setSoql('SELECT FROM new');
    const firstTab = useAppStore.getState().tabs.find(t => t.id === firstId);
    expect(firstTab?.soql).toBe('');
  });

  it('loadTabs で空配列を渡しても store は破壊されない (型上は受け入れる)', () => {
    useAppStore.getState().loadTabs([], 'x');
    // store 層は空配列を受け入れるが、closeTab で 1 件未満は防御される
    expect(useAppStore.getState().tabs).toEqual([]);
    expect(useAppStore.getState().activeTabId).toBe('x');
  });
});

describe('useAppStore — ログのエッジケース', () => {
  beforeEach(resetStore);

  it('setLogs で全置換できる', () => {
    useAppStore.getState().appendLog({ date: '2026-01-01', level: 'info', text: 'a' });
    useAppStore.getState().setLogs([
      { date: '2026-02-01', level: 'error', text: 'replaced' },
    ]);
    const logs = useAppStore.getState().logs;
    expect(logs).toHaveLength(1);
    expect(logs[0].text).toBe('replaced');
  });

  it('setLogs([]) でクリアできる', () => {
    useAppStore.getState().appendLog({ date: 'd', level: 'info', text: 'x' });
    useAppStore.getState().setLogs([]);
    expect(useAppStore.getState().logs).toEqual([]);
  });

  it('appendLog は immutable: 既存配列を破壊しない', () => {
    useAppStore.getState().appendLog({ date: 'd1', level: 'info', text: 'a' });
    const before = useAppStore.getState().logs;
    useAppStore.getState().appendLog({ date: 'd2', level: 'info', text: 'b' });
    const after = useAppStore.getState().logs;
    expect(after).not.toBe(before);
    expect(before).toHaveLength(1);
  });
});

describe('useAppStore — auth / settings', () => {
  beforeEach(resetStore);

  it('setActiveProfileId に null を渡せる (disconnect 経路)', () => {
    useAppStore.getState().setActiveProfileId('p1');
    useAppStore.getState().setActiveProfileId(null);
    expect(useAppStore.getState().activeProfileId).toBeNull();
  });

  it('setAuthState は checking → connected → disconnected を遷移可能', () => {
    useAppStore.getState().setAuthState('connected');
    expect(useAppStore.getState().authState).toBe('connected');
    useAppStore.getState().setAuthState('disconnected');
    expect(useAppStore.getState().authState).toBe('disconnected');
    useAppStore.getState().setAuthState('checking');
    expect(useAppStore.getState().authState).toBe('checking');
  });
});

describe('persistTabs — エッジケース', () => {
  beforeEach(resetStore);

  it('タブが 0 件でも形を保つ (loadTabs で空にしたあと)', () => {
    useAppStore.getState().loadTabs([], 'orphan');
    const { tabs, activeTabId } = useAppStore.getState();
    const persisted = persistTabs({ tabs, activeTabId });
    expect(persisted.tabs).toEqual([]);
    expect(persisted.activeTabId).toBe('orphan');
  });

  it('多くのタブをまとめて persist しても result は除外される', () => {
    for (let i = 0; i < 5; i++) {
      useAppStore.getState().addTab();
    }
    useAppStore.getState().setTabResult(makeQueryResult({ fetchedCount: 99 }));
    const { tabs, activeTabId } = useAppStore.getState();
    const persisted = persistTabs({ tabs, activeTabId });
    for (const t of persisted.tabs) {
      expect(t).not.toHaveProperty('result');
    }
  });
});
