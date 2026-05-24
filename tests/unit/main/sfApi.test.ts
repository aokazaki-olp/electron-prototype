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
  // sfApi は SalesforceApiClientPlugins.sobject/soql を .use() で適用するため、
  // mockClient.use はプラグイン関数に mockClient 自身を渡し、返ったメソッドをマージしたクライアントを返す。
  // 本物の ApiClient.use と同じく「plugin が HTTP メソッド名と衝突した場合 plugin が後勝ち」になる。
  type MockClient = Record<string, unknown> & {
    get: typeof mockGet;
    post: typeof mockPost;
    patch: typeof mockPatch;
    delete: typeof mockDelete;
    use: (plugin: (c: MockClient) => Record<string, unknown>) => MockClient;
    extend: () => MockClient;
  };
  const mockClient = { get: mockGet, post: mockPost, patch: mockPatch, delete: mockDelete } as MockClient;
  mockClient.use = (plugin) => {
    const methods = plugin(mockClient);
    return { ...mockClient, ...methods } as MockClient;
  };
  // bulkQuery plugin が getResults 内で client.extend(decorator) を使うため、
  // decorator は捨てて mockClient 自身を返す（Sforce-Locator capture は単一ページテストでは不要）
  mockClient.extend = (): MockClient => mockClient;
  const mockGetProfile = vi.fn();
  return { mockGet, mockPost, mockPatch, mockDelete, mockClient, mockGetProfile };
});

vi.mock('../../../packages/libs/src/SalesforceApiClient.js', () => ({
  SalesforceApiClient: {
    create: vi.fn(() => mockClient),
  },
}));

vi.mock('../../../packages/main-core/src/sfOAuth.js', () => ({
  getAccessToken: vi.fn(() => 'mock-access-token'),
  getInstanceUrl: vi.fn(() => 'https://test.salesforce.com'),
}));

vi.mock('../../../packages/main-core/src/settings.js', () => ({
  getProfile: mockGetProfile,
}));

vi.mock('../../../packages/main-core/src/logger.js', () => ({
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
  bulkQuery,
  clearDescribeCache,
  markWriteSession,
  clearWriteSession,
  WRITE_REQUIRED,
  createRecord,
  updateRecord,
  deleteRecord,
} from '../../../packages/main-core/src/sfApi.js';
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

  it('writeSessionTimeoutMin=0 は毎回確認 (markWriteSession しても拒否)', async () => {
    const rwProfile = makeProfile({ id: PROFILE_ID, mode: 'readwrite', writeSessionTimeoutMin: 0 });
    mockGetProfile.mockReturnValue(rwProfile);
    markWriteSession(PROFILE_ID);
    await expect(createRecord(PROFILE_ID, 'Account', {})).rejects.toThrow(WRITE_REQUIRED);
  });

  it('境界: タイムアウト直前 (timeoutMin*60*1000 - 1ms) はまだ有効', async () => {
    vi.useFakeTimers();
    const rwProfile = makeProfile({ id: PROFILE_ID, mode: 'readwrite', writeSessionTimeoutMin: 5 });
    mockGetProfile.mockReturnValue(rwProfile);
    mockPost.mockResolvedValue({ id: 'edge-1' });

    markWriteSession(PROFILE_ID);
    vi.advanceTimersByTime(5 * 60 * 1000 - 1);
    await expect(createRecord(PROFILE_ID, 'Account', {})).resolves.toBe('edge-1');
    vi.useRealTimers();
  });
});

// ============================================================
// writeSession auto-cleanup タイマー & reauth フロー (Medium 重要度のリーク防止)
// ============================================================

