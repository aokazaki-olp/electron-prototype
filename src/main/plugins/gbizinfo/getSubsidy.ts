/**
 * getSubsidy.ts
 * @description GET /hojin/{corporate_number}/subsidy — 補助金交付情報
 */

import type { Plugin } from '../../../libs/index.js';
import type { GBizGetWithPagingParams } from '../../../ipc/contract.js';

export const getSubsidy: Plugin<unknown, {
  getSubsidy(params: GBizGetWithPagingParams): Promise<unknown>;
}> = (client) => ({
  getSubsidy: ({ corporate_number, ...query }) =>
    client.get(`/hojin/${encodeURIComponent(corporate_number)}/subsidy`, query),
});
