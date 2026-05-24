/**
 * store.ts
 * @description Zustand グローバルストア。
 *   タブ永続化は localStorage を使わず、`window.sfx.saveTabs` 経由で main プロセスの
 *   electron-store に書く（CODING_RULES §7.3 遵守）。
 */

import { create } from 'zustand';
import type {
  SfConnectionProfile,
  SObjectSummary,
  SObjectDescribe,
  LogEntry,
  AppSettings,
  QueryResult,
  SoqlTabsState,
  ExecutionMode,
} from '@app/ipc-contract';

export interface SoqlTab {
  id: string;
  name: string;
  soql: string;
  result: QueryResult | null;
  fetchAll: boolean;
  /** 省略時は `rest` 扱い (旧データ・テストフィクスチャ互換)。 */
  executionMode?: ExecutionMode;
}

const DEFAULT_TAB: SoqlTab = { id: 'tab-1', name: 'クエリ 1', soql: '', result: null, fetchAll: false, executionMode: 'rest' };

// main から渡される LogEntry に seq があれば使う。テスト/旧データで欠ける場合は
// renderer 側でフォールバックの単調増加 ID を発番する。React の key 重複を避けるのが目的。
let fallbackLogSeq = 0;

/**
 * テスト専用: renderer 側 fallback seq カウンタをリセットする。
 * test isolation のため beforeEach で呼ぶ想定。本番コードから呼ばない。
 * @internal
 */
export const _resetFallbackLogSeqForTest = (): void => {
  fallbackLogSeq = 0;
};

interface AppStore {
  // 設定
  settings: AppSettings | null;
  profiles: SfConnectionProfile[];
  activeProfileId: string | null;
  authState: 'connected' | 'disconnected' | 'checking';

  // sObjectブラウザ
  sobjects: SObjectSummary[];
  selectedObject: string | null;
  sobjectsLoading: boolean;
  /**
   * 現在 selectedObject に対応する describe。SoqlEditor の補完で参照される。
   * SObjectBrowser が選択時に取得し、store に書き込む。
   */
  selectedObjectDescribe: SObjectDescribe | null;

  // SOQLエディタ（タブ）
  tabs: SoqlTab[];
  activeTabId: string;
  queryLoading: boolean;
  runTrigger: number;

  // ログビューアー
  logs: LogEntry[];

  // テーマ (useTheme hook が settings.theme + prefers-color-scheme から導出して書き込む)
  isDark: boolean;
  setIsDark: (v: boolean) => void;

  // アクション
  setSettings: (s: AppSettings) => void;
  setProfiles: (p: SfConnectionProfile[]) => void;
  setActiveProfileId: (id: string | null) => void;
  setAuthState: (s: AppStore['authState']) => void;
  setSobjects: (list: SObjectSummary[]) => void;
  setSelectedObject: (name: string | null) => void;
  setSobjectsLoading: (v: boolean) => void;
  setSelectedObjectDescribe: (d: SObjectDescribe | null) => void;
  setSoql: (s: string) => void;
  setTabExecutionMode: (mode: ExecutionMode) => void;
  /**
   * SOQL を active tab に書き込み、実行を trigger する。
   * `suggestedName` が渡された場合、active tab の name が初期パターン `クエリ N` のときに限り
   * 自動でリネームする（ユーザーが手で付けた名前は上書きしない）。
   */
  setSoqlAndRun: (soql: string, suggestedName?: string) => void;
  setTabFetchAll: (v: boolean) => void;
  setQueryLoading: (v: boolean) => void;
  incrementRunTrigger: () => void;
  appendLog: (entry: LogEntry) => void;
  setLogs: (entries: LogEntry[]) => void;
  setTabResult: (result: QueryResult | null) => void;
  addTab: () => void;
  addTabWithContent: (name: string, soql: string) => void;
  closeTab: (id: string) => void;
  setActiveTabId: (id: string) => void;
  renameTab: (id: string, name: string) => void;
  loadTabs: (tabs: SoqlTab[], activeTabId: string) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  settings: null,
  profiles: [],
  activeProfileId: null,
  authState: 'checking',
  sobjects: [],
  selectedObject: null,
  sobjectsLoading: false,
  selectedObjectDescribe: null,
  tabs: [DEFAULT_TAB],
  activeTabId: DEFAULT_TAB.id,
  queryLoading: false,
  runTrigger: 0,
  logs: [],
  isDark: false,

