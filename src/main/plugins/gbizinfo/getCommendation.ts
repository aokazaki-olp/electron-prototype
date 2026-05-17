/**
 * getCommendation.ts
 * @description GET /hojin/{corporate_number}/commendation — 表彰情報
 */

import type { Plugin } from '../../../libs/index.js';
import type { GBizGetWithPagingParams } from '../../../ipc/contract.js';

export const getCommendation: Plugin<unknown, {
  getCommendation(params: GBizGetWithPagingParams): Promise<unknown>;
}> = (client) => ({
  getCommendation: ({ corporate_number, ...query }) =>
    client.get(`/${encodeURIComponent(corporate_number)}/commendation`, query),
});
