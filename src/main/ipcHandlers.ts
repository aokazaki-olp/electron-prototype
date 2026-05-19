/**
 * ipcHandlers.ts
 * @description main プロセスの ipcMain.handle 登録。
 *              - gbiz:*  → GBizInfoService への素通し（HttpError は plain Error に畳む）
 *              - nja:normalize → AddressService
 *              - shell:openExternal → Electron shell
 */

import { ipcMain, shell } from 'electron';
import { HttpError } from '../libs/index.js';
import type { GBizService } from './GBizInfoService.js';
import type { AddressService } from './AddressService.js';
import {
  GBIZ_CHANNELS,
  NJA_CHANNEL,
  SHELL_OPEN_EXTERNAL_CHANNEL,
  gbizChannel,
} from '../ipc/contract.js';

/**
 * カスタムエラーは IPC の構造化クローンで失われるため、plain Error に変換する
 *
 * §7.5: Error のカスタムプロパティ（status / body 等）は IPC 転送後に消えるため、
 * status と body を message 文字列に畳み込んで情報を保持する。
 *
 * @param e - 任意の例外
 * @returns renderer へ送る Error
 */
const safeJsonStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value);
  } catch {
    // BigInt や循環参照など JSON.stringify が投げるケースはフォールバック文字列にする。
    // String(value) は循環参照でも安全に "[object Object]" を返す。
    return String(value);
  }
};

const toIpcError = (e: unknown): Error => {
  if (e instanceof HttpError) {
    const bodyStr = e.body != null ? ` — ${safeJsonStringify(e.body)}` : '';
    return new Error(`HTTP ${e.status}: ${e.message}${bodyStr}`);
  }
  return e instanceof Error ? e : new Error(String(e));
};

const assertObjectArg = (channel: string, arg: unknown): Record<string, unknown> => {
  if (typeof arg !== 'object' || arg === null || Array.isArray(arg)) {
    throw new TypeError(`${channel}: 引数には object を指定してください`);
  }
  // 型ガードで object かつ非 null かつ非 Array を確認済み。TypeScript は unknown→ Record への絞り込みを型述語なしでは推論できないためキャストする。
  return arg as Record<string, unknown>;
};

/**
 * URL が http(s) で始まるか判定する。index.ts の setWindowOpenHandler と共有する。
 *
 * @param url - 判定対象の URL 文字列
 * @returns http(s):// で始まる場合 true
 */
export const isExternalUrl = (url: string): boolean =>
  url.startsWith('https://') || url.startsWith('http://');

const assertExternalUrl = (url: unknown): string => {
  if (typeof url !== 'string' || !isExternalUrl(url)) {
    throw new TypeError('openExternal: url には http(s) で始まる string を指定してください');
  }
  return url;
};

export interface RegisterIpcDeps {
  gbiz: GBizService;
  address: AddressService;
}

/**
 * IPC ハンドラを登録する
 *
 * @param deps - gbiz サービスと address サービス
 */
export const registerIpcHandlers = (deps: RegisterIpcDeps): void => {
  for (const name of GBIZ_CHANNELS) {
    const channel = gbizChannel(name);
    ipcMain.handle(channel, async (_event, params: unknown) => {
      try {
        const args = assertObjectArg(channel, params);
        // GBizApi の各メソッドはパラメータ型が異なるため、共通シグネチャにキャストして呼び出す
        // name は GBIZ_CHANNELS の要素なので GBizChannel 型が保証されている
        const method = deps.gbiz[name] as (a: Record<string, unknown>) => Promise<unknown>;
        return await method.call(deps.gbiz, args);
      } catch (e) {
        // gBizINFO は「該当データなし」を 404 で返す。エラーではなく空レスポンスとして扱う。
        if (e instanceof HttpError && e.status === 404) {
          return e.body ?? { id: null, message: '404 - Not Found.', errors: [] };
        }
        throw toIpcError(e);
      }
    });
  }

  ipcMain.handle(NJA_CHANNEL, async (_event, address: unknown) => {
    if (typeof address !== 'string') {
      throw new TypeError(`${NJA_CHANNEL}: address には string を指定してください`);
    }
    try {
      return await deps.address.normalize(address);
    } catch (e) {
      throw toIpcError(e);
    }
  });

  ipcMain.handle(SHELL_OPEN_EXTERNAL_CHANNEL, async (_event, url: unknown) => {
    const safe = assertExternalUrl(url);
    await shell.openExternal(safe);
  });
};
