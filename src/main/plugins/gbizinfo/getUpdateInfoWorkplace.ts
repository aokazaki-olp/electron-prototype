/**
 * getUpdateInfoWorkplace.ts
 * @description GET /hojin/updateInfo/workplace
 */

import type { Plugin } from '../../../libs/index.js';
import type { GBizUpdateInfoParams } from '../../../ipc/contract.js';

export const getUpdateInfoWorkplace: Plugin<unknown, {
  getUpdateInfoWorkplace(params: GBizUpdateInfoParams): Promise<unknown>;
}> = (client) => ({
  getUpdateInfoWorkplace: (params) =>
    client.get('/hojin/updateInfo/workplace', params as Record<string, unknown>),
});
