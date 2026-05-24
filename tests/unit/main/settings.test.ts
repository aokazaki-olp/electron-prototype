/**
 * settings.ts のユニットテスト。
 *
 * electron-store / safeStorage を完全モックし、
 * プロファイル CRUD、トークンの safeStorage 経由暗号化、tabs 永続化、
 * safeStorage 不在環境のフォールバック挙動を網羅する。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================================
// モック
// ============================================================

interface MockStoreData {
  settings?: unknown;
  profiles?: unknown;
  tokens?: Record<string, string>;
  instanceUrls?: Record<string, string>;
  soqlTabs?: unknown;
}

const { mockStoreData, mockSafeStorage, mockLog } = vi.hoisted(() => ({
  mockStoreData: { primary: {} as MockStoreData, tabs: {} as MockStoreData },
  mockSafeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((s: string) => Buffer.from(`enc:${s}`)),
    decryptString: vi.fn((buf: Buffer) => buf.toString('utf-8').replace(/^enc:/, '')),
  },
  mockLog: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('electron', () => ({
  safeStorage: mockSafeStorage,
}));

vi.mock('electron-store', () => {
  let instanceCount = 0;
  return {
    default: class Store<T extends Record<string, unknown>> {
      private bucket: MockStoreData;
      private defaults: T;
      constructor(options: { name: string; defaults: T }) {
        instanceCount++;
        // 1 つ目 = primary (storeName)、2 つ目 = tabs (storeName-tabs)
        this.bucket = instanceCount === 1 ? mockStoreData.primary : mockStoreData.tabs;
        this.defaults = options.defaults;
      }
      get<K extends keyof T>(key: K, fallback?: T[K]): T[K] {
        const v = (this.bucket as Record<string, unknown>)[key as string];
        if (v === undefined) return (fallback ?? this.defaults[key]) as T[K];
        return v as T[K];
      }
      set<K extends keyof T>(key: K, value: T[K]): void {
        (this.bucket as Record<string, unknown>)[key as string] = value;
      }
    },
  };
});

vi.mock('../../../packages/main-core/src/buildInfo.js', () => ({
  BUILD: { target: 'explorer', storeName: 'test-store' },
}));

vi.mock('../../../packages/main-core/src/logger.js', () => ({
  log: mockLog,
}));

// ============================================================
// 対象
// ============================================================

import {
  loadSettings,
  saveSettings,
  loadProfiles,
  saveProfile,
  deleteProfile,
  getProfile,
  saveRefreshToken,
  loadRefreshToken,
  deleteRefreshToken,
  saveInstanceUrl,
  loadInstanceUrl,
  loadSoqlTabs,
  saveSoqlTabs,
  _resetSafeStorageWarnForTest,
} from '../../../packages/main-core/src/settings.js';
import { makeProfile } from '../../fixtures/contract.js';

beforeEach(() => {
  vi.clearAllMocks();
  // settings.ts 側 Store instance が持つ参照を壊さないよう in-place で中身だけ消す
  for (const k of Object.keys(mockStoreData.primary)) {
    delete (mockStoreData.primary as Record<string, unknown>)[k];
  }
  for (const k of Object.keys(mockStoreData.tabs)) {
    delete (mockStoreData.tabs as Record<string, unknown>)[k];
  }
  mockSafeStorage.isEncryptionAvailable.mockReturnValue(true);
  mockSafeStorage.encryptString.mockImplementation((s: string) => Buffer.from(`enc:${s}`));
  mockSafeStorage.decryptString.mockImplementation((buf: Buffer) => buf.toString('utf-8').replace(/^enc:/, ''));
  _resetSafeStorageWarnForTest();
});

// ============================================================
// settings (AppSettings)
// ============================================================

describe('loadSettings / saveSettings', () => {
  it('未保存なら defaultMaxRows=2000 のデフォルトを返す', () => {
    expect(loadSettings()).toEqual({ defaultMaxRows: 2000 });
  });

  it('saveSettings 後は loadSettings で読み戻せる', () => {
    saveSettings({ defaultMaxRows: 500 });
    expect(loadSettings()).toEqual({ defaultMaxRows: 500 });
  });

  it('saveSettings は全体上書き (部分マージしない)', () => {
    saveSettings({ defaultMaxRows: 1000 });
    saveSettings({ defaultMaxRows: 5000 });
    expect(loadSettings().defaultMaxRows).toBe(5000);
  });
});

// ============================================================
// profiles
// ============================================================

describe('loadProfiles / saveProfile / deleteProfile / getProfile', () => {
  it('未保存なら空配列', () => {
    expect(loadProfiles()).toEqual([]);
  });

  it('新規 saveProfile は push される', () => {
    const p = makeProfile({ id: 'a' });
    saveProfile(p);
    expect(loadProfiles()).toEqual([p]);
  });

  it('同 ID の saveProfile は upsert (置換)', () => {
    saveProfile(makeProfile({ id: 'a', name: '旧' }));
    saveProfile(makeProfile({ id: 'a', name: '新' }));
    const all = loadProfiles();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('新');
  });

  it('複数プロファイル管理: 順序を保つ', () => {
    saveProfile(makeProfile({ id: 'a' }));
    saveProfile(makeProfile({ id: 'b' }));
    saveProfile(makeProfile({ id: 'c' }));
    expect(loadProfiles().map(p => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('deleteProfile は対応する refresh_token も削除する', () => {
    saveProfile(makeProfile({ id: 'a' }));
    saveRefreshToken('a', 'rt-a');
    expect(loadRefreshToken('a')).toBe('rt-a');
    deleteProfile('a');
    expect(loadProfiles()).toHaveLength(0);
    expect(loadRefreshToken('a')).toBeNull();
  });

  it('deleteProfile を存在しない ID に対して呼んでも throw しない', () => {
    expect(() => deleteProfile('nonexistent')).not.toThrow();
  });

  it('getProfile はヒット時に該当を返す', () => {
    const p = makeProfile({ id: 'a' });
    saveProfile(p);
    expect(getProfile('a')).toEqual(p);
  });

  it('getProfile はミス時に undefined', () => {
    expect(getProfile('nonexistent')).toBeUndefined();
  });
});

// ============================================================
// safeStorage 経由のトークン管理
// ============================================================

describe('saveRefreshToken / loadRefreshToken — safeStorage 利用可能', () => {
  it('保存 → 読み出しでラウンドトリップ', () => {
    saveRefreshToken('p1', 'my-token');
    expect(loadRefreshToken('p1')).toBe('my-token');
    expect(mockSafeStorage.encryptString).toHaveBeenCalledWith('my-token');
  });

  it('複数プロファイルのトークンを独立保持', () => {
    saveRefreshToken('p1', 'token-1');
    saveRefreshToken('p2', 'token-2');
    expect(loadRefreshToken('p1')).toBe('token-1');
    expect(loadRefreshToken('p2')).toBe('token-2');
  });

  it('deleteRefreshToken で削除', () => {
    saveRefreshToken('p1', 'x');
    deleteRefreshToken('p1');
    expect(loadRefreshToken('p1')).toBeNull();
  });

  it('未保存 ID は null', () => {
    expect(loadRefreshToken('unknown')).toBeNull();
  });

  it('decryptString が throw する場合は null + 例外を握りつぶす', () => {
    saveRefreshToken('p1', 'token');
    mockSafeStorage.decryptString.mockImplementationOnce(() => {
      throw new Error('corrupted');
    });
    expect(loadRefreshToken('p1')).toBeNull();
  });
});

describe('saveRefreshToken / loadRefreshToken — safeStorage 利用不可', () => {
  beforeEach(() => {
    mockSafeStorage.isEncryptionAvailable.mockReturnValue(false);
  });

  it('saveRefreshToken は throw + 警告ログを 1 回出す', () => {
    expect(() => saveRefreshToken('p1', 'token')).toThrow(/safeStorage が利用できません/);
    expect(mockLog.warn).toHaveBeenCalledTimes(1);
  });

  it('警告は 1 回だけ (連続呼び出しでも 1 回)', () => {
    expect(() => saveRefreshToken('p1', 'token')).toThrow();
    expect(() => saveRefreshToken('p2', 'token2')).toThrow();
    expect(() => loadRefreshToken('p3')).not.toThrow();
    expect(mockLog.warn).toHaveBeenCalledTimes(1);
  });

  it('loadRefreshToken は null を返す (throw しない)', () => {
    expect(loadRefreshToken('p1')).toBeNull();
  });
});

// ============================================================
// instance URL
// ============================================================

describe('saveInstanceUrl / loadInstanceUrl', () => {
  it('保存 → 読み出し', () => {
    saveInstanceUrl('p1', 'https://x.my.salesforce.com');
    expect(loadInstanceUrl('p1')).toBe('https://x.my.salesforce.com');
  });

  it('未保存 ID は null', () => {
    expect(loadInstanceUrl('unknown')).toBeNull();
  });

  it('複数プロファイル独立', () => {
    saveInstanceUrl('p1', 'https://a');
    saveInstanceUrl('p2', 'https://b');
    expect(loadInstanceUrl('p1')).toBe('https://a');
    expect(loadInstanceUrl('p2')).toBe('https://b');
  });
});

// ============================================================
// SOQL タブ永続化
// ============================================================

describe('loadSoqlTabs / saveSoqlTabs', () => {
  it('未保存は null', () => {
    expect(loadSoqlTabs()).toBeNull();
  });

  it('保存 → 読み出しのラウンドトリップ', () => {
    const state = {
      tabs: [
        { id: 't1', name: 'A', soql: 'SELECT Id FROM Account', fetchAll: false },
        { id: 't2', name: 'B', soql: '', fetchAll: true },
      ],
      activeTabId: 't1',
    };
    saveSoqlTabs(state);
    expect(loadSoqlTabs()).toEqual(state);
  });

  it('上書き保存', () => {
    saveSoqlTabs({ tabs: [{ id: 'a', name: 'A', soql: '', fetchAll: false }], activeTabId: 'a' });
    saveSoqlTabs({ tabs: [{ id: 'b', name: 'B', soql: 'X', fetchAll: true }], activeTabId: 'b' });
    expect(loadSoqlTabs()).toEqual({
      tabs: [{ id: 'b', name: 'B', soql: 'X', fetchAll: true }],
      activeTabId: 'b',
    });
  });

  it('プライマリ store と分離 (settings には影響しない)', () => {
    saveSettings({ defaultMaxRows: 1234 });
    saveSoqlTabs({ tabs: [{ id: 'x', name: 'X', soql: '', fetchAll: false }], activeTabId: 'x' });
    // primary store の settings は無事
    expect(loadSettings().defaultMaxRows).toBe(1234);
    // tabs store の SOQL は無事
    expect(loadSoqlTabs()?.activeTabId).toBe('x');
  });
});
