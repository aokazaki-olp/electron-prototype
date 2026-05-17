/**
 * getWorkplace.ts
 * @description GET /hojin/{corporate_number}/workplace — 職場情報
 */

import type { Plugin } from '../../../libs/index.js';
import type { GBizGetByNumberParams } from '../../../ipc/contract.js';

export const getWorkplace: Plugin<unknown, {
  getWorkplace(params: GBizGetByNumberParams): Promise<unknown>;
}> = (client) => ({
  getWorkplace: ({ corporate_number }) =>
    client.get(`/hojin/${encodeURIComponent(corporate_number)}/workplace`),
});
