/**
 * searchHojin.ts
 * @description GET /hojin — 法人検索（部分一致など複数条件）
 */

import type { Plugin } from '../../../libs/index.js';
import type { GBizSearchHojinParams } from '../../../ipc/contract.js';

export const searchHojin: Plugin<unknown, {
  searchHojin(params: GBizSearchHojinParams): Promise<unknown>;
}> = (client) => ({
  // baseUrl 末尾が /hojin/v1 のため endpoint は '' (search はベースそのものへ GET)
  searchHojin: (params) => client.get('', params as Record<string, unknown>),
});
