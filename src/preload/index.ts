/**
 * preload/index.ts
 * @description contextBridge 経由で renderer に SalesforceExplorerApi を公開する
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../ipc/contract.js';
import type { SalesforceExplorerApi, LogEntry, CsvExportOptions, SfConnectionProfile, AppSettings } from '../ipc/contract.js';

const api: SalesforceExplorerApi = {
  // 設定
  loadSettings: () => ipcRenderer.invoke(IPC.LOAD_SETTINGS),
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke(IPC.SAVE_SETTINGS, settings),
  loadProfiles: () => ipcRenderer.invoke(IPC.LOAD_PROFILES),
  saveProfile: (profile: SfConnectionProfile) => ipcRenderer.invoke(IPC.SAVE_PROFILE, profile),
  deleteProfile: (id: string) => ipcRenderer.invoke(IPC.DELETE_PROFILE, id),

  // 認証
  startOAuth: (profileId: string) => ipcRenderer.invoke(IPC.START_OAUTH, profileId),
  reauthForWrite: (profileId: string) => ipcRenderer.invoke(IPC.REAUTH_FOR_WRITE, profileId),
  disconnect: (profileId: string) => ipcRenderer.invoke(IPC.DISCONNECT, profileId),
  getAuthState: (profileId: string) => ipcRenderer.invoke(IPC.GET_AUTH_STATE, profileId),

  // SF API（読み取り）
  listSObjects: () => ipcRenderer.invoke(IPC.LIST_SOBJECTS),
  describeObject: (name: string) => ipcRenderer.invoke(IPC.DESCRIBE_OBJECT, name),
  query: (soql: string, maxRows: number) => ipcRenderer.invoke(IPC.QUERY, soql, maxRows),

  // SF API（書き込み）
  createRecord: (objectName: string, fields: Record<string, unknown>) =>
    ipcRenderer.invoke(IPC.CREATE_RECORD, objectName, fields),
  updateRecord: (objectName: string, id: string, fields: Record<string, unknown>) =>
    ipcRenderer.invoke(IPC.UPDATE_RECORD, objectName, id, fields),
  deleteRecord: (objectName: string, id: string) =>
    ipcRenderer.invoke(IPC.DELETE_RECORD, objectName, id),

  // SOQLファイル
  saveSoqlFile: (soql: string, defaultName: string) =>
    ipcRenderer.invoke(IPC.SAVE_SOQL_FILE, soql, defaultName),
  openSoqlFile: () => ipcRenderer.invoke(IPC.OPEN_SOQL_FILE),

  // エクスポート
  exportCsv: (records: Record<string, unknown>[], columns: string[], options: CsvExportOptions) =>
    ipcRenderer.invoke(IPC.EXPORT_CSV, records, columns, options),
  exportQueryExcel: (records: Record<string, unknown>[], columns: string[]) =>
    ipcRenderer.invoke(IPC.EXPORT_QUERY_EXCEL, records, columns),
  exportObjectDefinition: (objectName: string) =>
    ipcRenderer.invoke(IPC.EXPORT_OBJECT_DEFINITION, objectName),

  // ログ
  getRecentLogs: (limit?: number) => ipcRenderer.invoke(IPC.GET_RECENT_LOGS, limit),
  onLogEntry: (callback: (entry: LogEntry) => void) => {
    const handler = (_: unknown, entry: LogEntry) => callback(entry);
    ipcRenderer.on(IPC.LOG_ENTRY, handler);
    return () => ipcRenderer.removeListener(IPC.LOG_ENTRY, handler);
  },
  rendererLog: (level: string, text: string) => {
    ipcRenderer.send(IPC.RENDERER_LOG, level, text);
  },
};

contextBridge.exposeInMainWorld('sfx', api);

// テストモード専用: Playwright から IPC テストセットアップを呼び出せるブリッジ
if (process.env['NODE_ENV'] === 'test') {
  contextBridge.exposeInMainWorld('__testSetup__', (data: unknown) =>
    ipcRenderer.invoke('test:setup', data),
  );
}