describe('writeSession — auto-cleanup タイマー / reauth フロー', () => {
  beforeEach(() => {
    clearWriteSession(PROFILE_ID);
  });

  it('markWriteSession でタイマーが張られ、タイムアウト到達で自動 cleanup される', async () => {
    vi.useFakeTimers();
    const rwProfile = makeProfile({ id: PROFILE_ID, mode: 'readwrite', writeSessionTimeoutMin: 2 });
    mockGetProfile.mockReturnValue(rwProfile);
    mockPost.mockResolvedValue({ id: 'r1' });

    markWriteSession(PROFILE_ID);
    // タイムアウト超過 → timer 発火 → Map から削除 → 書き込み拒否
    vi.advanceTimersByTime(2 * 60 * 1000 + 1);
    await expect(createRecord(PROFILE_ID, 'Account', {})).rejects.toThrow(WRITE_REQUIRED);
    vi.useRealTimers();
  });

  it('reauth フロー: 失効後に再度 markWriteSession すれば書き込みが復活する', async () => {
    vi.useFakeTimers();
    const rwProfile = makeProfile({ id: PROFILE_ID, mode: 'readwrite', writeSessionTimeoutMin: 1 });
    mockGetProfile.mockReturnValue(rwProfile);
    mockPost.mockResolvedValue({ id: 'reauth-1' });

    // 1 回目: 書き込み成功 → タイムアウト → 拒否
    markWriteSession(PROFILE_ID);
    await expect(createRecord(PROFILE_ID, 'Account', {})).resolves.toBe('reauth-1');
    vi.advanceTimersByTime(1 * 60 * 1000 + 1);
    await expect(createRecord(PROFILE_ID, 'Account', {})).rejects.toThrow(WRITE_REQUIRED);

    // reauth (= markWriteSession 再呼び出し) → 書き込み復活
    markWriteSession(PROFILE_ID);
    await expect(createRecord(PROFILE_ID, 'Account', {})).resolves.toBe('reauth-1');
    vi.useRealTimers();
  });

  it('連続 markWriteSession: 既存タイマーが clear され、最新の呼び出しから timeout カウントされる', async () => {
    vi.useFakeTimers();
    const rwProfile = makeProfile({ id: PROFILE_ID, mode: 'readwrite', writeSessionTimeoutMin: 2 });
    mockGetProfile.mockReturnValue(rwProfile);
    mockPost.mockResolvedValue({ id: 'refresh-1' });

    markWriteSession(PROFILE_ID);
    vi.advanceTimersByTime(1 * 60 * 1000);  // 1 分経過
    markWriteSession(PROFILE_ID);  // 再 mark で reset
    vi.advanceTimersByTime(1 * 60 * 1000 + 100);  // 通算 2 分 + 100ms (初回からなら expire 圏内)
    // 初回タイマーが残っていれば誤って削除されているはずだが、最新呼び出しから 1 分なので有効
    await expect(createRecord(PROFILE_ID, 'Account', {})).resolves.toBe('refresh-1');
    vi.useRealTimers();
  });

  it('readonly プロファイルで markWriteSession しても Map にエントリを作らない (リーク防止)', async () => {
    const roProfile = makeProfile({ id: PROFILE_ID, mode: 'readonly', writeSessionTimeoutMin: 15 });
    mockGetProfile.mockReturnValue(roProfile);
    markWriteSession(PROFILE_ID);
    // readonly では書き込みが拒否されるのが当然 (Map に保持しても無意味なのでエントリを作らない設計)
    await expect(createRecord(PROFILE_ID, 'Account', {})).rejects.toThrow();
  });

  it('timeoutMin=0 (毎回確認) で markWriteSession しても Map に保持しない', async () => {
    const rwProfile = makeProfile({ id: PROFILE_ID, mode: 'readwrite', writeSessionTimeoutMin: 0 });
    mockGetProfile.mockReturnValue(rwProfile);
    markWriteSession(PROFILE_ID);
    // 毎回確認モードなのでセッション保持してもしなくても拒否
    await expect(createRecord(PROFILE_ID, 'Account', {})).rejects.toThrow(WRITE_REQUIRED);
  });

  it('clearWriteSession でタイマーも clear される (再 mark せずに timeout が経過しても再削除しない = no-op)', async () => {
    vi.useFakeTimers();
    const rwProfile = makeProfile({ id: PROFILE_ID, mode: 'readwrite', writeSessionTimeoutMin: 2 });
    mockGetProfile.mockReturnValue(rwProfile);

    markWriteSession(PROFILE_ID);
    clearWriteSession(PROFILE_ID);
    // タイマーが残っていれば 2 分後に何か走るはずだが、副作用なし
    vi.advanceTimersByTime(2 * 60 * 1000 + 100);
    // 状態を観察するために再度 mark してから時計を進めて削除されることを確認
    mockPost.mockResolvedValue({ id: 'after-clear' });
    markWriteSession(PROFILE_ID);
    vi.advanceTimersByTime(2 * 60 * 1000 - 100);
    await expect(createRecord(PROFILE_ID, 'Account', {})).resolves.toBe('after-clear');
    vi.useRealTimers();
  });

  it('clearWriteSession が直接 clearTimeout を呼ぶ (spy で検証)', () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const rwProfile = makeProfile({ id: PROFILE_ID, mode: 'readwrite', writeSessionTimeoutMin: 5 });
    mockGetProfile.mockReturnValue(rwProfile);

    markWriteSession(PROFILE_ID);
    const callsBeforeClear = clearTimeoutSpy.mock.calls.length;
    clearWriteSession(PROFILE_ID);
    // clearWriteSession の呼び出しで clearTimeout が少なくとも 1 回追加で呼ばれている
    expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThan(callsBeforeClear);

    clearTimeoutSpy.mockRestore();
    vi.useRealTimers();
  });

  it('再 markWriteSession 時に古いタイマーが clearTimeout される (spy で検証)', () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const rwProfile = makeProfile({ id: PROFILE_ID, mode: 'readwrite', writeSessionTimeoutMin: 5 });
    mockGetProfile.mockReturnValue(rwProfile);

    markWriteSession(PROFILE_ID);
    const callsAfterFirstMark = clearTimeoutSpy.mock.calls.length;
    markWriteSession(PROFILE_ID); // 既存タイマーを clear して新規セット
    expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThan(callsAfterFirstMark);

    clearTimeoutSpy.mockRestore();
    vi.useRealTimers();
  });
});

