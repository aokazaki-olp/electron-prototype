/**
 * guards.ts
 * @description IPC 境界での外部入力（renderer → main）に対する runtime 型ガード。
 *   CODING_RULES §4.3 が要求する「外部データは `unknown` + 型ガード」の本実装。
 *   §1 の「型があってもランタイムガードを残す」を多層防御として体現する。
 */

import type {
  AppSettings,
  CsvExportOptions,
  LogEntry,
  LogLevel,
  SfConnectionProfile,
  SoqlTabSnapshot,
  SoqlTabsState,
} from './contract.js';

// ============================================================================
// プリミティブ判定
// ============================================================================

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isString = (v: unknown): v is string => typeof v === 'string';
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean';

// ============================================================================
// LogLevel
// ============================================================================

const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];

export const isLogLevel = (v: unknown): v is LogLevel =>
  isString(v) && (LOG_LEVELS as readonly string[]).includes(v);

/**
 * `unknown` が [[LogLevel]] であることを assert する。
 *
 * @param v - 未検証の payload
 * @throws {TypeError} payload が [[LogLevel]] のいずれにも該当しない場合
 */
export const assertLogLevel: (v: unknown) => asserts v is LogLevel = (v) => {
  if (!isLogLevel(v)) {
    throw new TypeError('IPC payload が LogLevel ではありません');
  }
};

// ============================================================================
// AppSettings
// ============================================================================

const isPaneSizes = (v: unknown): v is AppSettings['paneSizes'] =>
  isPlainObject(v) && isNumber(v['leftPanel']) && isNumber(v['soqlPanel']);

const isAppSettings = (v: unknown): v is AppSettings =>
  isPlainObject(v)
  && isNumber(v['defaultMaxRows'])
  && isNumber(v['logBufferSize'])
  && isPaneSizes(v['paneSizes']);

/**
 * `unknown` が [[AppSettings]] であることを assert する。
 *
 * @param v - renderer から送られた未検証の payload
 * @throws {TypeError} payload が [[AppSettings]] 形状を満たさない場合
 */
export const assertAppSettings: (v: unknown) => asserts v is AppSettings = (v) => {
  if (!isAppSettings(v)) {
    throw new TypeError('IPC payload が AppSettings ではありません');
  }
};

// ============================================================================
// SfConnectionProfile
// ============================================================================

const isMode = (v: unknown): v is SfConnectionProfile['mode'] =>
  v === 'readonly' || v === 'readwrite';

const isSfConnectionProfile = (v: unknown): v is SfConnectionProfile =>
  isPlainObject(v)
  && isString(v['id'])
  && isString(v['name'])
  && isString(v['loginUrl'])
  && isString(v['clientId'])
  && isMode(v['mode'])
  && isNumber(v['writeSessionTimeoutMin']);

/**
 * `unknown` が [[SfConnectionProfile]] であることを assert する。
 *
 * @param v - renderer から送られた未検証の payload
 * @throws {TypeError} payload が [[SfConnectionProfile]] 形状を満たさない場合
 */
export const assertProfile: (v: unknown) => asserts v is SfConnectionProfile = (v) => {
  if (!isSfConnectionProfile(v)) {
    throw new TypeError('IPC payload が SfConnectionProfile ではありません');
  }
};

// ============================================================================
// CsvExportOptions
// ============================================================================

const isLineEnding = (v: unknown): v is CsvExportOptions['lineEnding'] =>
  v === 'CRLF' || v === 'LF';

const isCsvExportOptions = (v: unknown): v is CsvExportOptions =>
  isPlainObject(v) && isBoolean(v['bom']) && isLineEnding(v['lineEnding']);

/**
 * `unknown` が [[CsvExportOptions]] であることを assert する。
 *
 * @param v - renderer から送られた未検証の payload
 * @throws {TypeError} payload が [[CsvExportOptions]] 形状を満たさない場合
 */
export const assertCsvExportOptions: (v: unknown) => asserts v is CsvExportOptions = (v) => {
  if (!isCsvExportOptions(v)) {
    throw new TypeError('IPC payload が CsvExportOptions ではありません');
  }
};

// ============================================================================
// Record<string, unknown>
// ============================================================================

