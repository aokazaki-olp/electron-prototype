/**
 * sfApi.ts
 * @description Salesforce API ラッパー（describeキャッシュ・書き込みセッション管理・「現在のプロファイル」一元管理）
 */

import {
  SalesforceApiClient as SfClient,
  SalesforceApiClientPlugins as SfPlugins,
} from '@app/libs';
import { getAccessToken, getInstanceUrl } from './sfOAuth.js';
import { getProfile } from './settings.js';
import { auditLog, log, appLogger } from './logger.js';
import type {
  SObjectSummary,
  SObjectDescribe,
  QueryResult,
  FieldDescribe,
} from '@app/ipc-contract';

// ============================================================================
// 共通: 外部レスポンス用の型ガード
// ============================================================================

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// ============================================================================
// describeキャッシュ
// ============================================================================

const describeCache = new Map<string, SObjectDescribe>();

/**
 * describe キャッシュをすべて破棄する。
 *
 * @remarks プロファイル切替時に [[setCurrentProfile]] から自動的に呼ばれる。
 */
export const clearDescribeCache = (): void => {
  describeCache.clear();
  log.debug('[SF] describeキャッシュをクリアしました');
};

// ============================================================================
// 書き込みセッション
// ============================================================================

// profileId → 再認証した時刻 (Date.now())
const writeSessionMap = new Map<string, number>();

/**
 * 書き込み再認証セッションを開始としてマークする。
 *
 * @param profileId - 再認証が完了したプロファイル ID
 */
export const markWriteSession = (profileId: string): void => {
  writeSessionMap.set(profileId, Date.now());
};

/**
 * 書き込み再認証セッションを破棄する。
 *
 * @param profileId - 破棄対象のプロファイル ID
 */
export const clearWriteSession = (profileId: string): void => {
  writeSessionMap.delete(profileId);
};

const isWriteSessionValid = (profileId: string): boolean => {
  const profile = getProfile(profileId);
  if (!profile || profile.mode !== 'readwrite') {
    return false;
  }
  // timeoutMin === 0 は毎回確認
  if (profile.writeSessionTimeoutMin === 0) {
    return false;
  }
  const authorizedAt = writeSessionMap.get(profileId);
  if (authorizedAt == null) {
    return false;
  }
  return Date.now() - authorizedAt < profile.writeSessionTimeoutMin * 60 * 1000;
};

// ============================================================================
// 「現在のプロファイル」一元管理
// ============================================================================

let currentProfileId: string | null = null;

/**
 * 「現在操作中のプロファイル」を切り替える。プロファイルが変わった場合は describe キャッシュも破棄する。
 *
 * @param profileId - 新しく操作対象とするプロファイル ID。`null` で切断扱い
 */
export const setCurrentProfile = (profileId: string | null): void => {
  if (currentProfileId !== profileId) {
    clearDescribeCache();
    currentProfileId = profileId;
  }
};

/**
 * 現在操作中のプロファイル ID を返す。未設定の場合は `null`。
 *
 * @returns 現アクティブプロファイル ID
 */
export const getCurrentProfile = (): string | null => currentProfileId;

/**
 * 現アクティブプロファイル ID を取得し、未設定の場合は例外を投げる。
 *
 * @returns 現アクティブプロファイル ID
 * @throws {Error} 未接続（プロファイル未選択）の場合
 */
export const requireCurrentProfile = (): string => {
  if (currentProfileId == null) {
    throw new Error('プロファイルが選択されていません');
  }
  return currentProfileId;
};

// ============================================================================
// クライアント生成
// ============================================================================

// SalesforceApiClient のジェネリクスはエンドポイントごとに型が異なるため、
// ここでは型を持たせず、呼出側で `isPlainObject` 等の型ガードで narrowing する方針。
const getClient = (profileId: string) => {
  const accessToken = getAccessToken(profileId);
  const instanceUrl = getInstanceUrl(profileId);

  if (!accessToken || !instanceUrl) {
    throw new Error('Salesforce に接続されていません。先に認証してください。');
  }

  return SfClient.create<unknown>(instanceUrl, accessToken, { logger: appLogger });
};