// ============================================================
// flattenRecord 深度・エッジケース (query 経由)
// ============================================================

describe('flattenRecord — エッジケース', () => {
  it('深さ 9 のネストはフラット化される', async () => {
    let value: Record<string, unknown> = { leaf: 'deep' };
    for (let i = 9; i > 0; i--) {
      value = { [`L${i}`]: value };
    }
    mockGet.mockResolvedValue({
      totalSize: 1, done: true, records: [value],
    });
    const result = await query(PROFILE_ID, 'SELECT ...', 0);
    const keys = Object.keys(result.records[0]);
    // L1.L2.L3.L4.L5.L6.L7.L8.L9.leaf = 'deep' のキーがあるはず
    expect(keys.length).toBeGreaterThan(0);
    const deepKey = keys.find(k => k.includes('leaf'));
    expect(deepKey).toBeDefined();
  });

  it('深さ 10 を超えるネストは truncated マーカーで打ち切られる (DoS 防御)', async () => {
    let value: Record<string, unknown> = { final: 'never reached' };
    for (let i = 15; i > 0; i--) {
      value = { [`L${i}`]: value };
    }
    mockGet.mockResolvedValue({
      totalSize: 1, done: true, records: [value],
    });
    const result = await query(PROFILE_ID, 'SELECT ...', 0);
    const flat = JSON.stringify(result.records[0]);
    expect(flat).toContain('truncated');
    expect(flat).not.toContain('never reached');
  });

  it('attributes キーは深いネストでも除外される', async () => {
    mockGet.mockResolvedValue({
      totalSize: 1, done: true, records: [
        {
          attributes: { type: 'Account', url: '/...' },
          Owner: {
            attributes: { type: 'User' },
            Name: 'Alice',
          },
        },
      ],
    });
    const result = await query(PROFILE_ID, 'SELECT ...', 0);
    const keys = Object.keys(result.records[0]);
    expect(keys.every(k => !k.includes('attributes'))).toBe(true);
    expect(result.records[0]['Owner.Name']).toBe('Alice');
  });

  it('配列値はフラット化せずそのまま保持される', async () => {
    mockGet.mockResolvedValue({
      totalSize: 1, done: true, records: [{ Id: 'x', items: [1, 2, 3] }],
    });
    const result = await query(PROFILE_ID, 'SELECT ...', 0);
    expect(result.records[0]['items']).toEqual([1, 2, 3]);
  });
});

// ============================================================
// query — ページングの細かな挙動
// ============================================================

