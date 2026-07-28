/**
 * テスト用の共通ファクトリ関数。
 * IPC contract の型に沿った最小構成のオブジェクトを生成する。
 */
import type {
  SfConnectionProfile,
  SObjectSummary,
  SObjectDescribe,
  FieldDescribe,
  QueryResult,
  LogEntry,
} from '@app/ipc-contract';

export const makeProfile = (
  overrides: Partial<SfConnectionProfile> = {},
): SfConnectionProfile => ({
  id: 'profile-test-1',
  name: 'テストプロファイル',
  loginUrl: 'https://login.salesforce.com',
  clientId: 'mock-client-id',
  mode: 'readonly',
  writeSessionTimeoutMin: 15,
  ...overrides,
});

export const makeSObjectSummary = (
  overrides: Partial<SObjectSummary> = {},
): SObjectSummary => ({
  name: 'Account',
  label: 'アカウント',
  labelPlural: 'アカウント',
  queryable: true,
  updateable: true,
  createable: true,
  deletable: true,
  custom: false,
  ...overrides,
});

export const makeFieldDescribe = (
  overrides: Partial<FieldDescribe> = {},
): FieldDescribe => ({
  name: 'Id',
  label: 'ID',
  type: 'id',
  length: 18,
  precision: 0,
  scale: 0,
  nillable: false,
  unique: true,
  externalId: false,
  custom: false,
  referenceTo: [],
  relationshipName: null,
  picklistValues: [],
  ...overrides,
});

export const makeSObjectDescribe = (
  overrides: Partial<SObjectDescribe> = {},
): SObjectDescribe => ({
  name: 'Account',
  label: 'アカウント',
  labelPlural: 'アカウント',
  custom: false,
  fields: [makeFieldDescribe(), makeFieldDescribe({ name: 'Name', label: '名前', type: 'string', length: 255 })],
  childRelationships: [],
  ...overrides,
});

export const makeQueryResult = (
  overrides: Partial<QueryResult> = {},
): QueryResult => ({
  totalSize: 0,
  done: true,
  records: [],
  fetchedCount: 0,
  ...overrides,
});

export const makeLogEntry = (
  overrides: Partial<LogEntry> = {},
): LogEntry => ({
  date: new Date().toISOString(),
  level: 'info',
  text: 'テストログ',
  ...overrides,
});
