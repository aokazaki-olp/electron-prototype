/**
 * store.ts
 * @description Zustand グローバルストア
 */

import { create } from 'zustand';
import type { AppSettings } from '../ipc/contract.js';

interface AppStore {
  settings: AppSettings | null;
  setSettings: (s: AppSettings) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  settings: null,
  setSettings: (settings) => set({ settings }),
}));
