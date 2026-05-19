/**
 * getUpdateInfoPatent.ts
 * @description GET /hojin/updateInfo/patent
 */

import type { Plugin } from '../../../libs/index.js';
import type { GBizUpdateInfoParams } from '../../../ipc/contract.js';

export const getUpdateInfoPatent: Plugin<unknown, {
  getUpdateInfoPatent(params: GBizUpdateInfoParams): Promise<unknown>;
}> = (client) => ({
  getUpdateInfoPatent: (params) =>
    client.get('/hojin/updateInfo/patent', params),
});
