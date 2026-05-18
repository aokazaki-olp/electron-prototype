/**
 * contract.ts
 * @description main / preload / renderer 三者で共有する IPC 契約。
 *              ここを単一の真実とし、preload は satisfies で実装の妥当性を検証する。
 */

// ============================================================================
// gBizINFO ドメイン型（最低限）
//   仕様の完全表現はしない。レスポンスは unknown で受けて UI 側で表示するため、
//   ここでは「呼び出し側に必要な引数の形」と「戻り値が unknown であること」だけ宣言する。
// ============================================================================

/**
 * v2 全エンドポイント共通の追加パラメータ。"true" 指定でレスポンスに meta-data が含まれる。
 */
export interface GBizMetadataFlag {
  metadata_flg?: 'true' | 'false';
}

/**
 * v2 法人検索パラメータ。Swagger v2 に合わせて整理：
 *   - 削除: business_item, business_summary, founded_year_from/to, sales_area,
 *           unified_qualification 系 (v1 のみ)
 *   - 追加: founded_year (単一), net_sales/total_assets 範囲, 平均年齢系,
 *           patent / procurement / subsidy / certification / ministry / source
 * Swagger 上は全パラメータ string 型なので number 系も最終的には文字列で送る。
 * 型はアプリ内での扱いやすさを優先して number で保持する。
 */
export interface GBizSearchHojinParams extends GBizMetadataFlag {
  name?: string;
  corporate_number?: string;
  exist_flg?: string;
  corporate_type?: string;
  prefecture?: string;
  city?: string;
  capital_stock_from?: number;
  capital_stock_to?: number;
  employee_number_from?: number;
  employee_number_to?: number;
  founded_year?: number;
  net_sales_summary_of_business_results_from?: number;
  net_sales_summary_of_business_results_to?: number;
  total_assets_summary_of_business_results_from?: number;
  total_assets_summary_of_business_results_to?: number;
  average_continuous_service_years?: number;
  average_age?: number;
  month_average_predetermined_overtime_hours?: number;
  female_workers_proportion?: number;
  patent?: string;
  procurement?: string;
  procurement_amount_from?: number;
  procurement_amount_to?: number;
  subsidy?: string;
  subsidy_amount_from?: number;
  subsidy_amount_to?: number;
  certification?: string;
  ministry?: string;
  source?: string;
  page?: number;
  limit?: number;
  [key: string]: unknown;
}

export interface GBizGetByNumberParams extends GBizMetadataFlag {
  corporate_number: string;
}

export interface GBizGetWithPagingParams extends GBizGetByNumberParams {
  page?: number;
  limit?: number;
  [key: string]: unknown;
}

export interface GBizUpdateInfoParams extends GBizMetadataFlag {
  from: string; // YYYY-MM-DD
  to: string;
  page?: number;
  limit?: number;
  [key: string]: unknown;
}

export interface GBizApi {
  // 通常系
  searchHojin(params: GBizSearchHojinParams): Promise<unknown>;
  getHojin(params: GBizGetByNumberParams): Promise<unknown>;
  getCertification(params: GBizGetWithPagingParams): Promise<unknown>;
  getCommendation(params: GBizGetWithPagingParams): Promise<unknown>;
  getCorporation(params: GBizGetByNumberParams): Promise<unknown>;
  getFinance(params: GBizGetByNumberParams): Promise<unknown>;
  getPatent(params: GBizGetWithPagingParams): Promise<unknown>;
  getProcurement(params: GBizGetWithPagingParams): Promise<unknown>;
  getSubsidy(params: GBizGetWithPagingParams): Promise<unknown>;
  getWorkplace(params: GBizGetByNumberParams): Promise<unknown>;

  // 更新情報系
  getUpdateInfo(params: GBizUpdateInfoParams): Promise<unknown>;
  getUpdateInfoCertification(params: GBizUpdateInfoParams): Promise<unknown>;
  getUpdateInfoCommendation(params: GBizUpdateInfoParams): Promise<unknown>;
  getUpdateInfoCorporation(params: GBizUpdateInfoParams): Promise<unknown>;
  getUpdateInfoFinance(params: GBizUpdateInfoParams): Promise<unknown>;
  getUpdateInfoPatent(params: GBizUpdateInfoParams): Promise<unknown>;
  getUpdateInfoProcurement(params: GBizUpdateInfoParams): Promise<unknown>;
  getUpdateInfoSubsidy(params: GBizUpdateInfoParams): Promise<unknown>;
  getUpdateInfoWorkplace(params: GBizUpdateInfoParams): Promise<unknown>;
}

// ============================================================================
// NJA
// ============================================================================

export interface NjaPoint {
  lat: number;
  lng: number;
  level: number;
}

export interface NjaResult {
  pref: string;
  city: string;
  town: string;
  addr: string;
  other: string;
  level: number;
  point?: NjaPoint;
}

export interface NjaApi {
  normalize(address: string): Promise<NjaResult>;
}

// ============================================================================
// Shell
// ============================================================================

export interface ShellApi {
  openExternal(url: string): Promise<void>;
}

// ============================================================================
// IPC channel names（main / preload で共通の文字列定数）
// ============================================================================

export const GBIZ_CHANNELS = [
  'searchHojin',
  'getHojin',
  'getCertification',
  'getCommendation',
  'getCorporation',
  'getFinance',
  'getPatent',
  'getProcurement',
  'getSubsidy',
  'getWorkplace',
  'getUpdateInfo',
  'getUpdateInfoCertification',
  'getUpdateInfoCommendation',
  'getUpdateInfoCorporation',
  'getUpdateInfoFinance',
  'getUpdateInfoPatent',
  'getUpdateInfoProcurement',
  'getUpdateInfoSubsidy',
  'getUpdateInfoWorkplace',
] as const;

export type GBizChannel = typeof GBIZ_CHANNELS[number];

export const gbizChannel = (name: GBizChannel): string => `gbiz:${name}`;
export const NJA_CHANNEL = 'nja:normalize';
export const SHELL_OPEN_EXTERNAL_CHANNEL = 'shell:openExternal';
