/**
 * endpoints.ts
 * @description 18 エンドポイントの入力フォーム定義（静的）と、レスポンスから住所を抽出する関数。
 *              OpenAPI 自動生成は使わず、手書きで保守する（プロトタイプ方針）。
 */

import type { GBizChannel } from '../ipc/contract.js';

export type FieldType = 'text' | 'number' | 'date' | 'checkbox';

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
}

/**
 * v2 全エンドポイント共通の追加パラメータ。各 endpoint の fields 末尾に自動的に付ける。
 */
export const COMMON_FIELDS: readonly FieldDef[] = [
  { name: 'metadata_flg', label: 'メタデータ取得 (metadata_flg)', type: 'checkbox' },
];

export type EndpointCategory = '基本' | '関連情報' | '更新情報';

export interface EndpointDef {
  id: GBizChannel;
  label: string;
  category: EndpointCategory;
  fields: FieldDef[];
  /** レスポンスから住所文字列を抽出するパス。複数候補のうち最初に見つかったものを使う */
  addressFieldPaths?: string[];
}

const NUMBER_FIELD: FieldDef = {
  name: 'corporate_number',
  label: '法人番号 (13桁)',
  type: 'text',
  required: true,
  placeholder: '1234567890123',
};

// v2 は yyyyMMdd を要求するが、HTML の date input は YYYY-MM-DD で値を保持する。
// 送信時にハイフンを除去する変換は App.tsx 側の buildParams で行う。
const UPDATE_INFO_FIELDS: FieldDef[] = [
  { name: 'from', label: 'from (期間開始)', type: 'date', required: true },
  { name: 'to', label: 'to (期間終了)', type: 'date', required: true },
];

// 住所フィールドの候補パス。gBizINFO は配列 'hojin-infos[0]' を持つことが多い。
// ドット記法 + '[]' で「先頭要素を辿る」を表現する（簡易）。
const HOJIN_LOCATION = ['hojin-infos[].location'];
const WORKPLACE_LOCATION = ['workplace[].location', 'hojin-infos[].location'];