// ============================================================================
// 読み取り系
// ============================================================================

// SF は nextRecordsUrl を /services/data/vXX.X/query/... 形式で返す。
// baseUrl が既に /services/data/vXX.X を含むため、そのまま渡すとパスが二重になる。
const toRelativeEndpoint = (nextRecordsUrl: string): string =>
  nextRecordsUrl.replace(/^\/services\/data\/v\d+\.\d+/, '');

// SF レスポンスのネストしたリレーション項目（Owner.Name 等）をドット記法キーにフラット化する。
// attributes（SF内部メタデータ）は除外する。
// SF describe の relationship 深度は最大 5 だが、想定外データに対する DoS 防御として 10 で打ち切る。
const FLATTEN_MAX_DEPTH = 10;

const flattenRecord = (
  record: Record<string, unknown>,
  prefix = '',
  depth = 0,
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  if (depth >= FLATTEN_MAX_DEPTH) {
    result[prefix || '_truncated'] = '[truncated: max depth reached]';
    return result;
  }
  for (const [key, value] of Object.entries(record)) {
    if (key === 'attributes') continue;
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value)) {
      Object.assign(result, flattenRecord(value, fullKey, depth + 1));
    } else {
      result[fullKey] = value;
    }
  }
  return result;
};

/**
 * Salesforce 組織内の sObject 一覧を取得する。
 *
 * @param profileId - 対象プロファイル ID（接続済みであること）
 * @returns sObject のサマリ配列
 * @throws {Error} 未接続、またはレスポンス形式が想定外の場合
 */
export const listSObjects = async (profileId: string): Promise<SObjectSummary[]> => {
  const client = getClient(profileId);
  const raw: unknown = await client.get('/sobjects');

  if (!isPlainObject(raw) || !Array.isArray(raw['sobjects'])) {
    throw new Error('sObjectリストの取得に失敗しました');
  }

  return raw['sobjects']
    .filter((o): o is Record<string, unknown> => isPlainObject(o))
    .map(o => ({
      name: String(o['name'] ?? ''),
      label: String(o['label'] ?? ''),
      labelPlural: String(o['labelPlural'] ?? ''),
      queryable: Boolean(o['queryable']),
      updateable: Boolean(o['updateable']),
      createable: Boolean(o['createable']),
      deletable: Boolean(o['deletable']),
      custom: Boolean(o['custom']),
    }))
    .filter(o => o.name !== '');
};

/**
 * 指定 sObject のメタデータ（フィールド・子リレーション等）を取得する。プロファイル単位でキャッシュする。
 *
 * @param profileId - 対象プロファイル ID
 * @param objectName - sObject API 名（例: `Account`）
 * @returns sObject のフィールド・子リレーションを含む describe 情報
 * @throws {Error} 未接続、または存在しない sObject 名を指定した場合
 */
