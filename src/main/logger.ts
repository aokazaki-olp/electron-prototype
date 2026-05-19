/**
 * logger.ts
 * @description electron-log の初期化・マスクフック・監査ログ設定
 */

import log from 'electron-log';
import { join } from 'node:path';
import { app } from 'electron';

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

export const initLogger = (): void => {
  const logDir = app.getPath('logs');

  log.transports.file.resolvePathFn = () => join(logDir, 'app.log');
  log.transports.file.level = 'debug';
  log.transports.console.level = 'debug';

  // 機密情報マスクフック（ファイル・コンソール両方に適用）
  log.hooks.push((message) => ({
    ...message,
    data: message.data.map(maskSensitive),
  }));
};

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

import type { Logger } from '../libs/LoggerFacade.js';

/** electron-log を libs/Logger インターフェースに適合させるアダプター */
export const appLogger: Logger = {
  trace: (...args) => log.debug(...args),
  debug: (...args) => log.debug(...args),
  info:  (...args) => log.info(...args),
  warn:  (...args) => log.warn(...args),
  error: (...args) => log.error(...args),
};

export { log };
