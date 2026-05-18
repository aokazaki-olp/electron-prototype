/**
 * getUpdateInfoCorporation.ts
 * @description GET /hojin/updateInfo/corporation_info
 */

import type { Plugin } from '../../../libs/index.js';
import type { GBizUpdateInfoParams } from '../../../ipc/contract.js';

export const getUpdateInfoCorporation: Plugin<unknown, {
  getUpdateInfoCorporation(params: GBizUpdateInfoParams): Promise<unknown>;
}> = (client) => ({
  getUpdateInfoCorporation: (params) =>
    // v2 では /updateInfo/corporation （v1 では /updateInfo/corporation_info）
    client.get('/hojin/updateInfo/corporation', params as Record<string, unknown>),
});