export const describeObject = async (profileId: string, objectName: string): Promise<SObjectDescribe> => {
  const cacheKey = `${profileId}:${objectName}`;
  const cached = describeCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const client = getClient(profileId);
  const raw: unknown = await client.get(`/sobjects/${objectName}/describe`);

  if (!isPlainObject(raw)) {
    throw new Error(`describe レスポンスが不正です: ${objectName}`);
  }

  const toFields = (rawFields: unknown[]): FieldDescribe[] =>
    rawFields
      .filter((f): f is Record<string, unknown> => isPlainObject(f))
      .map(f => ({
        name: String(f['name'] ?? ''),
        label: String(f['label'] ?? ''),
        type: String(f['type'] ?? ''),
        length: Number(f['length'] ?? 0),
        precision: Number(f['precision'] ?? 0),
        scale: Number(f['scale'] ?? 0),
        nillable: Boolean(f['nillable']),
        unique: Boolean(f['unique']),
        externalId: Boolean(f['externalId']),
        custom: Boolean(f['custom']),
        referenceTo: Array.isArray(f['referenceTo']) ? f['referenceTo'].map(String) : [],
        relationshipName: f['relationshipName'] != null ? String(f['relationshipName']) : null,
        picklistValues: Array.isArray(f['picklistValues'])
          ? f['picklistValues']
              .filter((p): p is Record<string, unknown> => isPlainObject(p))
              .map(p => ({
                label: String(p['label'] ?? ''),
                value: String(p['value'] ?? ''),
                active: Boolean(p['active']),
              }))
          : [],
      }));

  const toChildRels = (rawRels: unknown[]) =>
    rawRels
      .filter((r): r is Record<string, unknown> => isPlainObject(r))
      .map(r => ({
        childSObject: String(r['childSObject'] ?? ''),
        field: String(r['field'] ?? ''),
        relationshipName: r['relationshipName'] != null ? String(r['relationshipName']) : null,
      }));

  const describe: SObjectDescribe = {
    name: String(raw['name'] ?? ''),
    label: String(raw['label'] ?? ''),
    labelPlural: String(raw['labelPlural'] ?? ''),
    fields: Array.isArray(raw['fields']) ? toFields(raw['fields']) : [],
    childRelationships: Array.isArray(raw['childRelationships']) ? toChildRels(raw['childRelationships']) : [],
  };

  describeCache.set(cacheKey, describe);
  return describe;
};

interface QueryPage {
  totalSize: number;
  done: boolean;
  records: Record<string, unknown>[];
  nextRecordsUrl?: string;
}

const toQueryPage = (raw: unknown): QueryPage => {
  if (!isPlainObject(raw)) {
    throw new Error('クエリレスポンスが JSON オブジェクトではありません');
  }
  if (!Array.isArray(raw['records'])) {
    throw new Error('クエリレスポンスの records フィールドが不正です');
  }
  const records = raw['records'].filter((r): r is Record<string, unknown> => isPlainObject(r));
  const nextRecordsUrl = typeof raw['nextRecordsUrl'] === 'string' ? raw['nextRecordsUrl'] : undefined;
  return {
    totalSize: Number(raw['totalSize'] ?? 0),
    done: Boolean(raw['done']),
    records,
    nextRecordsUrl,
  };
};

/**
 * SOQL クエリを実行する。`maxRows` まで自動でページング取得する（0 は無制限）。
 *
 * @param profileId - 対象プロファイル ID
 * @param soql - 実行する SOQL 文字列
 * @param maxRows - 最大取得件数（0 を指定するとすべて取得）
 * @returns 取得結果（フィールドはドット記法でフラット化済み）
 * @throws {Error} 未接続、またはレスポンス形式が想定外の場合
 */
export const query = async (
  profileId: string,
  soql: string,
  maxRows: number,
): Promise<QueryResult> => {
  // soql plugin で /query エンドポイントを集約。後続ページは nextRecordsUrl を相対化して raw GET で辿る。
  // レスポンス検証は plugin の cast を信頼せず sfApi 側で toQueryPage により実施（CODING_RULES §1）
  const client = getClient(profileId).use(SfPlugins.soql<Record<string, unknown>>());
  const records: Record<string, unknown>[] = [];

  let page = toQueryPage(await client.query(soql));
  records.push(...page.records);

  while (!page.done && page.nextRecordsUrl && (maxRows === 0 || records.length < maxRows)) {
    page = toQueryPage(await client.get(toRelativeEndpoint(page.nextRecordsUrl)));
    records.push(...page.records);
  }

  const fetched = (maxRows === 0 ? records : records.slice(0, maxRows))
    .map(r => flattenRecord(r));

  log.info(`[SF] クエリ完了: ${fetched.length}件取得 (totalSize=${page.totalSize})`);

  return {
    totalSize: page.totalSize,
    done: page.done,
    records: fetched,
    fetchedCount: fetched.length,
  };
};

