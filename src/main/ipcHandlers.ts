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
import type { GBizChannel } from '../ipc/contract.js';

/**
 * カスタムエラーは IPC の構造化クローンで失われるため、plain Error に変換する
 *
 * @param e - 任意の例外
 * @returns renderer へ送る Error
 */
const toIpcError = (e: unknown): Error => {
  if (e instanceof HttpError) {
    const err = new Error(`HTTP ${e.status}: ${e.message}`) as Error & {
      status: number;
      body: unknown;
    };
    err.status = e.status;
    err.body = e.body;
    return err;
  }
  return e instanceof Error ? e : new Error(String(e));
};

const assertObjectArg = (channel: string, arg: unknown): Record<string, unknown> => {
  if (typeof arg !== 'object' || arg === null || Array.isArray(arg)) {
    throw new TypeError(`${channel}: 引数には object を指定してください`);
  }
  return arg as Record<string, unknown>;
};

const HTTPS_PREFIX = 'https://';
const HTTP_PREFIX = 'http://';

const assertExternalUrl = (url: unknown): string => {
  if (typeof url !== 'string' || (!url.startsWith(HTTPS_PREFIX) && !url.startsWith(HTTP_PREFIX))) {
    throw new TypeError('openExternal: url には http(s) で始まる string を指定してください');
  }
  return url;
};

export interface RegisterIpcDeps {
  gbiz: GBizService;
  address: AddressService;
}

export const registerIpcHandlers = (deps: RegisterIpcDeps): void => {
  for (const name of GBIZ_CHANNELS) {
    const channel = gbizChannel(name);
    ipcMain.handle(channel, async (_event, params: unknown) => {
      try {
        const args = assertObjectArg(channel, params);
        // GBizApi は全メソッドが `(object) => Promise<unknown>` シグネチャに統一されている
        const method = deps.gbiz[name as GBizChannel] as (a: Record<string, unknown>) => Promise<unknown>;
        return await method.call(deps.gbiz, args);
      } catch (e) {
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