const RAW_ENDPOINTS: readonly EndpointDef[] = [
  {
    id: 'searchHojin',
    label: 'searchHojin (法人検索)',
    category: '基本',
    // v2 では多くのパラメータが追加されている。プロトタイプでは代表的なものだけ露出する。
    // 残りは contract.ts の [key: string]: unknown 経由で生 JSON で呼び出し可能。
    fields: [
      { name: 'name', label: '法人名（部分一致）', type: 'text' },
      { name: 'corporate_number', label: '法人番号', type: 'text' },
      { name: 'corporate_type', label: '法人種別', type: 'text' },
      { name: 'prefecture', label: '都道府県コード', type: 'text' },
      { name: 'city', label: '市区町村コード', type: 'text' },
      { name: 'exist_flg', label: '存続フラグ', type: 'text' },
      { name: 'capital_stock_from', label: '資本金 (以上)', type: 'number' },
      { name: 'capital_stock_to', label: '資本金 (以下)', type: 'number' },
      { name: 'employee_number_from', label: '従業員数 (以上)', type: 'number' },
      { name: 'employee_number_to', label: '従業員数 (以下)', type: 'number' },
      { name: 'founded_year', label: '創業年', type: 'number' },
      { name: 'patent', label: '特許 (商標フラグ)', type: 'text' },
      { name: 'procurement', label: '調達 (フラグ)', type: 'text' },
      { name: 'procurement_amount_from', label: '調達額 (以上)', type: 'number' },
      { name: 'procurement_amount_to', label: '調達額 (以下)', type: 'number' },
      { name: 'subsidy', label: '補助金 (フラグ)', type: 'text' },
      { name: 'subsidy_amount_from', label: '補助金額 (以上)', type: 'number' },
      { name: 'subsidy_amount_to', label: '補助金額 (以下)', type: 'number' },
      { name: 'certification', label: '届出・認定・表彰 (フラグ)', type: 'text' },
      { name: 'ministry', label: '中央省庁 (ministry)', type: 'text' },
      { name: 'source', label: '出典元 (source)', type: 'text' },
    ],
    addressFieldPaths: HOJIN_LOCATION,
  },
  {
    id: 'getHojin',
    label: 'getHojin (法人基本)',
    category: '基本',
    fields: [NUMBER_FIELD],
    addressFieldPaths: HOJIN_LOCATION,
  },
  {
    id: 'getCertification',
    label: 'getCertification (認定)',
    category: '関連情報',
    fields: [NUMBER_FIELD],
  },
  {
    id: 'getCommendation',
    label: 'getCommendation (表彰)',
    category: '関連情報',
    fields: [NUMBER_FIELD],
  },
  {
    id: 'getCorporation',
    label: 'getCorporation (活動情報)',
    category: '関連情報',
    fields: [NUMBER_FIELD],
  },
  {
    id: 'getFinance',
    label: 'getFinance (財務)',
    category: '関連情報',
    fields: [NUMBER_FIELD],
  },
  {
    id: 'getPatent',
    label: 'getPatent (特許)',
    category: '関連情報',
    fields: [NUMBER_FIELD],
  },
  {
    id: 'getProcurement',
    label: 'getProcurement (調達)',
    category: '関連情報',
    fields: [NUMBER_FIELD],
  },
  {
    id: 'getSubsidy',
    label: 'getSubsidy (補助金)',
    category: '関連情報',
    fields: [NUMBER_FIELD],
  },
  {
    id: 'getWorkplace',
    label: 'getWorkplace (職場)',
    category: '関連情報',
    fields: [NUMBER_FIELD],
    addressFieldPaths: WORKPLACE_LOCATION,
  },
  {
    id: 'getUpdateInfo',
    label: 'getUpdateInfo (全種別)',
    category: '更新情報',
    fields: UPDATE_INFO_FIELDS,
  },
  {
    id: 'getUpdateInfoCertification',
    label: 'getUpdateInfoCertification',
    category: '更新情報',
    fields: UPDATE_INFO_FIELDS,
  },
  {
    id: 'getUpdateInfoCommendation',
    label: 'getUpdateInfoCommendation',
    category: '更新情報',
    fields: UPDATE_INFO_FIELDS,
  },
  {
    id: 'getUpdateInfoCorporation',
    label: 'getUpdateInfoCorporation',
    category: '更新情報',
    fields: UPDATE_INFO_FIELDS,
  },
  {
    id: 'getUpdateInfoFinance',
    label: 'getUpdateInfoFinance',
    category: '更新情報',
    fields: UPDATE_INFO_FIELDS,
  },
  {
    id: 'getUpdateInfoPatent',
    label: 'getUpdateInfoPatent',
    category: '更新情報',
    fields: UPDATE_INFO_FIELDS,
  },
  {
    id: 'getUpdateInfoProcurement',
    label: 'getUpdateInfoProcurement',
    category: '更新情報',
    fields: UPDATE_INFO_FIELDS,
  },
  {
    id: 'getUpdateInfoSubsidy',
    label: 'getUpdateInfoSubsidy',
    category: '更新情報',
    fields: UPDATE_INFO_FIELDS,
  },
  {
    id: 'getUpdateInfoWorkplace',
    label: 'getUpdateInfoWorkplace',
    category: '更新情報',
    fields: UPDATE_INFO_FIELDS,
  },
];

/**
 * 各エンドポイントの末尾に COMMON_FIELDS (metadata_flg 等) を自動付与した正式版。
 * UI / フォーム生成からはこちらを参照する。
 */
export const ENDPOINTS: readonly EndpointDef[] = RAW_ENDPOINTS.map((e) => ({
  ...e,
  fields: [...e.fields, ...COMMON_FIELDS],
}));

/**
 * 'foo.bar[].baz' のような簡易パス記法でレスポンスから住所文字列を抽出する。
 * '[]' は配列の先頭要素を辿る。見つからなければ undefined。
 */
export const extractFirstAddress = (
  data: unknown,
  paths: readonly string[] | undefined,
): string | undefined => {
  if (!paths || data == null) {
    return undefined;
  }
  for (const path of paths) {
    const addr = walk(data, path.split('.'));
    if (typeof addr === 'string' && addr !== '') {
      return addr;
    }
  }
  return undefined;
};

const walk = (node: unknown, segments: string[]): unknown => {
  let current: unknown = node;
  for (const seg of segments) {
    if (current == null) {
      return undefined;
    }
    if (seg.endsWith('[]')) {
      const key = seg.slice(0, -2);
      const arr = (current as Record<string, unknown>)[key];
      if (!Array.isArray(arr) || arr.length === 0) {
        return undefined;
      }
      current = arr[0];
    } else {
      current = (current as Record<string, unknown>)[seg];
    }
  }
  return current;
};
