/**
 * getHojin.ts
 * @description GET /hojin/{corporate_number} — 法人基本情報
 */

import type { Plugin } from '../../../libs/index.js';
import type { GBizGetByNumberParams } from '../../../ipc/contract.js';

export const getHojin: Plugin<unknown, {
  getHojin(params: GBizGetByNumberParams): Promise<unknown>;
}> = (client) => ({
  getHojin: ({ corporate_number }) =>
    client.get(`/${encodeURIComponent(corporate_number)}`),
});
