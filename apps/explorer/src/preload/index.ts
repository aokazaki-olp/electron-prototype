/**
 * preload/index.ts (Explorer)
 * @description contextBridge 経由で renderer に SalesforceExplorerApi を公開する。
 *   §11.3 に従い、起動時に EXPECTED_API_KEYS との差分を assert する自己検証を行う。
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IPC, EXPECTED_API_KEYS } from '@app/ipc-contract';
import type {
  SalesforceExplorerApi,
  LogEntry,
  CsvExportOptions,
  SfConnectionProfile,
  AppSettings,
  LogLevel,
  SoqlTabsState,
  ColumnSizesState,
} from '@app/ipc-contract';

const api = {
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
  bulkQuery: (soql: string) => ipcRenderer.invoke(IPC.BULK_QUERY, soql),

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

  // SOQL タブ永続化
  loadTabs: () => ipcRenderer.invoke(IPC.LOAD_TABS),
  saveTabs: (state: SoqlTabsState) => ipcRenderer.invoke(IPC.SAVE_TABS, state),

  // 列幅永続化
  loadColumnSizes: () => ipcRenderer.invoke(IPC.LOAD_COLUMN_SIZES),
  saveColumnSizes: (state: ColumnSizesState) => ipcRenderer.invoke(IPC.SAVE_COLUMN_SIZES, state),

  // エクスポート
  exportCsv: (records: Record<string, unknown>[], columns: string[], options: CsvExportOptions) =>
    ipcRenderer.invoke(IPC.EXPORT_CSV, records, columns, options),
  exportQueryExcel: (records: Record<string, unknown>[], columns: string[]) =>
    ipcRenderer.invoke(IPC.EXPORT_QUERY_EXCEL, records, columns),
  exportObjectDefinition: (objectName: string) =>
    ipcRenderer.invoke(IPC.EXPORT_OBJECT_DEFINITION, objectName),
  exportLogFile: (logs: LogEntry[]) =>
    ipcRenderer.invoke(IPC.EXPORT_LOG_FILE, logs),

  // ログ
  getRecentLogs: (limit?: number) => ipcRenderer.invoke(IPC.GET_RECENT_LOGS, limit),
  onLogEntry: (callback: (entry: LogEntry) => void) => {
    const handler = (_: unknown, entry: LogEntry) => callback(entry);
    ipcRenderer.on(IPC.LOG_ENTRY, handler);
    return () => ipcRenderer.removeListener(IPC.LOG_ENTRY, handler);
  },
  rendererLog: (level: LogLevel, text: string) => {
    ipcRenderer.send(IPC.RENDERER_LOG, level, text);
  },
} satisfies SalesforceExplorerApi;

// §11.3 起動時 API 公開面 assertion:
// 期待キーセットと実 api の Object.keys を比較し、差分があれば throw する。
// Explorer ビルドに Compass の preload を誤って同梱した等の事故を早期検出する。
const expected = new Set<string>(EXPECTED_API_KEYS.explorer);
const actual = new Set(Object.keys(api));
const missing = [...expected].filter(k => !actual.has(k));
const extra = [...actual].filter(k => !expected.has(k));
if (missing.length > 0 || extra.length > 0) {
  throw new Error(
    `[preload:explorer] API 公開面が EXPECTED_API_KEYS.explorer と一致しません。` +
    ` missing=[${missing.join(', ')}] extra=[${extra.join(', ')}]`,
  );
}

contextBridge.exposeInMainWorld('sfx', api);

// テストモード専用: Playwright から IPC テストセットアップを呼び出せるブリッジ
if (process.env['NODE_ENV'] === 'test') {
  contextBridge.exposeInMainWorld('__testSetup__', (data: unknown) =>
    ipcRenderer.invoke('test:setup', data),
  );
}
