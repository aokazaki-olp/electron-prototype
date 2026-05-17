/**
 * getPatent.ts
 * @description GET /hojin/{corporate_number}/patent — 特許情報
 */

import type { Plugin } from '../../../libs/index.js';
import type { GBizGetWithPagingParams } from '../../../ipc/contract.js';

export const getPatent: Plugin<unknown, {
  getPatent(params: GBizGetWithPagingParams): Promise<unknown>;
}> = (client) => ({
  getPatent: ({ corporate_number, ...query }) =>
    client.get(`/hojin/${encodeURIComponent(corporate_number)}/patent`, query),
});
