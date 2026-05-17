/**
 * getUpdateInfoCertification.ts
 * @description GET /hojin/updateInfo/certification
 */

import type { Plugin } from '../../../libs/index.js';
import type { GBizUpdateInfoParams } from '../../../ipc/contract.js';

export const getUpdateInfoCertification: Plugin<unknown, {
  getUpdateInfoCertification(params: GBizUpdateInfoParams): Promise<unknown>;
}> = (client) => ({
  getUpdateInfoCertification: (params) =>
    client.get('/updateInfo/certification', params as Record<string, unknown>),
});
