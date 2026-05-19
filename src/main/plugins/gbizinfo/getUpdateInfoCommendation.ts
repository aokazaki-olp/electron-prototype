/**
 * getUpdateInfoCommendation.ts
 * @description GET /hojin/updateInfo/commendation
 */

import type { Plugin } from '../../../libs/index.js';
import type { GBizUpdateInfoParams } from '../../../ipc/contract.js';

export const getUpdateInfoCommendation: Plugin<unknown, {
  getUpdateInfoCommendation(params: GBizUpdateInfoParams): Promise<unknown>;
}> = (client) => ({
  getUpdateInfoCommendation: (params) =>
    client.get('/hojin/updateInfo/commendation', params),
});