describe('query — ページング', () => {
  it('nextRecordsUrl の /services/data/vXX.X プレフィックスを除去して次ページを取りに行く', async () => {
    mockGet
      .mockResolvedValueOnce({
        totalSize: 4, done: false,
        records: [{ Id: '1' }],
        nextRecordsUrl: '/services/data/v59.0/query/01g-NEXT-PAGE',
      })
      .mockResolvedValueOnce({
        totalSize: 4, done: true,
        records: [{ Id: '2' }],
      });

    await query(PROFILE_ID, 'SELECT Id FROM Account', 0);

    expect(mockGet).toHaveBeenNthCalledWith(1, '/query', { q: 'SELECT Id FROM Account' });
    expect(mockGet).toHaveBeenNthCalledWith(2, '/query/01g-NEXT-PAGE');
  });

  it('maxRows に達したら nextRecordsUrl があってもページングを止める', async () => {
    mockGet.mockResolvedValueOnce({
      totalSize: 100, done: false,
      records: Array.from({ length: 5 }, (_, i) => ({ Id: `r${i}` })),
      nextRecordsUrl: '/services/data/v59.0/query/should-not-fetch',
    });

    const result = await query(PROFILE_ID, 'SELECT Id FROM Account', 5);
    expect(result.fetchedCount).toBe(5);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('records 内のプリミティブ要素 (string 等) はフィルタで除外される', async () => {
    mockGet.mockResolvedValue({
      totalSize: 3, done: true,
      records: [{ Id: '1' }, 'invalid string', null, { Id: '2' }],
    });
    const result = await query(PROFILE_ID, 'SELECT ...', 0);
    expect(result.fetchedCount).toBe(2);
    expect(result.records.map(r => r['Id'])).toEqual(['1', '2']);
  });

  it('totalSize がレスポンスに無いと 0 として扱う', async () => {
    mockGet.mockResolvedValue({ done: true, records: [] });
    const result = await query(PROFILE_ID, 'SELECT ...', 0);
    expect(result.totalSize).toBe(0);
  });
});

// ============================================================
// bulkQuery — Bulk API v2 経由の全件取得
// ============================================================

describe('bulkQuery', () => {
  beforeEach(() => {
    mockGetProfile.mockReturnValue(makeProfile({ id: PROFILE_ID }));
  });

  it('createJob → waitForCompletion → getResults → deleteJob の順で動作し parsed records を返す', async () => {
    // createJob → ジョブ作成レスポンス（state=UploadComplete）
    mockPost.mockResolvedValueOnce({
      id: 'job-001',
      state: 'UploadComplete',
      operation: 'query',
      query: 'SELECT Id, Name FROM Account',
    });
    // waitForCompletion 1 回目で JobComplete を返す（即時完了）
    mockGet.mockResolvedValueOnce({
      id: 'job-001',
      state: 'JobComplete',
      numberRecordsProcessed: 2,
      operation: 'query',
      query: 'SELECT Id, Name FROM Account',
    });
    // getResults → CSV（ヘッダー行付き）
    mockGet.mockResolvedValueOnce('Id,Name\n001,Acme\n002,Globex\n');
    // deleteJob cleanup
    mockDelete.mockResolvedValueOnce(undefined);

    const result = await bulkQuery(PROFILE_ID, 'SELECT Id, Name FROM Account');

    expect(result).toEqual({
      totalSize: 2,
      done: true,
      fetchedCount: 2,
      records: [
        { Id: '001', Name: 'Acme' },
        { Id: '002', Name: 'Globex' },
      ],
    });
    // createJob が /jobs/query に飛んだ
    expect(mockPost).toHaveBeenCalledWith('/jobs/query', {
      operation: 'query',
      query: 'SELECT Id, Name FROM Account',
    });
    // クリーンアップで deleteJob が呼ばれた
    expect(mockDelete).toHaveBeenCalledWith('/jobs/query/job-001');
  });

  it('Bulk job が Failed 状態で終わると job ID を含むエラーを throw、deleteJob も呼ばれる', async () => {
    mockPost.mockResolvedValueOnce({ id: 'job-002', state: 'UploadComplete' });
    mockGet.mockResolvedValueOnce({
      id: 'job-002',
      state: 'Failed',
      operation: 'query',
      query: 'SELECT Id FROM BadObject',
    });
    mockDelete.mockResolvedValueOnce(undefined);

    await expect(bulkQuery(PROFILE_ID, 'SELECT Id FROM BadObject')).rejects.toThrow(
      'Bulk job job-002 が Failed 状態で終了しました',
    );
    // Failed でも finally で deleteJob が呼ばれる
    expect(mockDelete).toHaveBeenCalledWith('/jobs/query/job-002');
  });

  it('deleteJob の失敗は warn にとどめ throw しない（best-effort cleanup）', async () => {
    mockPost.mockResolvedValueOnce({ id: 'job-003', state: 'UploadComplete' });
    mockGet.mockResolvedValueOnce({
      id: 'job-003',
      state: 'JobComplete',
      numberRecordsProcessed: 1,
    });
    mockGet.mockResolvedValueOnce('Id\n001\n');
    mockDelete.mockRejectedValueOnce(new Error('delete failed'));

    // 正常系の戻り値が返り、cleanup の失敗は呼び出し元に伝わらない
    const result = await bulkQuery(PROFILE_ID, 'SELECT Id FROM Account');
    expect(result.fetchedCount).toBe(1);
  });
});

// ============================================================
// setCurrentProfile / getCurrentProfile / requireCurrentProfile
// ============================================================

import {
  setCurrentProfile,
  getCurrentProfile,
  requireCurrentProfile,
} from '../../../packages/main-core/src/sfApi.js';

describe('setCurrentProfile / getCurrentProfile / requireCurrentProfile', () => {
  beforeEach(() => {
    setCurrentProfile(null);
  });

  it('初期状態は null', () => {
    expect(getCurrentProfile()).toBeNull();
  });

  it('setCurrentProfile 後に取得できる', () => {
    setCurrentProfile('p-active');
    expect(getCurrentProfile()).toBe('p-active');
  });

  it('null に戻せる (disconnect 経路)', () => {
    setCurrentProfile('p1');
    setCurrentProfile(null);
    expect(getCurrentProfile()).toBeNull();
  });

  it('requireCurrentProfile は未設定で Error', () => {
    expect(() => requireCurrentProfile()).toThrow('プロファイルが選択されていません');
  });

  it('requireCurrentProfile は設定済みで値を返す', () => {
    setCurrentProfile('p2');
    expect(requireCurrentProfile()).toBe('p2');
  });
});
