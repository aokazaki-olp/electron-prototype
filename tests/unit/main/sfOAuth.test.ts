/**
 * sfOAuth.ts のユニットテスト。
 *
 * Salesforce OAuth は秘匿情報を扱う critical path。
 * electron (shell) / got (HTTP) / logger / settings / buildInfo / node:crypto を全てモックし、
 * PKCE 生成、state 検証 (CSRF)、callback URL ハンドリング、トークン交換、race / timeout / 失敗時のリーク防止 を網羅検証する。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================================
// モック (vi.hoisted で評価順を担保)
// ============================================================

const { mockShellOpenExternal, mockGotPost, mockSaveRefreshToken, mockLoadRefreshToken,
  mockSaveInstanceUrl, mockLoadInstanceUrl, mockGetProfile, mockDeleteRefreshToken,
  mockLog, mockRandomBytes, mockCreateHash } = vi.hoisted(() => ({
  mockShellOpenExternal: vi.fn(),
  mockGotPost: vi.fn(),
  mockSaveRefreshToken: vi.fn(),
  mockLoadRefreshToken: vi.fn(),
  mockSaveInstanceUrl: vi.fn(),
  mockLoadInstanceUrl: vi.fn(),
  mockGetProfile: vi.fn(),
  mockDeleteRefreshToken: vi.fn(),
  mockLog: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockRandomBytes: vi.fn(),
  mockCreateHash: vi.fn(),
}));

vi.mock('electron', () => ({
  shell: { openExternal: mockShellOpenExternal },
}));

vi.mock('got', () => ({
  got: { post: mockGotPost },
}));

vi.mock('../../../packages/main-core/src/logger.js', () => ({
  log: mockLog,
}));

vi.mock('../../../packages/main-core/src/buildInfo.js', () => ({
  OAUTH_CALLBACK_URL: 'salesforce-explorer://callback',
}));

vi.mock('../../../packages/main-core/src/settings.js', () => ({
  saveRefreshToken: mockSaveRefreshToken,
  loadRefreshToken: mockLoadRefreshToken,
  saveInstanceUrl: mockSaveInstanceUrl,
  loadInstanceUrl: mockLoadInstanceUrl,
  getProfile: mockGetProfile,
  deleteRefreshToken: mockDeleteRefreshToken,
}));

vi.mock('node:crypto', async () => {
  const actual = await vi.importActual<typeof import('node:crypto')>('node:crypto');
  return {
    ...actual,
    randomBytes: mockRandomBytes,
    createHash: mockCreateHash,
  };
});

// ============================================================
// テスト本体
// ============================================================

import {
  startOAuth,
  refreshAccessToken,
  disconnect,
  isConnected,
  handleCallbackUrl,
  getAccessToken,
  getInstanceUrl,
  injectTokenForTest,
} from '../../../packages/main-core/src/sfOAuth.js';
import { makeProfile } from '../../fixtures/contract.js';

const PROFILE = makeProfile({ id: 'p1', loginUrl: 'https://login.salesforce.com', clientId: 'cid-1' });

const mockHashDigest = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockGetProfile.mockReturnValue(PROFILE);
  // randomBytes は呼ばれた回数で異なる値を返す（PKCE verifier と state を区別）
  let callCount = 0;
  mockRandomBytes.mockImplementation((size: number) => {
    callCount++;
    // 64 byte 呼び出し = code verifier、32 byte 呼び出し = state
    return Buffer.from(`mock-bytes-${callCount}-${size}`.padEnd(size, '0').slice(0, size));
  });
  mockHashDigest.mockReturnValue('mock-challenge');
  mockCreateHash.mockReturnValue({ update: vi.fn().mockReturnThis(), digest: mockHashDigest });
  mockShellOpenExternal.mockResolvedValue(undefined);
  // すべてのテストで pending callback をリセットするため disconnect を呼んでメモリを綺麗にする
  disconnect(PROFILE.id);
});

// ============================================================
// handleCallbackUrl
// ============================================================

describe('handleCallbackUrl — pending callback が無いとき', () => {
  it('warn ログを出し、throw しない', () => {
    expect(() => handleCallbackUrl('salesforce-explorer://callback?code=abc&state=x')).not.toThrow();
    expect(mockLog.warn).toHaveBeenCalled();
  });
});

describe('handleCallbackUrl — pending callback がある状態（startOAuth 経由）', () => {
  const successTokenResponse = {
    statusCode: 200,
    body: JSON.stringify({
      access_token: 'at-1', refresh_token: 'rt-1',
      instance_url: 'https://test.my.salesforce.com', token_type: 'Bearer',
    }),
  };

  it('成功フロー: code を受け取って token 交換まで完走する', async () => {
    mockGotPost.mockResolvedValue(successTokenResponse);

    // openExternal 呼ばれたタイミングでこちらから callback を投げる
    mockShellOpenExternal.mockImplementation(async (authUrl: string) => {
      const stateMatch = /state=([^&]+)/.exec(authUrl);
      const state = stateMatch?.[1] ?? '';
      // 非同期で callback を投げる
      queueMicrotask(() => {
        handleCallbackUrl(`salesforce-explorer://callback?code=auth-code&state=${state}`);
      });
    });

    await expect(startOAuth(PROFILE.id)).resolves.toBeUndefined();
    expect(getAccessToken(PROFILE.id)).toBe('at-1');
    expect(getInstanceUrl(PROFILE.id)).toBe('https://test.my.salesforce.com');
    expect(mockSaveRefreshToken).toHaveBeenCalledWith(PROFILE.id, 'rt-1');
    expect(mockSaveInstanceUrl).toHaveBeenCalledWith(PROFILE.id, 'https://test.my.salesforce.com');
  });

  it('state 不一致で CSRF エラーになる', async () => {
    mockShellOpenExternal.mockImplementation(async () => {
      queueMicrotask(() => {
        handleCallbackUrl('salesforce-explorer://callback?code=x&state=WRONG_STATE');
      });
    });

    await expect(startOAuth(PROFILE.id)).rejects.toThrow(/state パラメータが一致しません/);
  });

  it('error= が含まれていれば reject', async () => {
    mockShellOpenExternal.mockImplementation(async (authUrl: string) => {
      const stateMatch = /state=([^&]+)/.exec(authUrl);
      const state = stateMatch?.[1] ?? '';
      queueMicrotask(() => {
        handleCallbackUrl(`salesforce-explorer://callback?error=access_denied&error_description=user_canceled&state=${state}`);
      });
    });

    await expect(startOAuth(PROFILE.id)).rejects.toThrow(/OAuth エラー: user_canceled/);
  });

  it('code が無ければ reject', async () => {
    mockShellOpenExternal.mockImplementation(async (authUrl: string) => {
      const stateMatch = /state=([^&]+)/.exec(authUrl);
      const state = stateMatch?.[1] ?? '';
      queueMicrotask(() => {
        handleCallbackUrl(`salesforce-explorer://callback?state=${state}`);
      });
    });

    await expect(startOAuth(PROFILE.id)).rejects.toThrow(/認証コードが取得できませんでした/);
  });

  it('URL がパース不能なら reject', async () => {
    mockShellOpenExternal.mockImplementation(async () => {
      queueMicrotask(() => {
        handleCallbackUrl('::: not a url :::');
      });
    });

    await expect(startOAuth(PROFILE.id)).rejects.toThrow(/コールバックURLの解析に失敗/);
  });
});

// ============================================================
// startOAuth — エッジケース
// ============================================================

describe('startOAuth — エッジケース', () => {
  it('プロファイル不在で TypeError を投げる', async () => {
    mockGetProfile.mockReturnValue(undefined);
    await expect(startOAuth('nonexistent')).rejects.toThrow(TypeError);
  });

  it('shell.openExternal が throw すると pendingCallback を leak しない（次の認証が即起動できる）', async () => {
    mockShellOpenExternal.mockRejectedValueOnce(new Error('browser failed'));
    await expect(startOAuth(PROFILE.id)).rejects.toThrow('browser failed');

    // 直後に再度起動できる（前の pending が残っていれば「新しい認証が開始されました」reject になる）
    mockShellOpenExternal.mockImplementation(async (authUrl: string) => {
      const stateMatch = /state=([^&]+)/.exec(authUrl);
      queueMicrotask(() => {
        handleCallbackUrl(`salesforce-explorer://callback?code=second-try&state=${stateMatch?.[1] ?? ''}`);
      });
    });
    mockGotPost.mockResolvedValue({
      statusCode: 200,
      body: JSON.stringify({ access_token: 'at-2', instance_url: 'https://x', token_type: 'Bearer' }),
    });

    await expect(startOAuth(PROFILE.id)).resolves.toBeUndefined();
    expect(getAccessToken(PROFILE.id)).toBe('at-2');
  });

  it('race: 2 つ目の startOAuth が走ると 1 つ目は「新しい認証が開始されました」で reject', async () => {
    // 1 つ目: openExternal は成功するが callback は来ない（保留状態のまま）
    mockShellOpenExternal.mockResolvedValueOnce(undefined);
    const first = startOAuth(PROFILE.id);

    // 1 つ目が pending state を作るのを待つ
    await new Promise(r => setImmediate(r));

    // 2 つ目: callback 即発火
    mockShellOpenExternal.mockImplementation(async (authUrl: string) => {
      const stateMatch = /state=([^&]+)/.exec(authUrl);
      queueMicrotask(() => {
        handleCallbackUrl(`salesforce-explorer://callback?code=c2&state=${stateMatch?.[1] ?? ''}`);
      });
    });
    mockGotPost.mockResolvedValue({
      statusCode: 200,
      body: JSON.stringify({ access_token: 'at-second', instance_url: 'https://y', token_type: 'Bearer' }),
    });

    await expect(startOAuth(PROFILE.id)).resolves.toBeUndefined();
    await expect(first).rejects.toThrow(/新しい認証が開始されました/);
  });

  it('90 秒タイムアウトで reject', async () => {
    vi.useFakeTimers();
    mockShellOpenExternal.mockResolvedValueOnce(undefined);
    const promise = startOAuth(PROFILE.id);
    vi.advanceTimersByTime(91 * 1000);
    await expect(promise).rejects.toThrow(/タイムアウトしました/);
    vi.useRealTimers();
  });
});

// ============================================================
// exchangeToken (startOAuth 経由でレスポンス検証)
// ============================================================

describe('startOAuth — トークンレスポンス検証', () => {
  const mountCallback = (code: string) => {
    mockShellOpenExternal.mockImplementation(async (authUrl: string) => {
      const stateMatch = /state=([^&]+)/.exec(authUrl);
      queueMicrotask(() => {
        handleCallbackUrl(`salesforce-explorer://callback?code=${code}&state=${stateMatch?.[1] ?? ''}`);
      });
    });
  };

  it('HTTP 4xx は throw', async () => {
    mountCallback('x');
    mockGotPost.mockResolvedValue({ statusCode: 400, body: '{"error":"invalid_grant"}' });
    await expect(startOAuth(PROFILE.id)).rejects.toThrow(/HTTP 400/);
  });

  it('レスポンスがオブジェクトでないと throw', async () => {
    mountCallback('x');
    mockGotPost.mockResolvedValue({ statusCode: 200, body: '[]' });
    await expect(startOAuth(PROFILE.id)).rejects.toThrow(/形式が不正/);
  });

  it('access_token 欠落で throw', async () => {
    mountCallback('x');
    mockGotPost.mockResolvedValue({
      statusCode: 200,
      body: JSON.stringify({ instance_url: 'https://x', token_type: 'Bearer' }),
    });
    await expect(startOAuth(PROFILE.id)).rejects.toThrow(/形式が不正/);
  });

  it('refresh_token が無い場合は saveRefreshToken を呼ばない', async () => {
    mountCallback('x');
    mockGotPost.mockResolvedValue({
      statusCode: 200,
      body: JSON.stringify({ access_token: 'at-only', instance_url: 'https://x', token_type: 'Bearer' }),
    });
    await startOAuth(PROFILE.id);
    expect(mockSaveRefreshToken).not.toHaveBeenCalled();
    expect(getAccessToken(PROFILE.id)).toBe('at-only');
  });

  it('refresh_token が JSON 上で非文字列（例: null）の場合は undefined 扱い', async () => {
    mountCallback('x');
    mockGotPost.mockResolvedValue({
      statusCode: 200,
      body: JSON.stringify({
        access_token: 'at-x', refresh_token: null,
        instance_url: 'https://x', token_type: 'Bearer',
      }),
    });
    await startOAuth(PROFILE.id);
    expect(mockSaveRefreshToken).not.toHaveBeenCalled();
  });
});

// ============================================================
// refreshAccessToken
// ============================================================

describe('refreshAccessToken', () => {
  it('プロファイル不在 → false', async () => {
    mockGetProfile.mockReturnValue(undefined);
    await expect(refreshAccessToken('nonexistent')).resolves.toBe(false);
  });

  it('refresh_token 未保存 → false', async () => {
    mockLoadRefreshToken.mockReturnValue(null);
    await expect(refreshAccessToken(PROFILE.id)).resolves.toBe(false);
  });

  it('exchange 成功 → true、アクセストークン更新', async () => {
    mockLoadRefreshToken.mockReturnValue('rt-existing');
    mockGotPost.mockResolvedValue({
      statusCode: 200,
      body: JSON.stringify({
        access_token: 'at-refreshed', instance_url: 'https://x', token_type: 'Bearer',
      }),
    });
    await expect(refreshAccessToken(PROFILE.id)).resolves.toBe(true);
    expect(getAccessToken(PROFILE.id)).toBe('at-refreshed');
  });

  it('新しい refresh_token が返ったら上書き保存', async () => {
    mockLoadRefreshToken.mockReturnValue('rt-old');
    mockGotPost.mockResolvedValue({
      statusCode: 200,
      body: JSON.stringify({
        access_token: 'at-new', refresh_token: 'rt-new',
        instance_url: 'https://x', token_type: 'Bearer',
      }),
    });
    await refreshAccessToken(PROFILE.id);
    expect(mockSaveRefreshToken).toHaveBeenCalledWith(PROFILE.id, 'rt-new');
  });

  it('exchange エラー → false (throw しない、warn ログのみ)', async () => {
    mockLoadRefreshToken.mockReturnValue('rt-existing');
    mockGotPost.mockRejectedValue(new Error('network down'));
    await expect(refreshAccessToken(PROFILE.id)).resolves.toBe(false);
    expect(mockLog.warn).toHaveBeenCalled();
  });
});

// ============================================================
// disconnect / isConnected / injectTokenForTest
// ============================================================

describe('disconnect + isConnected', () => {
  it('injectTokenForTest 後は isConnected = true', () => {
    injectTokenForTest(PROFILE.id, 'at', 'https://x');
    expect(isConnected(PROFILE.id)).toBe(true);
    expect(getAccessToken(PROFILE.id)).toBe('at');
    expect(getInstanceUrl(PROFILE.id)).toBe('https://x');
  });

  it('disconnect 後は isConnected = false かつ refresh token も削除依頼が出る', () => {
    injectTokenForTest(PROFILE.id, 'at', 'https://x');
    disconnect(PROFILE.id);
    expect(isConnected(PROFILE.id)).toBe(false);
    expect(getAccessToken(PROFILE.id)).toBeNull();
    expect(mockDeleteRefreshToken).toHaveBeenCalledWith(PROFILE.id);
  });

  it('getInstanceUrl はメモリ → 永続ストアの順で参照する', () => {
    mockLoadInstanceUrl.mockReturnValue('https://persisted');
    // メモリには無い → 永続ストアの値
    disconnect(PROFILE.id);
    expect(getInstanceUrl(PROFILE.id)).toBe('https://persisted');
    // メモリに入れる → メモリが優先
    injectTokenForTest(PROFILE.id, 'at', 'https://memory');
    expect(getInstanceUrl(PROFILE.id)).toBe('https://memory');
  });
});
