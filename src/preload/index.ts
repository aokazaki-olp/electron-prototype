/**
 * preload/index.ts
 * @description renderer に gbiz / nja / shell の API を contextBridge 経由で露出する。
 *              ここで `satisfies GBizApi & NjaApi & ShellApi` により契約に違反した呼び出しを
 *              コンパイル時に検出する。renderer 側のコードは Window 型から型推論できる。
 */

import { contextBridge, ipcRenderer } from 'electron';
import {
  GBIZ_CHANNELS,
  NJA_CHANNEL,
  SHELL_OPEN_EXTERNAL_CHANNEL,
  gbizChannel,
} from '../ipc/contract.js';
import type { GBizApi, NjaApi, ShellApi } from '../ipc/contract.js';

// 18 メソッドを動的合成。.use() で組み立てた main 側と対称。
// Object.fromEntries の戻り値型は動的合成のため GBizApi と一致しない。
// GBIZ_CHANNELS と contract.ts の型は対称なので型安全は担保されており、
// satisfies ではなく as unknown as GBizApi でキャストする（preload 内に閉じ込める §7.4）。
const gbiz = Object.fromEntries(
  GBIZ_CHANNELS.map((name) => [
    name,
    (params: unknown) => ipcRenderer.invoke(gbizChannel(name), params),
  ]),
) as unknown as GBizApi;

const nja = {
  normalize: (address: string) => ipcRenderer.invoke(NJA_CHANNEL, address),
} satisfies NjaApi;

const shellApi = {
  openExternal: (url: string) => ipcRenderer.invoke(SHELL_OPEN_EXTERNAL_CHANNEL, url),
} satisfies ShellApi;

contextBridge.exposeInMainWorld('gbiz', gbiz);
contextBridge.exposeInMainWorld('nja', nja);
contextBridge.exposeInMainWorld('shell', shellApi);
