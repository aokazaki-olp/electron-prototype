/**
 * preload/index.ts
 * @description contextBridge 経由で renderer に AppApi を公開する
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../ipc/contract.js';
import type { AppApi, AppSettings } from '../ipc/contract.js';

const api: AppApi = {
  loadSettings: () => ipcRenderer.invoke(IPC.LOAD_SETTINGS),
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke(IPC.SAVE_SETTINGS, settings),
  poiSearch: (query: string) => ipcRenderer.invoke(IPC.POI_SEARCH, query),
};

contextBridge.exposeInMainWorld('sfx', api);
