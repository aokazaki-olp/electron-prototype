/**
 * logger.ts
 * @description electron-log の初期化・マスクフック
 */

import log from 'electron-log';
import { join } from 'node:path';
import { app } from 'electron';
import type { Logger } from '../libs/LoggerFacade.js';

const MASK_PATTERN = /(appid|Authorization)[=:\s"]+\S+/gi;
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

  log.hooks.push((message) => {
    const maskedData = message.data.map(maskSensitive);
    return { ...message, data: maskedData };
  });
};

export const appLogger: Logger = {
  trace: (...args) => log.debug(...args),
  debug: (...args) => log.debug(...args),
  info:  (...args) => log.info(...args),
  warn:  (...args) => log.warn(...args),
  error: (...args) => log.error(...args),
};

export { log };
