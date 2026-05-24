/**
 * mainSetup.ts
 * @description Explorer / Compass の main プロセスで共通する起動時 setup を集約する。
 *   - 未捕捉例外 / Promise 拒否ハンドラ (silent crash 防止)
 *   - permission handler (camera/mic/geolocation 等を全拒否、CODING_RULES §7.2 / §11)
 *
 *   両アプリで完全に同じコードを 2 箇所に書いていた重複を 1 箇所に集める。
 *   Electron main からのみ呼ぶこと (renderer から import すると bundle が壊れる)。
 */

import { session } from 'electron';
import { log } from './logger.js';

/**
 * main プロセス全体の未捕捉例外と未捕捉 Promise 拒否を electron-log に流す。
 * これを登録しないと OAuth リフレッシュ等の async 処理が silent crash する。
 *
 * @param tag - ログ出力時の識別タグ (例: `'explorer'` / `'compass'`)
 */
export const registerProcessErrorHandlers = (tag: string): void => {
  process.on('uncaughtException', (error) => {
    log.error(`[${tag}:uncaughtException]`, error);
  });
  process.on('unhandledRejection', (reason) => {
    log.error(
      `[${tag}:unhandledRejection]`,
      reason instanceof Error ? reason : new Error(String(reason)),
    );
  });
};

/**
 * defaultSession にカメラ / マイク / 位置情報など全 permission 要求を拒否する handler を登録する。
 * 本アプリは SF API 通信のみで、これらのデバイス API は一切不要。
 *
 * app.whenReady() 以降に呼ぶ必要がある (session.defaultSession が必要なため)。
 */
export const registerPermissionDenyAll = (): void => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  // 同期 check 用の handler も拒否で固定 (古い API パスからの誤通過防止)。
  session.defaultSession.setPermissionCheckHandler(() => false);
};
