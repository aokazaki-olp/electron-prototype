/**
 * ipcHandlers.test.ts
 * @description electron の ipcMain / shell をモックして、登録・引数検証・エラー変換を検証する。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpError } from '../libs/index.js';

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
  const address = { normalize: vi.fn().mockResolvedValue({ pref: 'X', city: '', town: '', addr: '', other: '', level: 1 }) };
  return { gbiz: gbiz as never, address };
};

beforeEach(() => {
  handlers.clear();
});

describe('registerIpcHandlers', () => {
  it('18 個の gbiz チャンネルと nja / shell を登録する', () => {
    registerIpcHandlers(mkDeps());
    for (const name of GBIZ_CHANNELS) {
      expect(handlers.has(`gbiz:${name}`)).toBe(true);
    }
    expect(handlers.has('nja:normalize')).toBe(true);
    expect(handlers.has('shell:openExternal')).toBe(true);
  });

  it('gbiz: object 以外の引数は TypeError', async () => {
    registerIpcHandlers(mkDeps());
    const fn = handlers.get('gbiz:getHojin')!;
    await expect(fn({}, 'not-an-object')).rejects.toBeInstanceOf(TypeError);
    await expect(fn({}, null)).rejects.toBeInstanceOf(TypeError);
    await expect(fn({}, [])).rejects.toBeInstanceOf(TypeError);
  });

  it('gbiz: 404 はエラー化せずレスポンス本文を返す（該当データなし）', async () => {
    const deps = mkDeps();
    const body = { id: null, message: '404 - Not Found.', errors: [] };
    (deps.gbiz as unknown as Record<string, ReturnType<typeof vi.fn>>).getHojin
      .mockRejectedValueOnce(new HttpError('no', 404, body));
    registerIpcHandlers(deps);
    const fn = handlers.get('gbiz:getHojin')!;
    await expect(fn({}, { corporate_number: '1' })).resolves.toEqual(body);
  });

  it('gbiz: 404 以外の HttpError は plain Error に畳まれて投げられる', async () => {
    const deps = mkDeps();
    (deps.gbiz as unknown as Record<string, ReturnType<typeof vi.fn>>).getHojin
      .mockRejectedValueOnce(new HttpError('boom', 500, { e: 1 }));
    registerIpcHandlers(deps);
    const fn = handlers.get('gbiz:getHojin')!;
    await expect(fn({}, { corporate_number: '1' })).rejects.toMatchObject({
      message: expect.stringContaining('HTTP 500'),
      status: 500,
    });
  });

  it('nja: string 以外は TypeError', async () => {
    registerIpcHandlers(mkDeps());
    const fn = handlers.get('nja:normalize')!;
    await expect(fn({}, 123)).rejects.toBeInstanceOf(TypeError);
  });

  it('shell:openExternal: 非 http(s) URL を弾く', async () => {
    registerIpcHandlers(mkDeps());
    const fn = handlers.get('shell:openExternal')!;
    await expect(fn({}, 'file:///etc/passwd')).rejects.toBeInstanceOf(TypeError);
    await expect(fn({}, 'javascript:alert(1)')).rejects.toBeInstanceOf(TypeError);
    await expect(fn({}, 42)).rejects.toBeInstanceOf(TypeError);
    expect(shell.openExternal).not.toHaveBeenCalled();
  });

  it('shell:openExternal: https URL は通る', async () => {
    registerIpcHandlers(mkDeps());
    const fn = handlers.get('shell:openExternal')!;
    await fn({}, 'https://www.google.com/maps?q=1,2');
    expect(shell.openExternal).toHaveBeenCalledWith('https://www.google.com/maps?q=1,2');
  });
});
