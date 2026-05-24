/**
 * preload/index.ts (Compass)
 * @description Compass の preload エントリ。
 *   現状スケルトンであり LiteApi の実装はまだ無いが、§11.3 の起動時 assertion は今のうちから入れて
 *   将来の誤同梱を検出する土台にする。
 */

import { contextBridge } from 'electron';
import { EXPECTED_API_KEYS } from '@app/ipc-contract';
import type { LiteApi } from '@app/ipc-contract';

// 将来 LiteApi を満たすメソッドをここに実装する。
// UI 実装に着手するまでは空オブジェクトで露出するが、
// §11.3 assertion により「期待キー集合と実際のキー集合」の差分は起動時に検出される。
const api: Partial<LiteApi> = {};

const expected = new Set<string>(EXPECTED_API_KEYS.compass);
const actual = new Set(Object.keys(api));
const missing = [...expected].filter(k => !actual.has(k));
const extra = [...actual].filter(k => !expected.has(k));

// スケルトン段階では「missing が compass の全 API」になる。本実装が始まったら 0 になる想定。
// extra（=Explorer 由来 API が誤って混入）だけは即座に異常として扱う。
if (extra.length > 0) {
  throw new Error(
    `[preload:compass] EXPECTED_API_KEYS.compass に含まれないキーが露出しています: extra=[${extra.join(', ')}]`,
  );
}
if (missing.length > 0) {
  // スケルトン状態の自己報告。本実装後は extra と同じく throw に格上げする。
  console.warn(
    `[preload:compass] API 未実装: missing=[${missing.join(', ')}]。スケルトン段階のため起動は継続します。`,
  );
}

contextBridge.exposeInMainWorld('sfx', api);