/**
 * `unknown` が `Record<string, unknown>`（プレーンオブジェクト）であることを assert する。
 *
 * @param v - 未検証の payload
 * @throws {TypeError} オブジェクトでない場合
 */
export const assertRecord: (v: unknown) => asserts v is Record<string, unknown> = (v) => {
  if (!isPlainObject(v)) {
    throw new TypeError('IPC payload がプレーンオブジェクトではありません');
  }
};

/**
 * `unknown` が `Record<string, unknown>[]` であることを assert する。
 *
 * @param v - 未検証の payload
 * @throws {TypeError} 配列でない、または要素がオブジェクトでない場合
 */
export const assertRecordArray: (v: unknown) => asserts v is Record<string, unknown>[] = (v) => {
  if (!Array.isArray(v)) {
    throw new TypeError('IPC payload が配列ではありません');
  }
  for (const item of v) {
    if (!isPlainObject(item)) {
      throw new TypeError('IPC payload の配列要素がオブジェクトではありません');
    }
  }
};

/**
 * `unknown` が文字列配列 (`string[]`) であることを assert する。
 *
 * @param v - 未検証の payload
 * @throws {TypeError} 配列でない、または要素が文字列でない場合
 */
export const assertStringArray: (v: unknown) => asserts v is string[] = (v) => {
  if (!Array.isArray(v)) {
    throw new TypeError('IPC payload が配列ではありません');
  }
  for (const item of v) {
    if (!isString(item)) {
      throw new TypeError('IPC payload の配列要素が文字列ではありません');
    }
  }
};

/**
 * `unknown` が文字列であることを assert する。
 *
 * @param v - 未検証の payload
 * @throws {TypeError} 文字列でない場合
 */
export const assertString: (v: unknown) => asserts v is string = (v) => {
  if (!isString(v)) {
    throw new TypeError('IPC payload が文字列ではありません');
  }
};

/**
 * `unknown` が数値であることを assert する。
 *
 * @param v - 未検証の payload
 * @throws {TypeError} 数値でない、または有限でない場合
 */
export const assertNumber: (v: unknown) => asserts v is number = (v) => {
  if (!isNumber(v)) {
    throw new TypeError('IPC payload が有限数値ではありません');
  }
};

// ============================================================================
// SoqlTabsState
// ============================================================================

const isSoqlTabSnapshot = (v: unknown): v is SoqlTabSnapshot =>
  isPlainObject(v)
  && isString(v['id'])
  && isString(v['name'])
  && isString(v['soql'])
  && isBoolean(v['fetchAll']);

const isSoqlTabsState = (v: unknown): v is SoqlTabsState =>
  isPlainObject(v)
  && Array.isArray(v['tabs'])
  && v['tabs'].every(isSoqlTabSnapshot)
  && isString(v['activeTabId']);

/**
 * `unknown` が [[SoqlTabsState]] であることを assert する。
 *
 * @param v - renderer から送られた未検証の payload
 * @throws {TypeError} payload が [[SoqlTabsState]] 形状を満たさない場合
 */
export const assertSoqlTabsState: (v: unknown) => asserts v is SoqlTabsState = (v) => {
  if (!isSoqlTabsState(v)) {
    throw new TypeError('IPC payload が SoqlTabsState ではありません');
  }
};

// ============================================================================
// LogEntry / LogEntry[]
// ============================================================================

const isLogEntry = (v: unknown): v is LogEntry =>
  isPlainObject(v)
  && isString(v['date'])
  && isLogLevel(v['level'])
  && isString(v['text']);

/**
 * `unknown` が [[LogEntry]] の配列であることを assert する。
 *
 * @param v - 未検証の payload
 * @throws {TypeError} 配列でない、または要素が [[LogEntry]] 形状を満たさない場合
 */
export const assertLogEntryArray: (v: unknown) => asserts v is LogEntry[] = (v) => {
  if (!Array.isArray(v)) {
    throw new TypeError('IPC payload が配列ではありません');
  }
  for (const item of v) {
    if (!isLogEntry(item)) {
      throw new TypeError('IPC payload の配列要素が LogEntry ではありません');
    }
  }
};
