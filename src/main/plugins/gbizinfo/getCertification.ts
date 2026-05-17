/**
 * getCertification.ts
 * @description GET /hojin/{corporate_number}/certification — 認定情報
 */

import type { Plugin } from '../../../libs/index.js';
import type { GBizGetWithPagingParams } from '../../../ipc/contract.js';

export const getCertification: Plugin<unknown, {
  getCertification(params: GBizGetWithPagingParams): Promise<unknown>;
}> = (client) => ({
  getCertification: ({ corporate_number, ...query }) =>
    client.get(`/${encodeURIComponent(corporate_number)}/certification`, query),
});
