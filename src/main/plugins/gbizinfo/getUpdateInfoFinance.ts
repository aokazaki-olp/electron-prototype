/**
 * getUpdateInfoFinance.ts
 * @description GET /hojin/updateInfo/finance
 */

import type { Plugin } from '../../../libs/index.js';
import type { GBizUpdateInfoParams } from '../../../ipc/contract.js';

export const getUpdateInfoFinance: Plugin<unknown, {
  getUpdateInfoFinance(params: GBizUpdateInfoParams): Promise<unknown>;
}> = (client) => ({
  getUpdateInfoFinance: (params) =>
    client.get('/updateInfo/finance', params as Record<string, unknown>),
});
