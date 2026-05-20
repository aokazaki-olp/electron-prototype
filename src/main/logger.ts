/**
 * logger.ts
 * @description electron-log の初期化・マスクフック・監査ログ設定
 */

import log from 'electron-log';
import { join } from 'node:path';
import { app } from 'electron';
import type { Logger } from '../libs/LoggerFacade.js';
import type { LogEntry } from '../ipc/contract.js';

const MASK_PATTERN = /(access_token|refresh_token|Authorization|clientSecret|code)[=:\s"]+\S+/gi;
const MASK_REPLACEMENT = '$1=***';

const maskSensitive = (value: unknown): unknown => {
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
// 起動前ログのリングバッファ（GET_RECENT_LOGS 用）
// ============================================================================

const LOG_BUFFER_SIZE = 200;
const logBuffer: LogEntry[] = [];

export const getRecentLogs = (): LogEntry[] => [...logBuffer];

export const initLogger = (): void => {
  const logDir = app.getPath('logs');

  log.transports.file.resolvePathFn = () => join(logDir, 'app.log');
  log.transports.file.level = 'debug';
  log.transports.console.level = 'debug';

  // 機密情報マスク + リングバッファへの追記を1フックで処理
  log.hooks.push((message) => {
    const maskedData = message.data.map(maskSensitive);
    const entry: LogEntry = {
      date: message.date.toISOString(),
      level: message.level as LogEntry['level'],
      text: maskedData.map(String).join(' '),
    };
    if (logBuffer.length >= LOG_BUFFER_SIZE) {
      logBuffer.shift();
    }
    logBuffer.push(entry);
    return { ...message, data: maskedData };
  });
};

// ============================================================================
// 監査ログ
// ============================================================================

// 監査ログ専用インスタンス
const auditLogger = log.create({ logId: 'audit' });

export const initAuditLogger = (): void => {
  const logDir = app.getPath('logs');
  auditLogger.transports.file.resolvePathFn = () => join(logDir, 'audit.log');
  auditLogger.transports.file.level = 'info';
  auditLogger.transports.console.level = false;
};

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
