/**
 * contract.ts
 * @description IPC型契約 — main / preload / renderer の三者で共有する
 *
 * @remarks
 *   `Window.sfx` のグローバル拡張はここでは行わない。
 *   各アプリの `src/renderer/global.d.ts` でそれぞれの API（[[SalesforceExplorerApi]] / [[LiteApi]]）を宣言する。
 *   こうすることで CODING_RULES §10.3-§10.5 の「ビルド別の compile-time 差分防御」が成立する。
 */

// ============================================================================
// 設定・プロファイル
// ============================================================================

export interface SfConnectionProfile {
  id: string;
  name: string;
  loginUrl: string;
  clientId: string;
  mode: 'readonly' | 'readwrite';
  writeSessionTimeoutMin: number;
}

export interface AppSettings {
  defaultMaxRows: number;
}

// ============================================================================
// 認証
// ============================================================================

export type AuthState = 'connected' | 'disconnected';

// ============================================================================
// Salesforce API
// ============================================================================

export interface SObjectSummary {
  name: string;
  label: string;
  labelPlural: string;
  queryable: boolean;
  updateable: boolean;
  createable: boolean;
  deletable: boolean;
  custom: boolean;
}

export interface FieldDescribe {
  name: string;
  label: string;
  type: string;
  length: number;
  precision: number;
  scale: number;
  nillable: boolean;
  unique: boolean;
  externalId: boolean;
  custom: boolean;
  referenceTo: string[];
  relationshipName: string | null;
  picklistValues: Array<{ label: string; value: string; active: boolean }>;
}

export interface SObjectDescribe {
  name: string;
  label: string;
  labelPlural: string;
  fields: FieldDescribe[];
  childRelationships: Array<{
    childSObject: string;
    field: string;
    relationshipName: string | null;
  }>;
}

export interface QueryResult {
  totalSize: number;
  done: boolean;
  records: Record<string, unknown>[];
  fetchedCount: number;
}

// ============================================================================
// SOQL タブ永続化（CODING_RULES §7.3 遵守: renderer で localStorage を使わない）
// ============================================================================

export interface SoqlTabSnapshot {
  id: string;
  name: string;
  soql: string;
  fetchAll: boolean;
}

export interface SoqlTabsState {
  tabs: SoqlTabSnapshot[];
  activeTabId: string;
}

// ============================================================================
// エクスポート
// ============================================================================

export interface CsvExportOptions {
  bom: boolean;
  lineEnding: 'CRLF' | 'LF';
}

// ============================================================================
// ログ
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  date: string;
  level: LogLevel;
  text: string;
}

// ============================================================================
// IPC チャンネル定数
// ============================================================================

export const IPC = {
  // 設定
  LOAD_SETTINGS: 'settings:load',
  SAVE_SETTINGS: 'settings:save',
  LOAD_PROFILES: 'profiles:load',
  SAVE_PROFILE: 'profiles:save',
  DELETE_PROFILE: 'profiles:delete',

  // 認証
  START_OAUTH: 'oauth:start',
  REAUTH_FOR_WRITE: 'oauth:reauth-write',
  DISCONNECT: 'oauth:disconnect',
  GET_AUTH_STATE: 'oauth:state',

  // SF API（読み取り）
  LIST_SOBJECTS: 'sf:list-sobjects',
  DESCRIBE_OBJECT: 'sf:describe-object',
  QUERY: 'sf:query',
  BULK_QUERY: 'sf:bulk-query',

  // SF API（書き込み — readwriteモード + writeSession有効時のみ）
  CREATE_RECORD: 'sf:create-record',
  UPDATE_RECORD: 'sf:update-record',
  DELETE_RECORD: 'sf:delete-record',

  // SOQLファイル
  SAVE_SOQL_FILE: 'soql:save-file',
  OPEN_SOQL_FILE: 'soql:open-file',

  // SOQL タブ永続化（CODING_RULES §7.3 遵守）
  LOAD_TABS: 'tabs:load',
  SAVE_TABS: 'tabs:save',

  // エクスポート
  EXPORT_CSV: 'export:csv',
  EXPORT_QUERY_EXCEL: 'export:query-excel',
  EXPORT_OBJECT_DEFINITION: 'export:object-definition',

  // ログ（push型 main → renderer）
  LOG_ENTRY: 'log:entry',
  GET_RECENT_LOGS: 'log:recent',

  // レンダラー → メインへのログ転送（renderer の console.log をログビューアに出す）
  RENDERER_LOG: 'log:renderer',
} as const;

