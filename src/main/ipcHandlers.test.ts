/**
 * ipcHandlers.test.ts
 * @description electron の ipcMain / shell をモックして、登録・引数検証・エラー変換を検証する。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpError, RetryExhaustedError } from '../libs/index.js';

const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, ...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    },
  },
  shell: {
    openExternal: vi.fn().mockResolvedValue(undefined),
  },
}));

// eslint-disable-next-line import/first
import { registerIpcHandlers } from './ipcHandlers.js';
// eslint-disable-next-line import/first
import { shell } from 'electron';
// eslint-disable-next-line import/first
import { GBIZ_CHANNELS } from '../ipc/contract.js';

const mkDeps = () => {
  const gbiz = Object.fromEntries(
    GBIZ_CHANNELS.map((n) => [n, vi.fn().mockResolvedValue({ called: n })]),
  );
  const address = {
    normalize: vi.fn().mockResolvedValue({ pref: 'X', city: '', town: '', addr: '', other: '', level: 1 }),
  };
  return { gbiz: gbiz as never, address };
};

beforeEach(() => {
  handlers.clear();
  vi.mocked(shell.openExternal).mockClear();
});

// ============================================================================
// 登録検証
// ============================================================================

describe('registerIpcHandlers — 登録検証', () => {
  it('18 個の gbiz チャンネルと nja / shell を登録する', () => {
    registerIpcHandlers(mkDeps());
    for (const name of GBIZ_CHANNELS) {
      expect(handlers.has(`gbiz:${name}`)).toBe(true);
    }
    expect(handlers.has('nja:normalize')).toBe(true);
    expect(handlers.has('shell:openExternal')).toBe(true);
  });
  it('合計 21 チャンネルが登録される（19 gbiz + nja + shell）', () => {
    registerIpcHandlers(mkDeps());
    expect(handlers.size).toBe(21);
  });
});

// ============================================================================
// gbiz ハンドラ — 引数バリデーション
// ============================================================================

describe('gbiz ハンドラ — 引数バリデーション', () => {
  it('string は TypeError', async () => {
    registerIpcHandlers(mkDeps());
    const fn = handlers.get('gbiz:getHojin')!;
    await expect(fn({}, 'not-an-object')).rejects.toBeInstanceOf(TypeError);
  });
  it('null は TypeError', async () => {
    registerIpcHandlers(mkDeps());
    const fn = handlers.get('gbiz:getHojin')!;
    await expect(fn({}, null)).rejects.toBeInstanceOf(TypeError);
  });
  it('array は TypeError（object だが Array.isArray で弾く）', async () => {
    registerIpcHandlers(mkDeps());
    const fn = handlers.get('gbiz:getHojin')!;
    await expect(fn({}, [])).rejects.toBeInstanceOf(TypeError);
  });
  it('number は TypeError', async () => {
    registerIpcHandlers(mkDeps());
    const fn = handlers.get('gbiz:searchHojin')!;
    await expect(fn({}, 42)).rejects.toBeInstanceOf(TypeError);
  });
  it('boolean は TypeError', async () => {
    registerIpcHandlers(mkDeps());
    const fn = handlers.get('gbiz:searchHojin')!;
    await expect(fn({}, true)).rejects.toBeInstanceOf(TypeError);
  });
});

// ============================================================================
// gbiz ハンドラ — 正常系
// ============================================================================

describe('gbiz ハンドラ — 正常系', () => {
  it('searchHojin チャンネルが searchHojin メソッドを引数そのままで呼ぶ', async () => {
    const deps = mkDeps();
    registerIpcHandlers(deps);
    const fn = handlers.get('gbiz:searchHojin')!;
    await fn({}, { name: 'トヨタ', page: 1 });
    expect((deps.gbiz as unknown as Record<string, ReturnType<typeof vi.fn>>).searchHojin)
      .toHaveBeenCalledWith({ name: 'トヨタ', page: 1 });
  });
  it('getHojin チャンネルが getHojin メソッドを呼ぶ', async () => {
    const deps = mkDeps();
    registerIpcHandlers(deps);
    const fn = handlers.get('gbiz:getHojin')!;
    await fn({}, { corporate_number: '1234567890123' });
    expect((deps.gbiz as unknown as Record<string, ReturnType<typeof vi.fn>>).getHojin)
      .toHaveBeenCalledWith({ corporate_number: '1234567890123' });
  });
  it('成功レスポンスをそのまま返す', async () => {
    const deps = mkDeps();
    registerIpcHandlers(deps);
    const fn = handlers.get('gbiz:searchHojin')!;
    const result = await fn({}, { name: 'A' });
    expect(result).toEqual({ called: 'searchHojin' });
  });
});

// ============================================================================
// gbiz ハンドラ — 404 ハンドリング
// ============================================================================

describe('gbiz ハンドラ — 404 ハンドリング', () => {
  it('404 body あり → body をそのまま返す（エラー化しない）', async () => {
    const deps = mkDeps();
    const body = { id: null, message: '404 - Not Found.', errors: [] };
    (deps.gbiz as unknown as Record<string, ReturnType<typeof vi.fn>>).getHojin
      .mockRejectedValueOnce(new HttpError('no', 404, body));
    registerIpcHandlers(deps);
    const fn = handlers.get('gbiz:getHojin')!;
    await expect(fn({}, { corporate_number: '1' })).resolves.toEqual(body);
  });
  it('404 body=null → デフォルトオブジェクトを返す', async () => {
    const deps = mkDeps();
    (deps.gbiz as unknown as Record<string, ReturnType<typeof vi.fn>>).getHojin
      .mockRejectedValueOnce(new HttpError('no', 404, null));
    registerIpcHandlers(deps);
    const fn = handlers.get('gbiz:getHojin')!;
    const result = await fn({}, { corporate_number: '1' });
    expect(result).toEqual({ id: null, message: '404 - Not Found.', errors: [] });
  });
  it('404 body=undefined → デフォルトオブジェクトを返す', async () => {
    const deps = mkDeps();
    (deps.gbiz as unknown as Record<string, ReturnType<typeof vi.fn>>).getHojin
      .mockRejectedValueOnce(new HttpError('no', 404, undefined));
    registerIpcHandlers(deps);
    const fn = handlers.get('gbiz:getHojin')!;
    const result = await fn({}, { corporate_number: '1' });
    expect(result).toEqual({ id: null, message: '404 - Not Found.', errors: [] });
  });
});

// ============================================================================
// gbiz ハンドラ — toIpcError 変換（§7.5 IPC 構造化クローン対策）
// ============================================================================

describe('gbiz ハンドラ — toIpcError 変換', () => {
  it('HttpError 500 with body → message に "HTTP 500" と JSON body が含まれる', async () => {
    const deps = mkDeps();
    (deps.gbiz as unknown as Record<string, ReturnType<typeof vi.fn>>).getHojin
      .mockRejectedValueOnce(new HttpError('boom', 500, { e: 1 }));
    registerIpcHandlers(deps);
    const fn = handlers.get('gbiz:getHojin')!;
    const caught = await fn({}, { corporate_number: '1' }).catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('HTTP 500');
    expect((caught as Error).message).toContain(JSON.stringify({ e: 1 }));
  });
  it('HttpError 500 body=null → body suffix なし（"HTTP 500: boom" のみ）', async () => {
    const deps = mkDeps();
    (deps.gbiz as unknown as Record<string, ReturnType<typeof vi.fn>>).getHojin
      .mockRejectedValueOnce(new HttpError('boom', 500, null));
    registerIpcHandlers(deps);
    const fn = handlers.get('gbiz:getHojin')!;
    await expect(fn({}, { corporate_number: '1' })).rejects.toMatchObject({
      message: 'HTTP 500: boom',
    });
  });
  it('HttpError 503 with body object → message に HTTP 503 と JSON が含まれる', async () => {
    const deps = mkDeps();
    (deps.gbiz as unknown as Record<string, ReturnType<typeof vi.fn>>).searchHojin
      .mockRejectedValueOnce(new HttpError('service unavailable', 503, { code: 503 }));
    registerIpcHandlers(deps);
    const fn = handlers.get('gbiz:searchHojin')!;
    const caught = await fn({}, { name: 'X' }).catch((e: unknown) => e);
    expect((caught as Error).message).toContain('HTTP 503');
    expect((caught as Error).message).toContain(JSON.stringify({ code: 503 }));
  });
  it('plain Error → そのまま再スロー（変換なし）', async () => {
    const deps = mkDeps();
    const err = new Error('plain error');
    (deps.gbiz as unknown as Record<string, ReturnType<typeof vi.fn>>).getHojin
      .mockRejectedValueOnce(err);
    registerIpcHandlers(deps);
    const fn = handlers.get('gbiz:getHojin')!;
    await expect(fn({}, { corporate_number: '1' })).rejects.toBe(err);
  });
  it('non-Error 値（string）→ new Error(String(value)) に変換される', async () => {
    const deps = mkDeps();
    (deps.gbiz as unknown as Record<string, ReturnType<typeof vi.fn>>).getHojin
      .mockRejectedValueOnce('unexpected string error');
    registerIpcHandlers(deps);
    const fn = handlers.get('gbiz:getHojin')!;
    await expect(fn({}, { corporate_number: '1' })).rejects.toMatchObject({
      message: 'unexpected string error',
    });
  });
  it('RetryExhaustedError（HttpError でない）→ plain Error として再スロー', async () => {
    const deps = mkDeps();
    (deps.gbiz as unknown as Record<string, ReturnType<typeof vi.fn>>).searchHojin
      .mockRejectedValueOnce(new RetryExhaustedError('retry limit exceeded'));
    registerIpcHandlers(deps);
    const fn = handlers.get('gbiz:searchHojin')!;
    await expect(fn({}, { name: 'X' })).rejects.toBeInstanceOf(Error);
  });
});

// ============================================================================
// nja ハンドラ — 引数バリデーション
// ============================================================================

describe('nja ハンドラ — 引数バリデーション', () => {
  it('number → TypeError', async () => {
    registerIpcHandlers(mkDeps());
    const fn = handlers.get('nja:normalize')!;
    await expect(fn({}, 123)).rejects.toBeInstanceOf(TypeError);
  });
  it('null → TypeError', async () => {
    registerIpcHandlers(mkDeps());
    const fn = handlers.get('nja:normalize')!;
    await expect(fn({}, null)).rejects.toBeInstanceOf(TypeError);
  });
  it('boolean → TypeError', async () => {
    registerIpcHandlers(mkDeps());
    const fn = handlers.get('nja:normalize')!;
    await expect(fn({}, false)).rejects.toBeInstanceOf(TypeError);
  });
  it('plain object → TypeError', async () => {
    registerIpcHandlers(mkDeps());
    const fn = handlers.get('nja:normalize')!;
    await expect(fn({}, {})).rejects.toBeInstanceOf(TypeError);
  });
  it('array → TypeError', async () => {
    registerIpcHandlers(mkDeps());
    const fn = handlers.get('nja:normalize')!;
    await expect(fn({}, ['東京'])).rejects.toBeInstanceOf(TypeError);
  });
});

describe('nja ハンドラ — 正常系 / エラー系', () => {
  it('valid string → address.normalize が同じ文字列で呼ばれる', async () => {
    const deps = mkDeps();
    registerIpcHandlers(deps);
    const fn = handlers.get('nja:normalize')!;
    await fn({}, '東京都千代田区丸の内1-1');
    expect(deps.address.normalize).toHaveBeenCalledWith('東京都千代田区丸の内1-1');
  });
  it('normalize の結果をそのまま返す', async () => {
    const deps = mkDeps();
    registerIpcHandlers(deps);
    const fn = handlers.get('nja:normalize')!;
    const result = await fn({}, '東京都千代田区');
    expect(result).toMatchObject({ pref: 'X', level: 1 });
  });
  it('normalize が Error を投げる → toIpcError が適用される（plain Error は同一インスタンス）', async () => {
    const deps = mkDeps();
    const err = new Error('nja down');
    deps.address.normalize.mockRejectedValueOnce(err);
    registerIpcHandlers(deps);
    const fn = handlers.get('nja:normalize')!;
    await expect(fn({}, '東京')).rejects.toBe(err);
  });
  it('normalize が non-Error を投げる → new Error に変換される', async () => {
    const deps = mkDeps();
    deps.address.normalize.mockRejectedValueOnce('nja string error');
    registerIpcHandlers(deps);
    const fn = handlers.get('nja:normalize')!;
    await expect(fn({}, '東京')).rejects.toMatchObject({ message: 'nja string error' });
  });
});

// ============================================================================
// shell:openExternal ハンドラ — 引数バリデーション
// ============================================================================

describe('shell:openExternal — 引数バリデーション', () => {
  it('file:// を弾く', async () => {
    registerIpcHandlers(mkDeps());
    const fn = handlers.get('shell:openExternal')!;
    await expect(fn({}, 'file:///etc/passwd')).rejects.toBeInstanceOf(TypeError);
    expect(shell.openExternal).not.toHaveBeenCalled();
  });
  it('javascript: を弾く', async () => {
    registerIpcHandlers(mkDeps());
    const fn = handlers.get('shell:openExternal')!;
    await expect(fn({}, 'javascript:alert(1)')).rejects.toBeInstanceOf(TypeError);
  });
  it('ftp:// を弾く', async () => {
    registerIpcHandlers(mkDeps());
    const fn = handlers.get('shell:openExternal')!;
    await expect(fn({}, 'ftp://example.com')).rejects.toBeInstanceOf(TypeError);
  });
  it('data: URL を弾く', async () => {
    registerIpcHandlers(mkDeps());
    const fn = handlers.get('shell:openExternal')!;
    await expect(fn({}, 'data:text/html,<h1>hi</h1>')).rejects.toBeInstanceOf(TypeError);
  });
  it('空文字を弾く', async () => {
    registerIpcHandlers(mkDeps());
    const fn = handlers.get('shell:openExternal')!;
    await expect(fn({}, '')).rejects.toBeInstanceOf(TypeError);
  });
  it('number を弾く', async () => {
    registerIpcHandlers(mkDeps());
    const fn = handlers.get('shell:openExternal')!;
    await expect(fn({}, 42)).rejects.toBeInstanceOf(TypeError);
  });
  it('null を弾く', async () => {
    registerIpcHandlers(mkDeps());
    const fn = handlers.get('shell:openExternal')!;
    await expect(fn({}, null)).rejects.toBeInstanceOf(TypeError);
  });
  it('boolean を弾く', async () => {
    registerIpcHandlers(mkDeps());
    const fn = handlers.get('shell:openExternal')!;
    await expect(fn({}, true)).rejects.toBeInstanceOf(TypeError);
  });
});

describe('shell:openExternal — 正常系', () => {
  it('https:// → shell.openExternal が同じ URL で呼ばれる', async () => {
    registerIpcHandlers(mkDeps());
    const fn = handlers.get('shell:openExternal')!;
    await fn({}, 'https://www.google.com/maps?q=1,2');
    expect(shell.openExternal).toHaveBeenCalledWith('https://www.google.com/maps?q=1,2');
  });
  it('http:// → shell.openExternal が呼ばれる', async () => {
    registerIpcHandlers(mkDeps());
    const fn = handlers.get('shell:openExternal')!;
    await fn({}, 'http://example.com/path?q=1');
    expect(shell.openExternal).toHaveBeenCalledWith('http://example.com/path?q=1');
  });
});
