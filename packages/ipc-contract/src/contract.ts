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

/**
 * ペインサイズ（パーセンテージ）。`react-resizable-panels` の onLayout で取得した値を保持する。
 * - `leftPanel`: 左ペイン (SObjectBrowser) の幅 (0–100)
 * - `soqlPanel`: 中央上下分割の上 (SoqlEditor) の高さ (0–100)
 */
export interface PaneSizes {
  leftPanel: number;
  soqlPanel: number;
}

/**
 * 表示テーマ。`system` は OS 設定 (`prefers-color-scheme`) に追従する。
 */
export type ThemeMode = 'light' | 'dark' | 'system';

export interface AppSettings {
  defaultMaxRows: number;
  /** LogViewer が保持するログエントリの上限件数。`0` で無制限。 */
  logBufferSize: number;
  /** メインレイアウトのペインサイズ。ユーザーがドラッグした結果を永続化する。 */
  paneSizes: PaneSizes;
  /** 表示テーマ (light / dark / system)。`system` は OS のダーク設定に従う。 */
  theme: ThemeMode;
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

/**
 * SOQL クエリ実行方式。
 * - `rest`: SOQL REST `/query` (高速、〜数万件向け)
 * - `bulk`: Bulk API v2 Query (API call 節約、大量件数向け、開始まで overhead あり)
 */
export type ExecutionMode = 'rest' | 'bulk';

export interface SoqlTabSnapshot {
  id: string;
  name: string;
  soql: string;
  fetchAll: boolean;
  /** 省略時は `rest` 扱い (旧データとの互換)。 */
  executionMode?: ExecutionMode;
}

export interface SoqlTabsState {
  tabs: SoqlTabSnapshot[];
  activeTabId: string;
}

// ============================================================================
// 結果テーブル: 列幅永続化（CODING_RULES §7.3 遵守: renderer で localStorage を使わない）
// ============================================================================

/**
 * 列幅の永続化マップ。`sObjectName -> fieldName -> pixel` の 2 段ネスト。
 *
 * @remarks 大量 org でも肥大化を避けるため、AppSettings には入れず別 store に分離する。
 * 同名 sObject の同名フィールドは共通幅を共有する。
 */
export type ColumnSizesState = Record<string, Record<string, number>>;

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
  /**
   * 単調増加のシーケンス番号 (main で発番)。
   * renderer 側の React key としてエントリを一意に識別するために使う。
   * 同一 main プロセス内で衝突せず、フィルタ・並べ替え後も entry を追跡できる。
   * 省略時は 0 として扱う (旧データ互換)。
   */
  seq?: number;
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

  // 結果テーブル列幅の永続化
  LOAD_COLUMN_SIZES: 'column-sizes:load',
  SAVE_COLUMN_SIZES: 'column-sizes:save',

  // エクスポート
  EXPORT_CSV: 'export:csv',
  EXPORT_QUERY_EXCEL: 'export:query-excel',
  EXPORT_OBJECT_DEFINITION: 'export:object-definition',
  EXPORT_OBJECT_DEFINITION_MARKDOWN: 'export:object-definition-markdown',
  EXPORT_OBJECT_DEFINITION_JSON: 'export:object-definition-json',
  EXPORT_OBJECTS_MD_FOLDER: 'export:objects-md-folder',
  EXPORT_LOG_FILE: 'export:log-file',

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

  // 結果テーブル列幅の永続化
  loadColumnSizes(): Promise<ColumnSizesState>;
  saveColumnSizes(state: ColumnSizesState): Promise<void>;

  // エクスポート
  exportCsv(records: Record<string, unknown>[], columns: string[], options: CsvExportOptions): Promise<void>;
  exportQueryExcel(records: Record<string, unknown>[], columns: string[]): Promise<void>;
  exportObjectDefinition(objectName: string): Promise<void>;
  exportObjectDefinitionMarkdown(objectName: string): Promise<void>;
  exportObjectDefinitionJson(objectName: string): Promise<void>;
  /** フォルダを選択し、objectNames の定義書を個別 MD ファイルで出力。README.md に TOC を生成する。 */
  exportObjectsMdFolder(objectNames: string[]): Promise<void>;
  /** 現在の LogViewer 内容を .log ファイルに保存する。ユーザーが dialog をキャンセルした場合は何もせず返る。 */
  exportLogFile(logs: LogEntry[]): Promise<void>;

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
  | 'exportObjectDefinitionMarkdown'
  | 'exportObjectDefinitionJson'
  | 'exportObjectsMdFolder'
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
    'loadColumnSizes', 'saveColumnSizes',
    'exportCsv', 'exportQueryExcel', 'exportObjectDefinition', 'exportObjectDefinitionMarkdown', 'exportObjectDefinitionJson', 'exportObjectsMdFolder', 'exportLogFile',
    'getRecentLogs', 'onLogEntry', 'rendererLog',
  ],
  compass: [
    'loadSettings', 'loadProfiles', 'getAuthState',
    'listSObjects', 'describeObject', 'query',
    'exportCsv', 'exportQueryExcel', 'exportObjectDefinition', 'exportObjectDefinitionMarkdown', 'exportObjectDefinitionJson', 'exportObjectsMdFolder',
    'getRecentLogs', 'onLogEntry', 'rendererLog',
  ],
} as const satisfies {
  explorer: readonly (keyof SalesforceExplorerApi)[];
  compass: readonly (keyof LiteApi)[];
};

// ============================================================================
// 型レベル completeness check
// ============================================================================
// SalesforceExplorerApi / LiteApi にメソッドを追加したのに EXPECTED_API_KEYS の
// 列挙を更新しなかった場合、コンパイル時にここで型エラーになる。これにより:
//   - preload の起動時 assertion (§11.3) が誤って通過するのを防ぐ
//   - csp-security.spec / compass-boundary.spec の自動導出が正しく動く
//   - tests/mocks/sfx の網羅性が型で担保される
//
// 仕組み: 「ApiKey から ExpectedKey を除いた差集合が `never` (= 完全網羅)」を検査する。
// 三項条件型で `never extends never ? true : { error; missing }` となり、不足キーがある場合は
// `true` 側 (true 型) ではなく `{error, missing}` 側 (object 型) に解決されて代入が失敗する。
// 失敗時のエラーメッセージには `missing` フィールドに「列挙漏れしているキー名」が出るので、
// 読み手はそのキーを EXPECTED_API_KEYS.{explorer|compass} に追加すれば直る。
//
// 注意: これらは値・型ともにファイル外から参照されない (内部的な compile-time 検査)。
// `_` プレフィックスは「未使用 export」ではなく型システムへの assertion であることを示す慣習。

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _AssertExplorerKeysComplete =
  Exclude<keyof SalesforceExplorerApi, typeof EXPECTED_API_KEYS.explorer[number]> extends never
    ? true
    : { error: 'SalesforceExplorerApi のキーが EXPECTED_API_KEYS.explorer に列挙されていません'; missing: Exclude<keyof SalesforceExplorerApi, typeof EXPECTED_API_KEYS.explorer[number]> };
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _assertExplorerKeysComplete: _AssertExplorerKeysComplete = true;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _AssertCompassKeysComplete =
  Exclude<keyof LiteApi, typeof EXPECTED_API_KEYS.compass[number]> extends never
    ? true
    : { error: 'LiteApi のキーが EXPECTED_API_KEYS.compass に列挙されていません'; missing: Exclude<keyof LiteApi, typeof EXPECTED_API_KEYS.compass[number]> };
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _assertCompassKeysComplete: _AssertCompassKeysComplete = true;
