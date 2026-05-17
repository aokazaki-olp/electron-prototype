/**
 * getUpdateInfo.ts
 * @description GET /hojin/updateInfo — 更新情報（全データ種別）
 */

import type { Plugin } from '../../../libs/index.js';
import type { GBizUpdateInfoParams } from '../../../ipc/contract.js';

export const getUpdateInfo: Plugin<unknown, {
  getUpdateInfo(params: GBizUpdateInfoParams): Promise<unknown>;
}> = (client) => ({
  getUpdateInfo: (params) => client.get('/updateInfo', params as Record<string, unknown>),
});
