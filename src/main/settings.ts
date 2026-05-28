/**
 * settings.ts
 * @description アプリ設定の永続化（electron-store）
 */

import Store from 'electron-store';
import type { AppSettings } from '../ipc/contract.js';

interface StoreSchema {
  settings: AppSettings;
}

const DEFAULT_SETTINGS: AppSettings = {};

const store = new Store<StoreSchema>({
  name: 'poi-search',
  defaults: {
    settings: DEFAULT_SETTINGS,
  },
});

export const loadSettings = (): AppSettings =>
  store.get('settings', DEFAULT_SETTINGS);

export const saveSettings = (settings: AppSettings): void => {
  store.set('settings', settings);
};
