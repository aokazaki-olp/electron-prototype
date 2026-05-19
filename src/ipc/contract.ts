/**
 * contract.ts
 * @description IPC型契約 — main / preload / renderer の三者で共有する
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
  profiles: SfConnectionProfile[];
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

  // SF API（書き込み — readwriteモード + writeSession有効時のみ）
  CREATE_RECORD: 'sf:create-record',
  UPDATE_RECORD: 'sf:update-record',
  DELETE_RECORD: 'sf:delete-record',

  // エクスポート
  EXPORT_CSV: 'export:csv',
  EXPORT_QUERY_EXCEL: 'export:query-excel',
  EXPORT_OBJECT_DEFINITION: 'export:object-definition',

  // ログ（push型 main → renderer）
  LOG_ENTRY: 'log:entry',
  GET_RECENT_LOGS: 'log:recent',
} as const;

// ============================================================================
// preload 経由で renderer に公開する API 型
// ============================================================================

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

  // SF API（書き込み）
  createRecord(objectName: string, fields: Record<string, unknown>): Promise<string>;
  updateRecord(objectName: string, id: string, fields: Record<string, unknown>): Promise<void>;
  deleteRecord(objectName: string, id: string): Promise<void>;

  // エクスポート
  exportCsv(records: Record<string, unknown>[], columns: string[], options: CsvExportOptions): Promise<void>;
  exportQueryExcel(records: Record<string, unknown>[], columns: string[]): Promise<void>;
  exportObjectDefinition(objectName: string): Promise<void>;

  // ログ
  getRecentLogs(limit?: number): Promise<LogEntry[]>;
  onLogEntry(callback: (entry: LogEntry) => void): () => void;
}

declare global {
  interface Window {
    sfx: SalesforceExplorerApi;
  }
}
