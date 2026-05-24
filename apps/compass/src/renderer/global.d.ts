/**
 * global.d.ts (Compass)
 * @description Compass ビルド限定の Window 拡張。
 *   読み取り中心の [[LiteApi]] のみを公開し、書き込み系メソッドは型レベルで到達不能にする。
 *   現状は preload が空オブジェクトを公開しているため、UI 実装時に api を満たすよう変更する。
 */

import type { LiteApi } from '@app/ipc-contract';

declare global {
  interface Window {
    sfx: LiteApi;
  }
}

export {};
