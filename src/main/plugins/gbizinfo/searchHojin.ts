/**
 * searchHojin.ts
 * @description GET /hojin — 法人検索（部分一致など複数条件）
 */

import type { Plugin } from '../../../libs/index.js';
import type { GBizSearchHojinParams } from '../../../ipc/contract.js';

export const searchHojin: Plugin<unknown, {
  searchHojin(params: GBizSearchHojinParams): Promise<unknown>;
}> = (client) => ({
  // baseUrl は .../hojin/v2 (API ルート)。検索リソースはその下の /hojin。
  searchHojin: (params) => client.get('/hojin', params),
});
