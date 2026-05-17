/**
 * AddressService.ts
 * @description @geolonia/normalize-japanese-addresses v3 の薄いラッパー＋簡易キャッシュ。
 *              UI 側から渡された住所文字列を正規化して NjaResult を返す。
 *              サービス層はレスポンス形状を知らないため、住所抽出は UI 側の責務（疎結合）。
 */

import type { NjaResult } from '../ipc/contract.js';

// normalize-japanese-addresses は CJS 寄りで型もゆるい。最小限のシグネチャだけ受ける。
type NormalizeFn = (
  address: string,
) => Promise<{
  pref?: string;
  city?: string;
  town?: string;
  addr?: string;
  other?: string;
  level: number;
  point?: { lat: number; lng: number; level: number };
}>;

export interface AddressServiceDeps {
  normalize: NormalizeFn;
}

export interface AddressService {
  normalize(address: string): Promise<NjaResult>;
}

const toNjaResult = (raw: Awaited<ReturnType<NormalizeFn>>): NjaResult => ({
  pref: raw.pref ?? '',
  city: raw.city ?? '',
  town: raw.town ?? '',
  addr: raw.addr ?? '',
  other: raw.other ?? '',
  level: raw.level,
  point: raw.point,
});

/**
 * AddressService を作成する
 *
 * 同じ住所文字列に対して並列で normalize が呼ばれてもキャッシュが破綻しないよう、
 * 値ではなく **Promise** をキャッシュする。
 *
 * @param deps - normalize 関数（テスト時に差し替え可能）
 * @returns AddressService
 * @throws {TypeError} address が空文字または string 以外の場合
 */
export const createAddressService = (deps: AddressServiceDeps): AddressService => {
  if (typeof deps?.normalize !== 'function') {
    throw new TypeError('deps.normalize には normalize 関数を指定してください');
  }
  const cache = new Map<string, Promise<NjaResult>>();

  return {
    normalize: (address: string) => {
      if (typeof address !== 'string' || address === '') {
        throw new TypeError('address には空でない string を指定してください');
      }
      const cached = cache.get(address);
      if (cached) {
        return cached;
      }
      const p = deps.normalize(address).then(toNjaResult).catch((e) => {
        cache.delete(address); // 失敗はキャッシュしない
        throw e;
      });
      cache.set(address, p);
      return p;
    },
  };
};
