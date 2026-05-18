/**
 * getCorporation.ts
 * @description GET /hojin/{corporate_number}/corporation_info — 法人活動情報
 */

import type { Plugin } from '../../../libs/index.js';
import type { GBizGetByNumberParams } from '../../../ipc/contract.js';

export const getCorporation: Plugin<unknown, {
  getCorporation(params: GBizGetByNumberParams): Promise<unknown>;
}> = (client) => ({
  getCorporation: ({ corporate_number }) =>
    // v2 では /corporation （v1 では /corporation_info）
    client.get(`/hojin/${encodeURIComponent(corporate_number)}/corporation`),
});
