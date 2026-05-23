/**
 * sfApi.ts のユニットテスト。
 * SalesforceApiClient / sfOAuth / settings / logger を全てモックし、
 * ビジネスロジック（クエリページネーション・フラット化・書き込みセッション）を検証する。
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// --- モック定義（vi.mock は hoisting されるため import より前に評価される） ---

// vi.hoisted() を使うことで、vi.mock の factory 内でこれらの変数が参照可能になる。
// (vi.mock は hoisting されるが、通常の const/let は TDZ のため参照できない)
const { mockGet, mockPost, mockPatch, mockDelete, mockClient, mockGetProfile } = vi.hoisted(() => {
  const mockGet = vi.fn();
  const mockPost = vi.fn();
  const mockPatch = vi.fn();
  const mockDelete = vi.fn();
  const mockClient = { get: mockGet, post: mockPost, patch: mockPatch, delete: mockDelete };
  const mockGetProfile = vi.fn();
  return { mockGet, mockPost, mockPatch, mockDelete, mockClient, mockGetProfile };
});

vi.mock('../../../src/libs/SalesforceApiClient.js', () => ({
  SalesforceApiClient: {
    create: vi.fn(() => mockClient),
  },
}));

vi.mock('../../../src/main/sfOAuth.js', () => ({
  getAccessToken: vi.fn(() => 'mock-access-token'),
  getInstanceUrl: vi.fn(() => 'https://test.salesforce.com'),
}));

vi.mock('../../../src/main/settings.js', () => ({
  getProfile: mockGetProfile,
}));

vi.mock('../../../src/main/logger.js', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  auditLog: vi.fn(),
  appLogger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn() })),
  },
}));

// --- テスト本体 ---

import {
  query,
  clearDescribeCache,
  markWriteSession,
  clearWriteSession,
  WRITE_REQUIRED,
  createRecord,
  updateRecord,
  deleteRecord,
} from '../../../src/main/sfApi.js';
import { makeProfile } from '../../fixtures/contract.js';

const PROFILE_ID = 'p1';

beforeEach(() => {
  vi.clearAllMocks();
  mockGetProfile.mockReturnValue(makeProfile({ id: PROFILE_ID }));
  clearDescribeCache();
  clearWriteSession(PROFILE_ID);
});

// ============================================================
// query — ページネーション・maxRows・フラット化
// ============================================================

describe('query', () => {
  it('1ページで完了するクエリの結果を返す', async () => {
    mockGet.mockResolvedValue({
      totalSize: 2,
      done: true,
      records: [
        { attributes: { type: 'Account' }, Id: '001', Name: 'Acme' },
        { attributes: { type: 'Account' }, Id: '002', Name: 'Globex' },
      ],
    });

    const result = await query(PROFILE_ID, 'SELECT Id, Name FROM Account', 100);

    expect(result.totalSize).toBe(2);
    expect(result.fetchedCount).toBe(2);
    expect(result.records[0]['Id']).toBe('001');
    // attributes は除外される
    expect(result.records[0]).not.toHaveProperty('attributes');
  });

  it('ネストしたリレーション項目をドット記法でフラット化する', async () => {
    mockGet.mockResolvedValue({
      totalSize: 1,
      done: true,
      records: [
        {
          attributes: { type: 'Contact' },
          Id: 'c001',
          Account: { attributes: { type: 'Account' }, Name: 'Acme' },
        },
      ],
    });

    const result = await query(PROFILE_ID, 'SELECT Id, Account.Name FROM Contact', 100);
    expect(result.records[0]['Account.Name']).toBe('Acme');
    expect(result.records[0]).not.toHaveProperty('Account');
  });

  it('maxRows を超えた件数は切り捨てられる', async () => {
    mockGet.mockResolvedValue({
      totalSize: 5,
      done: true,
      records: [
        { Id: '1' }, { Id: '2' }, { Id: '3' }, { Id: '4' }, { Id: '5' },
      ],
    });

    const result = await query(PROFILE_ID, 'SELECT Id FROM Account', 3);
    expect(result.fetchedCount).toBe(3);
    expect(result.records).toHaveLength(3);
  });

  it('maxRows=0 のとき全件取得する', async () => {
    mockGet.mockResolvedValue({
      totalSize: 3,
      done: true,
      records: [{ Id: '1' }, { Id: '2' }, { Id: '3' }],
    });

    const result = await query(PROFILE_ID, 'SELECT Id FROM Account', 0);
    expect(result.fetchedCount).toBe(3);
  });

  it('ページネーションで複数ページを取得する', async () => {
    mockGet
      .mockResolvedValueOnce({
        totalSize: 4,
        done: false,
        records: [{ Id: '1' }, { Id: '2' }],
        nextRecordsUrl: '/services/data/v59.0/query/01g-next',
      })
      .mockResolvedValueOnce({
        totalSize: 4,
        done: true,
        records: [{ Id: '3' }, { Id: '4' }],
      });

    const result = await query(PROFILE_ID, 'SELECT Id FROM Account', 0);
    expect(result.fetchedCount).toBe(4);
    // 2回目の get は nextRecordsUrl のプレフィックスを除去したパスで呼ばれる
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(mockGet).toHaveBeenNthCalledWith(2, '/query/01g-next');
  });

  it('records が配列でないレスポンスは例外を投げる', async () => {
    mockGet.mockResolvedValue({ totalSize: 0, done: true, records: null });
    await expect(query(PROFILE_ID, 'SELECT Id FROM Account', 100)).rejects.toThrow(
      'クエリレスポンスの records フィールドが不正です',
    );
  });
});

// ============================================================
// 書き込みセッション管理
// ============================================================

describe('writeSession — createRecord', () => {
  const rwProfile = makeProfile({ id: PROFILE_ID, mode: 'readwrite', writeSessionTimeoutMin: 15 });

  beforeEach(() => {
    mockGetProfile.mockReturnValue(rwProfile);
  });

  it('writeSession が有効なときに createRecord が成功する', async () => {
    markWriteSession(PROFILE_ID);
    mockPost.mockResolvedValue({ id: 'new-001' });

    const id = await createRecord(PROFILE_ID, 'Account', { Name: 'Test' });
    expect(id).toBe('new-001');
  });

  it('writeSession が無効のとき REAUTH_REQUIRED エラーを投げる', async () => {
    // セッションなし
    await expect(createRecord(PROFILE_ID, 'Account', {})).rejects.toThrow(WRITE_REQUIRED);
  });

  it('セッションをクリアすると writeSession が無効になる', async () => {
    markWriteSession(PROFILE_ID);
    clearWriteSession(PROFILE_ID);
    await expect(createRecord(PROFILE_ID, 'Account', {})).rejects.toThrow(WRITE_REQUIRED);
  });

  it('読み取り専用プロファイルでは createRecord を拒否する', async () => {
    mockGetProfile.mockReturnValue(makeProfile({ id: PROFILE_ID, mode: 'readonly' }));
    markWriteSession(PROFILE_ID);
    await expect(createRecord(PROFILE_ID, 'Account', {})).rejects.toThrow(
      '読み取り専用プロファイルでは書き込み操作は実行できません',
    );
  });
});

describe('writeSession — updateRecord', () => {
  const rwProfile = makeProfile({ id: PROFILE_ID, mode: 'readwrite', writeSessionTimeoutMin: 15 });

  beforeEach(() => {
    mockGetProfile.mockReturnValue(rwProfile);
  });

  it('writeSession 有効時に updateRecord が成功する', async () => {
    markWriteSession(PROFILE_ID);
    mockPatch.mockResolvedValue(undefined);
    await expect(updateRecord(PROFILE_ID, 'Account', 'a001', { Name: 'Updated' })).resolves.toBeUndefined();
  });

  it('writeSession 無効時に updateRecord が REAUTH_REQUIRED を投げる', async () => {
    await expect(updateRecord(PROFILE_ID, 'Account', 'a001', {})).rejects.toThrow(WRITE_REQUIRED);
  });
});

describe('writeSession — deleteRecord', () => {
  const rwProfile = makeProfile({ id: PROFILE_ID, mode: 'readwrite', writeSessionTimeoutMin: 15 });

  beforeEach(() => {
    mockGetProfile.mockReturnValue(rwProfile);
  });

  it('writeSession 有効時に deleteRecord が成功する', async () => {
    markWriteSession(PROFILE_ID);
    mockDelete.mockResolvedValue(undefined);
    await expect(deleteRecord(PROFILE_ID, 'Account', 'a001')).resolves.toBeUndefined();
  });
});

// ============================================================
// writeSession タイムアウト
// ============================================================

describe('writeSession — タイムアウト', () => {
  it('セッション期限切れで REAUTH_REQUIRED を投げる', async () => {
    vi.useFakeTimers();
    const rwProfile = makeProfile({ id: PROFILE_ID, mode: 'readwrite', writeSessionTimeoutMin: 1 });
    mockGetProfile.mockReturnValue(rwProfile);
    mockPost.mockResolvedValue({ id: 'x' });

    markWriteSession(PROFILE_ID);

    // 1分 + 1ms 経過
    vi.advanceTimersByTime(61 * 1000);

    await expect(createRecord(PROFILE_ID, 'Account', {})).rejects.toThrow(WRITE_REQUIRED);
    vi.useRealTimers();
  });
});
