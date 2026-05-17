/**
 * getFinance.ts
 * @description GET /hojin/{corporate_number}/finance — 財務情報
 */

import type { Plugin } from '../../../libs/index.js';
import type { GBizGetByNumberParams } from '../../../ipc/contract.js';

export const getFinance: Plugin<unknown, {
  getFinance(params: GBizGetByNumberParams): Promise<unknown>;
}> = (client) => ({
  getFinance: ({ corporate_number }) =>
    client.get(`/${encodeURIComponent(corporate_number)}/finance`),
});