  setSettings: (settings) => set({ settings }),
  setIsDark: (isDark) => set({ isDark }),
  setProfiles: (profiles) => set({ profiles }),
  setActiveProfileId: (activeProfileId) => set({ activeProfileId }),
  setAuthState: (authState) => set({ authState }),
  setSobjects: (sobjects) => set({ sobjects }),
  setSelectedObject: (selectedObject) => set({ selectedObject }),
  setSobjectsLoading: (sobjectsLoading) => set({ sobjectsLoading }),
  setSelectedObjectDescribe: (selectedObjectDescribe) => set({ selectedObjectDescribe }),
  setSoql: (soql) => set((s) => {
    const active = s.tabs.find(t => t.id === s.activeTabId);
    if (!active || active.soql === soql) {
      return s;
    }
    return { tabs: s.tabs.map(t => t.id === s.activeTabId ? { ...t, soql } : t) };
  }),
  setSoqlAndRun: (soql, suggestedName) => set((s) => {
    const active = s.tabs.find(t => t.id === s.activeTabId);
    if (!active) {
      return s;
    }
    // ユーザーがリネーム済みのタブは上書きしない（既定パターン `クエリ N` だけ自動命名対象）
    const isDefaultName = /^クエリ \d+$/.test(active.name);
    const newName = suggestedName && isDefaultName ? suggestedName : active.name;
    const noChange = active.soql === soql && active.name === newName;
    const tabs = noChange
      ? s.tabs
      : s.tabs.map(t => t.id === s.activeTabId ? { ...t, soql, name: newName } : t);
    return { tabs, runTrigger: s.runTrigger + 1 };
  }),
  setTabFetchAll: (fetchAll) => set((s) => ({
    tabs: s.tabs.map(t => t.id === s.activeTabId ? { ...t, fetchAll } : t),
  })),
  setTabExecutionMode: (executionMode) => set((s) => ({
    tabs: s.tabs.map(t => t.id === s.activeTabId ? { ...t, executionMode } : t),
  })),
  setQueryLoading: (queryLoading) => set({ queryLoading }),
  incrementRunTrigger: () => set((s) => ({ runTrigger: s.runTrigger + 1 })),
  appendLog: (entry) => set((s) => {
    // seq が無ければ renderer フォールバック seq を付与する (React key の安定性のため)。
    const e: LogEntry = entry.seq != null ? entry : { ...entry, seq: ++fallbackLogSeq };
    // 保持上限は AppSettings.logBufferSize に従う。0 で無制限、未取得時は 1000 にフォールバック。
    const cap = s.settings?.logBufferSize ?? 1000;
    if (cap === 0) {
      return { logs: [...s.logs, e] };
    }
    // 既存の (cap - 1) 件 + 新規 1 件 = cap 件で安定
    return { logs: [...s.logs.slice(-(cap - 1)), e] };
  }),
  setLogs: (logs) => set({
    // 取得済み logs (initial getRecentLogs 等) にも seq を補完しておく
    logs: logs.map(l => l.seq != null ? l : { ...l, seq: ++fallbackLogSeq }),
  }),

  setTabResult: (result) => set((s) => ({
    tabs: s.tabs.map(t => t.id === s.activeTabId ? { ...t, result } : t),
  })),

  addTab: () => set((s) => {
    const id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const existingNums = s.tabs
      .map(t => {
        const m = t.name.match(/^クエリ (\d+)$/);
        return m ? Number(m[1]) : 0;
      })
      .filter(n => n > 0);
    const n = existingNums.length > 0 ? Math.max(...existingNums) + 1 : s.tabs.length + 1;
    const tab: SoqlTab = { id, name: `クエリ ${n}`, soql: '', result: null, fetchAll: false, executionMode: 'rest' };
    return { tabs: [...s.tabs, tab], activeTabId: id };
  }),

  addTabWithContent: (name, soql) => set((s) => {
    const id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const tab: SoqlTab = { id, name, soql, result: null, fetchAll: false, executionMode: 'rest' };
    return { tabs: [...s.tabs, tab], activeTabId: id };
  }),

  closeTab: (id) => set((s) => {
    if (s.tabs.length <= 1) {
      return s;
    }
    const idx = s.tabs.findIndex(t => t.id === id);
    const next = s.tabs.filter(t => t.id !== id);
    const nextActiveId = s.activeTabId === id
      ? (next[Math.max(0, idx - 1)]?.id ?? next[0].id)
      : s.activeTabId;
    return { tabs: next, activeTabId: nextActiveId };
  }),

  setActiveTabId: (activeTabId) => set({ activeTabId }),

  renameTab: (id, name) => set((s) => ({
    tabs: s.tabs.map(t => t.id === id ? { ...t, name } : t),
  })),

  loadTabs: (tabs, activeTabId) => set({ tabs, activeTabId }),
}));

// ============================================================================
// タブ永続化（CODING_RULES §7.3 遵守）
// ============================================================================

/**
 * `tabs` / `activeTabId` を IPC 経由で main プロセスの electron-store に保存する。
 * `result` フィールドは永続化対象から除外する（QueryResult はランタイムの揮発データ）。
 */
export const persistTabs = (state: Pick<AppStore, 'tabs' | 'activeTabId'>): SoqlTabsState => ({
  tabs: state.tabs.map(({ id, name, soql, fetchAll, executionMode }) => ({ id, name, soql, fetchAll, executionMode })),
  activeTabId: state.activeTabId,
});
