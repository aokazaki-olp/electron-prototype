/**
 * store.ts
 * @description Zustand グローバルストア
 */

import { create } from 'zustand';
import type { SfConnectionProfile, SObjectSummary, LogEntry, AppSettings } from '../ipc/contract.js';

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

  // SOQLエディタ
  soql: string;
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
  setQueryLoading: (v: boolean) => void;
  incrementRunTrigger: () => void;
  appendLog: (entry: LogEntry) => void;
  setLogs: (entries: LogEntry[]) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  settings: null,
  profiles: [],
  activeProfileId: null,
  authState: 'checking',
  sobjects: [],
  selectedObject: null,
  sobjectsLoading: false,
  soql: '',
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
  setSoql: (soql) => set({ soql }),
  setQueryLoading: (queryLoading) => set({ queryLoading }),
  incrementRunTrigger: () => set((s) => ({ runTrigger: s.runTrigger + 1 })),
  appendLog: (entry) => set((s) => ({ logs: [...s.logs.slice(-999), entry] })),
  setLogs: (logs) => set({ logs }),
}));
