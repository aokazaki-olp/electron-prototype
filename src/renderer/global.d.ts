/**
 * global.d.ts
 * @description preload が contextBridge で露出した API を Window に型付けする。
 */

import type { GBizApi, NjaApi, ShellApi } from '../ipc/contract.js';

declare global {
  interface Window {
    gbiz: GBizApi;
    nja: NjaApi;
    shell: ShellApi;
  }
}

export {};
