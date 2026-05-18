/**
 * endpoints.ts
 * @description 19 エンドポイントの入力フォーム定義（静的）と、レスポンスから住所を抽出する関数。
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
  /** ラベル横の ❓ に title 属性で表示するヘルプテキスト */
  hint?: string;
  /** true のとき、このフィールドから「詳細条件」折りたたみセクションが始まる */
  sectionBreak?: boolean;
}

/**
 * v2 全エンドポイント共通の追加パラメータ。各 endpoint の fields 末尾に自動的に付ける。
 */
export const COMMON_FIELDS: readonly FieldDef[] = [
  {
    name: 'metadata_flg',
    label: 'メタデータ取得',
    type: 'checkbox',
    hint: 'チェックすると出典・更新日などのメタデータもレスポンスに含まれます',
  },
];

export type EndpointCategory = '基本' | '関連情報' | '更新情報';

export interface EndpointDef {
  id: GBizChannel;
  label: string;
  /** メインパネルのタイトル下に表示する説明文 */
  description: string;
  category: EndpointCategory;
  fields: FieldDef[];
  /** 送信ボタンのラベル（未指定なら「取得」） */
  sendLabel?: string;
  /** レスポンスから住所文字列を抽出するパス候補 */
  addressFieldPaths?: string[];
}

const CORPORATE_NUMBER_FIELD: FieldDef = {
  name: 'corporate_number',
  label: '法人番号（13桁）',
  type: 'text',
  required: true,
  placeholder: '1234567890123',
  hint: '国税庁法人番号公表サイトで確認できます',
};

const PAGING_FIELDS: readonly FieldDef[] = [
  { name: 'page', label: 'ページ番号', type: 'number', placeholder: '1' },
  { name: 'limit', label: '1ページの件数', type: 'number', placeholder: '20', hint: '最大 100' },
];

// v2 は yyyyMMdd を要求するが、HTML の date input は YYYY-MM-DD で値を保持する。
// 送信時にハイフンを除去する変換は App.tsx の buildParams で行う。
const UPDATE_INFO_FIELDS: readonly FieldDef[] = [
  { name: 'from', label: '期間開始日', type: 'date', required: true, hint: 'この日以降に更新されたデータを取得します' },
  { name: 'to', label: '期間終了日', type: 'date', required: true, hint: 'この日以前に更新されたデータを取得します' },
  ...PAGING_FIELDS,
];

const HOJIN_LOCATION = ['hojin-infos[].location'];
const WORKPLACE_LOCATION = ['workplace[].location', 'hojin-infos[].location'];

