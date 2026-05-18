/**
 * endpoints.ts
 * @description 18 エンドポイントの入力フォーム定義（静的）と、レスポンスから住所を抽出する関数。
 *              OpenAPI 自動生成は使わず、手書きで保守する（プロトタイプ方針）。
 */

import type { GBizChannel } from '../ipc/contract.js';

export type FieldType = 'text' | 'number' | 'date';

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
}

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

const UPDATE_INFO_FIELDS: FieldDef[] = [
  { name: 'from', label: 'from (YYYY-MM-DD)', type: 'date', required: true },
  { name: 'to', label: 'to (YYYY-MM-DD)', type: 'date', required: true },
];

// 住所フィールドの候補パス。gBizINFO は配列 'hojin-infos[0]' を持つことが多い。
// ドット記法 + '[]' で「先頭要素を辿る」を表現する（簡易）。
const HOJIN_LOCATION = ['hojin-infos[].location'];
const WORKPLACE_LOCATION = ['workplace[].location', 'hojin-infos[].location'];

export const ENDPOINTS: readonly EndpointDef[] = [
  {
    id: 'searchHojin',
    label: 'searchHojin (法人検索)',
    category: '基本',
    fields: [
      { name: 'name', label: '法人名（部分一致）', type: 'text' },
      { name: 'corporate_number', label: '法人番号', type: 'text' },
      { name: 'prefecture', label: '都道府県コード', type: 'text' },
      { name: 'city', label: '市区町村コード', type: 'text' },
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