// ============================================================================
// preload 経由で renderer に公開する API 型
// ============================================================================

/**
 * Explorer (フル版) が renderer に公開する API。
 * 書き込み系・OAuth・タブ永続化・エクスポートなどすべてを含む。
 */
export interface SalesforceExplorerApi {
  // 設定
  loadSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<void>;
  loadProfiles(): Promise<SfConnectionProfile[]>;
  saveProfile(profile: SfConnectionProfile): Promise<void>;
  deleteProfile(id: string): Promise<void>;

  // 認証
  startOAuth(profileId: string): Promise<void>;
  reauthForWrite(profileId: string): Promise<void>;
  disconnect(profileId: string): Promise<void>;
  getAuthState(profileId: string): Promise<AuthState>;

  // SF API（読み取り）
  listSObjects(): Promise<SObjectSummary[]>;
  describeObject(name: string): Promise<SObjectDescribe>;
  query(soql: string, maxRows: number): Promise<QueryResult>;
  /** Bulk API v2 経由で SOQL を全件取得する。Bulk 特性上、結果は常に全件（maxRows なし）。 */
  bulkQuery(soql: string): Promise<QueryResult>;

  // SF API（書き込み）
  createRecord(objectName: string, fields: Record<string, unknown>): Promise<string>;
  updateRecord(objectName: string, id: string, fields: Record<string, unknown>): Promise<void>;
  deleteRecord(objectName: string, id: string): Promise<void>;

  // SOQLファイル
  saveSoqlFile(soql: string, defaultName: string): Promise<void>;
  openSoqlFile(): Promise<{ name: string; soql: string } | null>;

  // SOQL タブ永続化
  loadTabs(): Promise<SoqlTabsState | null>;
  saveTabs(state: SoqlTabsState): Promise<void>;

  // エクスポート
  exportCsv(records: Record<string, unknown>[], columns: string[], options: CsvExportOptions): Promise<void>;
  exportQueryExcel(records: Record<string, unknown>[], columns: string[]): Promise<void>;
  exportObjectDefinition(objectName: string): Promise<void>;

  // ログ
  getRecentLogs(limit?: number): Promise<LogEntry[]>;
  onLogEntry(callback: (entry: LogEntry) => void): () => void;
  rendererLog(level: LogLevel, text: string): void;
}

/**
 * Compass (ライト版) が将来公開する API。読み取り系・エクスポート・ログのみ。
 * 書き込み系・SOQL タブ管理・OAuth 起点メソッドは含まない。
 *
 * @remarks CODING_RULES §10.3 の方針通り「Compass では runtime ではなく
 *   compile-time の差分で書き込み系の到達不能を担保する」ための基底型。
 */
export type LiteApi = Pick<SalesforceExplorerApi,
  | 'loadSettings'
  | 'loadProfiles'
  | 'getAuthState'
  | 'listSObjects'
  | 'describeObject'
  | 'query'
  | 'exportCsv'
  | 'exportQueryExcel'
  | 'exportObjectDefinition'
  | 'getRecentLogs'
  | 'onLogEntry'
  | 'rendererLog'
>;

/**
 * §11.3 起動時 API 公開面 assertion 用: 各ビルドが公開すべき API キー集合。
 *
 * @remarks preload はこの定数と `Object.keys(api)` を比較し、
 *   差分があれば起動を中断する。誤ビルド・誤同梱の早期検出が目的。
 */
export const EXPECTED_API_KEYS = {
  explorer: [
    'loadSettings', 'saveSettings', 'loadProfiles', 'saveProfile', 'deleteProfile',
    'startOAuth', 'reauthForWrite', 'disconnect', 'getAuthState',
    'listSObjects', 'describeObject', 'query', 'bulkQuery',
    'createRecord', 'updateRecord', 'deleteRecord',
    'saveSoqlFile', 'openSoqlFile',
    'loadTabs', 'saveTabs',
    'exportCsv', 'exportQueryExcel', 'exportObjectDefinition',
    'getRecentLogs', 'onLogEntry', 'rendererLog',
  ],
  compass: [
    'loadSettings', 'loadProfiles', 'getAuthState',
    'listSObjects', 'describeObject', 'query',
    'exportCsv', 'exportQueryExcel', 'exportObjectDefinition',
    'getRecentLogs', 'onLogEntry', 'rendererLog',
  ],
} as const satisfies Record<'explorer' | 'compass', readonly string[]>;
