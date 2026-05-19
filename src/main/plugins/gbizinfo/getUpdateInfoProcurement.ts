/**
 * getUpdateInfoProcurement.ts
 * @description GET /hojin/updateInfo/procurement
 */

import type { Plugin } from '../../../libs/index.js';
import type { GBizUpdateInfoParams } from '../../../ipc/contract.js';

export const getUpdateInfoProcurement: Plugin<unknown, {
  getUpdateInfoProcurement(params: GBizUpdateInfoParams): Promise<unknown>;
}> = (client) => ({
  getUpdateInfoProcurement: (params) =>
    client.get('/hojin/updateInfo/procurement', params),
});
