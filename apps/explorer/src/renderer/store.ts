/**
 * store.ts
 * @description Zustand グローバルストア
 */

import { create } from 'zustand';
import type { SfConnectionProfile, SObjectSummary, LogEntry, AppSettings, QueryResult } from '@app/ipc-contract';

export interface SoqlTab {
  id: string;
  name: string;
  soql: string;
  result: QueryResult | null;
  fetchAll: boolean;
}

const DEFAULT_TAB: SoqlTab = { id: 'tab-1', name: 'クエリ 1', soql: '', result: null, fetchAll: false };

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

  // SOQLエディタ（タブ）
  tabs: SoqlTab[];
  activeTabId: string;
  queryLoading: boolean;
  runTrigger: number;

  // ログビューアー
  logs: LogEntry[];

  // アクション
  setSettings: (s: AppSettings) => void;
  setProfiles: (p: SfConnectionProfile[]) => void;
  setActiveProfileId: (id: string | null) => void;
  setAuthState: (s: AppStore['authState']) => void;
  setSobjects: (list: SObjectSummary[]) => void;
  setSelectedObject: (name: string | null) => void;
  setSobjectsLoading: (v: boolean) => void;
  setSoql: (s: string) => void;
  setSoqlAndRun: (soql: string) => void;
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

export const useAppStore = create<AppStore>((set, get) => ({
  settings: null,
  profiles: [],
  activeProfileId: null,
  authState: 'checking',
  sobjects: [],
  selectedObject: null,
  sobjectsLoading: false,
  tabs: [DEFAULT_TAB],
  activeTabId: DEFAULT_TAB.id,
  queryLoading: false,
  runTrigger: 0,
  logs: [],

  setSettings: (settings) => set({ settings }),
  setProfiles: (profiles) => set({ profiles }),
  setActiveProfileId: (activeProfileId) => set({ activeProfileId }),
  setAuthState: (authState) => set({ authState }),
  setSobjects: (sobjects) => set({ sobjects }),
  setSelectedObject: (selectedObject) => set({ selectedObject }),
  setSobjectsLoading: (sobjectsLoading) => set({ sobjectsLoading }),
  setSoql: (soql) => set((s) => {
    const active = s.tabs.find(t => t.id === s.activeTabId);
    if (!active || active.soql === soql) return s;
    return { tabs: s.tabs.map(t => t.id === s.activeTabId ? { ...t, soql } : t) };
  }),
  setSoqlAndRun: (soql) => set((s) => {
    const active = s.tabs.find(t => t.id === s.activeTabId);
    if (!active) return s;
    const tabs = active.soql === soql
      ? s.tabs
      : s.tabs.map(t => t.id === s.activeTabId ? { ...t, soql } : t);
    return { tabs, runTrigger: s.runTrigger + 1 };
  }),
  setTabFetchAll: (fetchAll) => set((s) => ({
    tabs: s.tabs.map(t => t.id === s.activeTabId ? { ...t, fetchAll } : t),
  })),
  setQueryLoading: (queryLoading) => set({ queryLoading }),
  incrementRunTrigger: () => set((s) => ({ runTrigger: s.runTrigger + 1 })),
  appendLog: (entry) => set((s) => ({ logs: [...s.logs.slice(-999), entry] })),
  setLogs: (logs) => set({ logs }),

  setTabResult: (result) => set((s) => ({
    tabs: s.tabs.map(t => t.id === s.activeTabId ? { ...t, result } : t),
  })),

  addTab: () => set((s) => {
    const id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const existingNums = s.tabs
      .map(t => { const m = t.name.match(/^クエリ (\d+)$/); return m ? Number(m[1]) : 0; })
      .filter(n => n > 0);
    const n = existingNums.length > 0 ? Math.max(...existingNums) + 1 : s.tabs.length + 1;
    const tab: SoqlTab = { id, name: `クエリ ${n}`, soql: '', result: null, fetchAll: false };
    return { tabs: [...s.tabs, tab], activeTabId: id };
  }),

  addTabWithContent: (name, soql) => set((s) => {
    const id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const tab: SoqlTab = { id, name, soql, result: null, fetchAll: false };
    return { tabs: [...s.tabs, tab], activeTabId: id };
  }),

  closeTab: (id) => set((s) => {
    if (s.tabs.length <= 1) return s;
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