const RAW_ENDPOINTS: readonly EndpointDef[] = [
  {
    id: 'searchHojin',
    label: '法人検索',
    description: '法人名・業種・地域など複数の条件で法人を一覧検索します。まずここで法人を見つけ、一覧から法人番号を取得するのがおすすめです。',
    sendLabel: '検索',
    category: '基本',
    fields: [
      { name: 'name', label: '法人名（部分一致）', type: 'text', placeholder: 'トヨタ自動車' },
      { name: 'corporate_number', label: '法人番号', type: 'text', placeholder: '1234567890123' },
      { name: 'corporate_type', label: '法人種別', type: 'text', placeholder: '株式会社', hint: '例: 株式会社、有限会社、合同会社、NPO法人' },
      { name: 'prefecture', label: '都道府県コード', type: 'text', placeholder: '13', hint: 'JIS X 0401 コード。13 = 東京都、27 = 大阪府、23 = 愛知県' },
      { name: 'city', label: '市区町村コード', type: 'text', placeholder: '13101', hint: 'JIS X 0402 コード（任意）' },
      ...PAGING_FIELDS,
      // ↓ ここから詳細条件（sectionBreak で折りたたみ開始）
      { name: 'exist_flg', label: '存続フラグ', type: 'text', placeholder: '1', hint: '1 = 現存企業のみ、0 = 廃業・解散済みのみ', sectionBreak: true },
      { name: 'capital_stock_from', label: '資本金（以上）', type: 'number', placeholder: '10000000', hint: '単位: 円' },
      { name: 'capital_stock_to', label: '資本金（以下）', type: 'number', placeholder: '100000000', hint: '単位: 円' },
      { name: 'employee_number_from', label: '従業員数（以上）', type: 'number', placeholder: '10' },
      { name: 'employee_number_to', label: '従業員数（以下）', type: 'number', placeholder: '1000' },
      { name: 'founded_year', label: '創業年', type: 'number', placeholder: '2000', hint: '西暦4桁' },
      { name: 'patent', label: '特許あり', type: 'text', placeholder: '1', hint: '1 = 特許・実用新案の保有実績あり' },
      { name: 'procurement', label: '調達あり', type: 'text', placeholder: '1', hint: '1 = 政府調達の実績あり' },
      { name: 'procurement_amount_from', label: '調達額（以上）', type: 'number', hint: '単位: 円' },
      { name: 'procurement_amount_to', label: '調達額（以下）', type: 'number', hint: '単位: 円' },
      { name: 'subsidy', label: '補助金あり', type: 'text', placeholder: '1', hint: '1 = 補助金・助成金の受給実績あり' },
      { name: 'subsidy_amount_from', label: '補助金額（以上）', type: 'number', hint: '単位: 円' },
      { name: 'subsidy_amount_to', label: '補助金額（以下）', type: 'number', hint: '単位: 円' },
      { name: 'certification', label: '届出・認定・表彰あり', type: 'text', placeholder: '1' },
      { name: 'ministry', label: '中央省庁コード', type: 'text', hint: 'ministry パラメータ（任意）' },
      { name: 'source', label: '出典元', type: 'text', hint: 'source パラメータ（任意）' },
    ],
    addressFieldPaths: HOJIN_LOCATION,
  },
  {
    id: 'getHojin',
    label: '法人基本情報',
    description: '法人番号を指定して、法人の基本情報（名称・住所・資本金・従業員数など）を取得します。',
    category: '基本',
    fields: [CORPORATE_NUMBER_FIELD],
    addressFieldPaths: HOJIN_LOCATION,
  },
  {
    id: 'getCertification',
    label: '認定情報',
    description: '指定した法人の届出・認定情報（ISO・Pマーク・くるみんなど）を取得します。',
    category: '関連情報',
    fields: [CORPORATE_NUMBER_FIELD, ...PAGING_FIELDS],
  },
  {
    id: 'getCommendation',
    label: '表彰情報',
    description: '指定した法人が受けた表彰・顕彰情報を取得します。',
    category: '関連情報',
    fields: [CORPORATE_NUMBER_FIELD, ...PAGING_FIELDS],
  },
  {
    id: 'getCorporation',
    label: '活動情報',
    description: '指定した法人の経営・活動情報（売上高・従業員数の推移など）を取得します。',
    category: '関連情報',
    fields: [CORPORATE_NUMBER_FIELD],
  },
  {
    id: 'getFinance',
    label: '財務情報',
    description: '指定した法人の財務情報（貸借対照表・損益計算書など）を取得します。',
    category: '関連情報',
    fields: [CORPORATE_NUMBER_FIELD],
  },
  {
    id: 'getPatent',
    label: '特許情報',
    description: '指定した法人が保有する特許・実用新案情報を取得します。',
    category: '関連情報',
    fields: [CORPORATE_NUMBER_FIELD, ...PAGING_FIELDS],
  },
  {
    id: 'getProcurement',
    label: '調達情報',
    description: '指定した法人の政府調達（入札・契約）情報を取得します。',
    category: '関連情報',
    fields: [CORPORATE_NUMBER_FIELD, ...PAGING_FIELDS],
  },
  {
    id: 'getSubsidy',
    label: '補助金情報',
    description: '指定した法人が受給した補助金・助成金情報を取得します。',
    category: '関連情報',
    fields: [CORPORATE_NUMBER_FIELD, ...PAGING_FIELDS],
  },
  {
    id: 'getWorkplace',
    label: '職場環境',
    description: '指定した法人の職場環境・働き方情報（平均年齢・育休取得率など）を取得します。',
    category: '関連情報',
    fields: [CORPORATE_NUMBER_FIELD],
    addressFieldPaths: WORKPLACE_LOCATION,
  },
  {
    id: 'getUpdateInfo',
    label: '更新情報（全種別）',
    description: '指定した期間内に更新されたすべての種別のデータを取得します。',
    category: '更新情報',
    fields: [...UPDATE_INFO_FIELDS],
  },
  {
    id: 'getUpdateInfoCertification',
    label: '更新: 認定',
    description: '指定した期間内に更新された認定情報を取得します。',
    category: '更新情報',
    fields: [...UPDATE_INFO_FIELDS],
  },
  {
    id: 'getUpdateInfoCommendation',
    label: '更新: 表彰',
    description: '指定した期間内に更新された表彰情報を取得します。',
    category: '更新情報',
    fields: [...UPDATE_INFO_FIELDS],
  },
  {
    id: 'getUpdateInfoCorporation',
    label: '更新: 活動情報',
    description: '指定した期間内に更新された活動情報を取得します。',
    category: '更新情報',
    fields: [...UPDATE_INFO_FIELDS],
  },
  {
    id: 'getUpdateInfoFinance',
    label: '更新: 財務',
    description: '指定した期間内に更新された財務情報を取得します。',
    category: '更新情報',
    fields: [...UPDATE_INFO_FIELDS],
  },
  {
    id: 'getUpdateInfoPatent',
    label: '更新: 特許',
    description: '指定した期間内に更新された特許情報を取得します。',
    category: '更新情報',
    fields: [...UPDATE_INFO_FIELDS],
  },
  {
    id: 'getUpdateInfoProcurement',
    label: '更新: 調達',
    description: '指定した期間内に更新された調達情報を取得します。',
    category: '更新情報',
    fields: [...UPDATE_INFO_FIELDS],
  },
  {
    id: 'getUpdateInfoSubsidy',
    label: '更新: 補助金',
    description: '指定した期間内に更新された補助金情報を取得します。',
    category: '更新情報',
    fields: [...UPDATE_INFO_FIELDS],
  },
  {
    id: 'getUpdateInfoWorkplace',
    label: '更新: 職場環境',
    description: '指定した期間内に更新された職場環境情報を取得します。',
    category: '更新情報',
    fields: [...UPDATE_INFO_FIELDS],
  },
];

/**
 * 各エンドポイントの末尾に COMMON_FIELDS (metadata_flg 等) を自動付与した正式版。
 * UI / フォーム生成からはこちらを参照する。
 *
 * RAW_ENDPOINTS は静的に 19 要素があることが保証されているため非空タプル型にアサートし、
 * ENDPOINTS[0] アクセスが `!` なしで型安全に行えるようにする。
 */
export const ENDPOINTS: readonly [EndpointDef, ...EndpointDef[]] = RAW_ENDPOINTS.map((e) => ({
  ...e,
  fields: [...e.fields, ...COMMON_FIELDS],
})) as unknown as readonly [EndpointDef, ...EndpointDef[]];

/**
 * 簡易パス記法でレスポンスから住所文字列を抽出する
 *
 * @param data - レスポンスデータ（unknown）
 * @param paths - `'foo.bar[].baz'` 形式のパス候補。`[]` は配列の先頭要素を辿る
 * @returns 最初に見つかった住所文字列。見つからなければ undefined
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
