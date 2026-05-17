/**
 * GBizInfoService.ts
 * @description gBizINFO API のサービス層。
 *              ライブラリの BaseClient (v2 がデフォルト) にプラグイン群を .use() で合成し、
 *              IPC layer から呼べる形にする。
 *
 * 注意:
 *   .use() の named オーバーロード (`use('searchHojin', plugin)`) を使うと、生えるプロパティが
 *   プラグインの戻り値オブジェクトそのもの（`{ searchHojin: fn }`）になってしまい二重化する。
 *   各プラグインは「キー → メソッド」の object を返すよう設計してあるため、
 *   名前なしの `.use(plugin)` で合成する。
 */

import { GBizInfoApiClient } from '../libs/index.js';
import type { BaseClient, Logger } from '../libs/index.js';
import * as plugins from './plugins/gbizinfo/index.js';
import type { GBizApi } from '../ipc/contract.js';

export type GBizService = BaseClient<unknown> & GBizApi;

/**
 * gBizINFO サービスを作成する
 *
 * @param token - gBizINFO API トークン
 * @param logger - ロガー（省略時は無効）
 * @returns 18 メソッドを公開した BaseClient
 */
export const createGBizInfoService = (token: string, logger?: Logger): GBizService => {
  const base = GBizInfoApiClient.create(token, { logger });

  return base
    .use(plugins.searchHojin)
    .use(plugins.getHojin)
    .use(plugins.getCertification)
    .use(plugins.getCommendation)
    .use(plugins.getCorporation)
    .use(plugins.getFinance)
    .use(plugins.getPatent)
    .use(plugins.getProcurement)
    .use(plugins.getSubsidy)
    .use(plugins.getWorkplace)
    .use(plugins.getUpdateInfo)
    .use(plugins.getUpdateInfoCertification)
    .use(plugins.getUpdateInfoCommendation)
    .use(plugins.getUpdateInfoCorporation)
    .use(plugins.getUpdateInfoFinance)
    .use(plugins.getUpdateInfoPatent)
    .use(plugins.getUpdateInfoProcurement)
    .use(plugins.getUpdateInfoSubsidy)
    .use(plugins.getUpdateInfoWorkplace) as unknown as GBizService;
};
