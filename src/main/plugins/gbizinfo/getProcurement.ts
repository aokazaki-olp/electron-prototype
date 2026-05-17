/**
 * getProcurement.ts
 * @description GET /hojin/{corporate_number}/procurement — 行政機関の調達情報
 */

import type { Plugin } from '../../../libs/index.js';
import type { GBizGetWithPagingParams } from '../../../ipc/contract.js';

export const getProcurement: Plugin<unknown, {
  getProcurement(params: GBizGetWithPagingParams): Promise<unknown>;
}> = (client) => ({
  getProcurement: ({ corporate_number, ...query }) =>
    client.get(`/hojin/${encodeURIComponent(corporate_number)}/procurement`, query),
});
