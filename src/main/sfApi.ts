/**
 * sfApi.ts
 * @description Salesforce API ラッパー（describeキャッシュ・書き込みセッション管理）
 */

import { SalesforceApiClient as SfClient } from '../libs/SalesforceApiClient.js';
import { getAccessToken, getInstanceUrl } from './sfOAuth.js';
import { getProfile } from './settings.js';
import { auditLog, log, appLogger } from './logger.js';
import type {
  SObjectSummary,
  SObjectDescribe,
  QueryResult,
  FieldDescribe,
} from '../ipc/contract.js';

// ============================================================================
// describeキャッシュ
// ============================================================================

const describeCache = new Map<string, SObjectDescribe>();

export const clearDescribeCache = (): void => {
  describeCache.clear();
  log.debug('[SF] describeキャッシュをクリアしました');
};

// ============================================================================
// 書き込みセッション
// ============================================================================

// profileId → 再認証した時刻 (Date.now())
const writeSessionMap = new Map<string, number>();

export const markWriteSession = (profileId: string): void => {
  writeSessionMap.set(profileId, Date.now());
};

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
// クライアント生成
// ============================================================================

let currentProfileId: string | null = null;

export const setCurrentProfile = (profileId: string): void => {
  if (currentProfileId !== profileId) {
    clearDescribeCache();
    currentProfileId = profileId;
  }
};

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

export const listSObjects = async (profileId: string): Promise<SObjectSummary[]> => {
  const client = getClient(profileId);
  // ランタイムガード: 直後の Array.isArray チェックで構造を保証する
  const res = await client.get('/sobjects') as { sobjects: unknown[] };

  if (!Array.isArray(res?.sobjects)) {
    throw new Error('sObjectリストの取得に失敗しました');
  }

  return res.sobjects
    .filter((o): o is Record<string, unknown> => typeof o === 'object' && o !== null)
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

export const describeObject = async (profileId: string, objectName: string): Promise<SObjectDescribe> => {
  const cacheKey = `${profileId}:${objectName}`;
  const cached = describeCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const client = getClient(profileId);
  // ランタイムガード: 各フィールドは String()/Boolean()/Array.isArray() で型変換する
  const res = await client.get(`/sobjects/${objectName}/describe`) as Record<string, unknown>;

  const toFields = (raw: unknown[]): FieldDescribe[] =>
    raw
      .filter((f): f is Record<string, unknown> => typeof f === 'object' && f !== null)
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
          ? (f['picklistValues'] as Record<string, unknown>[]).map(p => ({
              label: String(p['label'] ?? ''),
              value: String(p['value'] ?? ''),
              active: Boolean(p['active']),
            }))
          : [],
      }));

  const toChildRels = (raw: unknown[]) =>
    raw
      .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
      .map(r => ({
        childSObject: String(r['childSObject'] ?? ''),
        field: String(r['field'] ?? ''),
        relationshipName: r['relationshipName'] != null ? String(r['relationshipName']) : null,
      }));

  const describe: SObjectDescribe = {
    name: String(res['name'] ?? ''),
    label: String(res['label'] ?? ''),
    labelPlural: String(res['labelPlural'] ?? ''),
    fields: Array.isArray(res['fields']) ? toFields(res['fields']) : [],
    childRelationships: Array.isArray(res['childRelationships']) ? toChildRels(res['childRelationships']) : [],
  };

  describeCache.set(cacheKey, describe);
  return describe;
};

export const query = async (
  profileId: string,
  soql: string,
  maxRows: number,
): Promise<QueryResult> => {
  const client = getClient(profileId);
  const records: Record<string, unknown>[] = [];

  // ランタイムガード: records/done/totalSize は直後の push/while で使用前に存在を前提とする
  let res = await client.get('/query', { q: soql }) as {
    totalSize: number;
    done: boolean;
    records: Record<string, unknown>[];
    nextRecordsUrl?: string;
  };

  records.push(...res.records);

  while (!res.done && res.nextRecordsUrl && (maxRows === 0 || records.length < maxRows)) {
    // nextRecordsUrl の /services/data/vXX.X プレフィックスを除去して baseUrl の二重化を防ぐ
    res = await client.get(toRelativeEndpoint(res.nextRecordsUrl)) as typeof res;
    records.push(...res.records);
  }

  const fetched = maxRows === 0 ? records : records.slice(0, maxRows);

  log.info(`[SF] クエリ完了: ${fetched.length}件取得 (totalSize=${res.totalSize})`);

  return {
    totalSize: res.totalSize,
    done: res.done,
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

export const createRecord = async (
  profileId: string,
  objectName: string,
  fields: Record<string, unknown>,
): Promise<string> => {
  assertWriteAllowed(profileId);
  const client = getClient(profileId);
  // ランタイムガード: SF は成功時に必ず { id: string } を返す (REST API仕様)
  const res = await client.post(`/sobjects/${objectName}/`, fields) as { id: string };

  auditLog(getProfile(profileId)!.name, 'CREATE', `${objectName}`, 1);
  return res.id;
};

export const updateRecord = async (
  profileId: string,
  objectName: string,
  id: string,
  fields: Record<string, unknown>,
): Promise<void> => {
  assertWriteAllowed(profileId);
  const client = getClient(profileId);
  await client.patch(`/sobjects/${objectName}/${id}`, fields);

  auditLog(getProfile(profileId)!.name, 'UPDATE', `${objectName}/${id}`, 1);
};

export const deleteRecord = async (
  profileId: string,
  objectName: string,
  id: string,
): Promise<void> => {
  assertWriteAllowed(profileId);
  const client = getClient(profileId);
  await client.delete(`/sobjects/${objectName}/${id}`);

  auditLog(getProfile(profileId)!.name, 'DELETE', `${objectName}/${id}`, 1);
};

export { WRITE_REQUIRED };
