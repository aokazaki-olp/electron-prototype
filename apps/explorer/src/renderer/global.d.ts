/**
 * global.d.ts (Explorer)
 * @description Explorer ビルド限定の Window 拡張。
 *   contract.ts に `declare global` を置くと Compass renderer でも型上 sfx メソッドが通ってしまうため、
 *   CODING_RULES §10.3 の「ビルド別の compile-time 差分防御」を守る目的でアプリ側に閉じる。
 */

import type { SalesforceExplorerApi } from '@app/ipc-contract';

declare global {
  interface Window {
    sfx: SalesforceExplorerApi;
    /** テストモード専用ブリッジ。本番ビルドでは undefined。 */
    __testSetup__?: (data: unknown) => Promise<void>;
  }
}

export {};
