/**
 * getUpdateInfoSubsidy.ts
 * @description GET /hojin/updateInfo/subsidy
 */

import type { Plugin } from '../../../libs/index.js';
import type { GBizUpdateInfoParams } from '../../../ipc/contract.js';

export const getUpdateInfoSubsidy: Plugin<unknown, {
  getUpdateInfoSubsidy(params: GBizUpdateInfoParams): Promise<unknown>;
}> = (client) => ({
  getUpdateInfoSubsidy: (params) =>
    client.get('/hojin/updateInfo/subsidy', params),
});