// ============================================================================
// 書き込み系（readwrite + writeSession 有効時のみ）
// ============================================================================

const WRITE_REQUIRED = 'REAUTH_REQUIRED';

const assertWriteAllowed = (profileId: string): void => {
  const profile = getProfile(profileId);
  if (!profile) {
    throw new Error(`プロファイルが見つかりません: ${profileId}`);
  }
  if (profile.mode === 'readonly') {
    throw new Error('読み取り専用プロファイルでは書き込み操作は実行できません');
  }
  if (!isWriteSessionValid(profileId)) {
    throw new Error(WRITE_REQUIRED);
  }
};

// 監査ログ + プロファイル存在チェックを 1 箇所に集約
const writeAudit = (
  profileId: string,
  op: 'CREATE' | 'UPDATE' | 'DELETE',
  resource: string,
): void => {
  const profile = getProfile(profileId);
  if (!profile) throw new Error(`プロファイルが見つかりません: ${profileId}`);
  auditLog(profile.name, op, resource, 1);
};

// sobject CRUD plugin を適用したクライアントを返す（write 3 関数で共用）
const getSObjectClient = (profileId: string, objectName: string) =>
  getClient(profileId).use(SfPlugins.sobject<Record<string, unknown>>(objectName));

/**
 * 新規レコードを作成する。書き込みセッションが有効な readwrite プロファイルでのみ実行可能。
 *
 * @param profileId - 対象プロファイル ID
 * @param objectName - sObject API 名（例: `Account`）
 * @param fields - 作成するレコードのフィールド値
 * @returns 作成されたレコードの ID
 * @throws {Error} readonly プロファイル / 書き込みセッション失効時は `REAUTH_REQUIRED` を message に持つ Error を投げる
 */
export const createRecord = async (
  profileId: string,
  objectName: string,
  fields: Record<string, unknown>,
): Promise<string> => {
  assertWriteAllowed(profileId);
  const client = getSObjectClient(profileId, objectName);
  // plugin の型は { id, success } を信頼するが、sfApi 境界で runtime guard を残す（CODING_RULES §1）
  const created = await client.create(fields);
  if (created == null || typeof created.id !== 'string') {
    throw new Error('作成レスポンスに id が含まれていません');
  }

  writeAudit(profileId, 'CREATE', objectName);
  return created.id;
};

/**
 * 既存レコードを更新する。書き込みセッションが有効な readwrite プロファイルでのみ実行可能。
 *
 * @param profileId - 対象プロファイル ID
 * @param objectName - sObject API 名
 * @param id - 更新対象レコードの ID
 * @param fields - 更新するフィールド値
 * @throws {Error} readonly プロファイル / 書き込みセッション失効時は `REAUTH_REQUIRED` を message に持つ Error を投げる
 */
export const updateRecord = async (
  profileId: string,
  objectName: string,
  id: string,
  fields: Record<string, unknown>,
): Promise<void> => {
  assertWriteAllowed(profileId);
  // SF PATCH は 204 No Content を返すため戻り値検証は不要
  await getSObjectClient(profileId, objectName).update(id, fields);
  writeAudit(profileId, 'UPDATE', `${objectName}/${id}`);
};

/**
 * 既存レコードを削除する。書き込みセッションが有効な readwrite プロファイルでのみ実行可能。
 *
 * @param profileId - 対象プロファイル ID
 * @param objectName - sObject API 名
 * @param id - 削除対象レコードの ID
 * @throws {Error} readonly プロファイル / 書き込みセッション失効時は `REAUTH_REQUIRED` を message に持つ Error を投げる
 */
export const deleteRecord = async (
  profileId: string,
  objectName: string,
  id: string,
): Promise<void> => {
  assertWriteAllowed(profileId);
  // SF DELETE は 204 No Content を返すため戻り値検証は不要
  await getSObjectClient(profileId, objectName).delete(id);
  writeAudit(profileId, 'DELETE', `${objectName}/${id}`);
};

export { WRITE_REQUIRED };
