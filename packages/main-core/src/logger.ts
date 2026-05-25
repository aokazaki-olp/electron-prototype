/**
 * logger.ts
 * @description electron-log の初期化・マスクフック・監査ログ設定
 */

import log from 'electron-log';
import { join } from 'node:path';
import { app } from 'electron';
import type { Logger } from '@app/libs';
import type { LogEntry, LogLevel } from '@app/ipc-contract';

/**
 * 機密情報マスク用パターン。
 *
 * @remarks
 *   - `code` は OAuth 認可コード (`code=...` / `code: ...`) のみを対象にする。
 *     `error_code: 12345` 等のデバッグ情報を巻き込まないよう、識別子境界（`\b`）と
 *     直後にアンダースコアが続かない negative lookahead で絞り込む。
 *   - `Session-Id` / `session_id` / `sid` 等 SF 由来のセッション識別子も対象に含める。
 */
// 値の終端は改行 / カンマ / セミコロン / アンパサンド（URL クエリ区切り）。これにより
// `Authorization: Bearer abc.def.ghi` のような複数トークン値もまとめてマスクする。
const MASK_PATTERN = /\b(access_token|refresh_token|Authorization|clientSecret|session[_-]?id|sid|(?<!_)code(?!_))[=:\s"]+[^\r\n,;&]+/gi;
const MASK_REPLACEMENT = '$1=***';

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const satisfies readonly LogLevel[];

const isLogLevel = (v: string): v is LogLevel =>
  (LOG_LEVELS as readonly string[]).includes(v);

/**
 * electron-log の文字列レベルを LogEntry['level'] の Union 型に絞り込む。
 * 該当しない値（`silly` / `verbose` 等の未知レベル）は `'debug'` にフォールバックする。
 *
 * @param raw - electron-log から渡される未検証のレベル文字列
 * @returns LogEntry の level として安全に使える Union 型の値
 */
export const toLogLevel = (raw: string): LogLevel => (isLogLevel(raw) ? raw : 'debug');

/**
 * 文字列 / Error から機密情報をマスクする。配列・オブジェクトには再帰しない。
 *
 * @param value - マスク対象の値（任意型）
 * @returns マスク済みの値。string / Error 以外はそのまま返す
 */
export const maskSensitive = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return value.replace(MASK_PATTERN, MASK_REPLACEMENT);
  }
  if (value instanceof Error) {
    const masked = new Error(value.message.replace(MASK_PATTERN, MASK_REPLACEMENT));
    masked.stack = value.stack?.replace(MASK_PATTERN, MASK_REPLACEMENT);
    return masked;
  }
  return value;
};

// ============================================================================
// 単調増加シーケンス番号
// ============================================================================

// main プロセス起動から終了までユニークな単調増加の番号。renderer 側の React key として
// LogEntry を一意に識別するために使う。フィルタ・並べ替え後も追跡可能。
let logSeq = 0;
const nextSeq = (): number => ++logSeq;

/** テスト専用: シーケンスをリセットする。本番コードから呼ばない。 */
export const _resetLogSeqForTest = (): void => {
  logSeq = 0;
};

// ============================================================================
// 起動前ログのリングバッファ（GET_RECENT_LOGS 用）
// ============================================================================

const LOG_BUFFER_SIZE = 200;
const logBuffer: LogEntry[] = new Array(LOG_BUFFER_SIZE);
let bufferHead = 0;
let bufferCount = 0;

const pushBuffer = (entry: LogEntry): void => {
  logBuffer[bufferHead] = entry;
  bufferHead = (bufferHead + 1) % LOG_BUFFER_SIZE;
  if (bufferCount < LOG_BUFFER_SIZE) {
    bufferCount++;
  }
};

/**
 * リングバッファに蓄積された最近のログエントリを返す（古い順）。
 *
 * @returns ログエントリのスナップショット配列（呼び出し時点のコピー）
 */
export const getRecentLogs = (): LogEntry[] => {
  const result: LogEntry[] = [];
  const start = bufferCount < LOG_BUFFER_SIZE ? 0 : bufferHead;
  for (let i = 0; i < bufferCount; i++) {
    const entry = logBuffer[(start + i) % LOG_BUFFER_SIZE];
    if (entry != null) {
      result.push(entry);
    }
  }
  return result;
};

/**
 * テスト専用: リングバッファをクリアする。本番コードから呼ばない。
 */
export const _resetLogBufferForTest = (): void => {
  bufferHead = 0;
  bufferCount = 0;
  logBuffer.length = 0;
  logBuffer.length = LOG_BUFFER_SIZE;
};

// ============================================================================
// electron-log 初期化
// ============================================================================

/**
 * electron-log の初期化。ファイル出力先・レベル・機密情報マスク・リングバッファへの追記、
 * および renderer へのストリーミング配信を1フックで処理する。
 *
 * @remarks `app.getPath('logs')` を使うため、`app.whenReady()` 以降に呼ぶ必要がある。
 *
 * @param broadcaster - renderer に LogEntry を送る optional コールバック。
 *   `mainWindow.webContents.send(...)` をラップした関数を渡す。
 *   渡されたコールバックは破棄済みウィンドウのチェックを呼び出し側で行うこと。
 */
export const initLogger = (broadcaster?: (entry: LogEntry) => void): void => {
  const logDir = app.getPath('logs');

  log.transports.file.resolvePathFn = () => join(logDir, 'app.log');
  log.transports.file.level = 'debug';
  log.transports.console.level = 'debug';

  log.hooks.push((message) => {
    const maskedData = message.data.map(maskSensitive);
    const entry: LogEntry = {
      date: message.date.toISOString(),
      level: toLogLevel(message.level),
      text: maskedData.map(String).join(' '),
      seq: nextSeq(),
    };
    pushBuffer(entry);
    if (broadcaster) {
      try {
        broadcaster(entry);
      } catch {
        // broadcaster の失敗（destroyed window 等）はロガー側の責務でない
      }
    }
    return { ...message, data: maskedData };
  });
};

// ============================================================================
// 監査ログ
// ============================================================================

const auditLogger = log.create({ logId: 'audit' });

/**
 * 監査ログ（書き込み操作の証跡）専用 logger を初期化する。
 *
 * @remarks コンソール出力は無効化し、`audit.log` ファイルにのみ追記する。
 */
export const initAuditLogger = (): void => {
  const logDir = app.getPath('logs');
  auditLogger.transports.file.resolvePathFn = () => join(logDir, 'audit.log');
  auditLogger.transports.file.level = 'info';
  auditLogger.transports.console.level = false;
};

/**
 * 監査ログを1行書き出す。
 *
 * @param profileName - 操作元のプロファイル名（ユーザー識別目的）
 * @param operation - 操作種別（例: `CREATE` / `UPDATE` / `DELETE`）
 * @param detail - 操作対象の詳細（sObject 名・レコード ID 等）
 * @param recordsAffected - 影響を受けたレコード件数（省略時は記録しない）
 */
export const auditLog = (
  profileName: string,
  operation: string,
  detail: string,
  recordsAffected?: number,
): void => {
  const suffix = recordsAffected != null ? ` | records=${recordsAffected}` : '';
  auditLogger.info(`[AUDIT] ${operation} | profile=${profileName} | ${detail}${suffix}`);
};

/** electron-log を libs/Logger インターフェースに適合させるアダプター */
export const appLogger: Logger = {
  trace: (...args) => log.debug(...args),
  debug: (...args) => log.debug(...args),
  info:  (...args) => log.info(...args),
  warn:  (...args) => log.warn(...args),
  error: (...args) => log.error(...args),
};

export { log };
