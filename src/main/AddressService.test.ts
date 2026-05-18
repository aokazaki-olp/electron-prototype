/**
 * AddressService.test.ts
 * @description createAddressService の全経路を検証する。
 *              deps バリデーション・引数バリデーション・toNjaResult マッピング・
 *              キャッシュ（Promise キャッシュ）・エラー伝播の各観点から網羅的にテストする。
 */

import { describe, it, expect, vi } from 'vitest';
import { createAddressService } from './AddressService.js';

const mkRaw = (overrides: Partial<{
  pref: string; city: string; town: string; addr: string; other: string; level: number;
  point: { lat: number; lng: number; level: number };
}> = {}) => ({
  pref: '東京都',
  city: '千代田区',
  town: '丸の内一丁目',
  addr: '1-1',
  other: '',
  level: 3,
  point: { lat: 35.6, lng: 139.7, level: 3 },
  ...overrides,
});

// ============================================================================
// createAddressService — deps バリデーション
// ============================================================================

describe('createAddressService — deps バリデーション', () => {
  it('deps が null → TypeError', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => createAddressService(null as any)).toThrow(TypeError);
  });
  it('deps が undefined → TypeError', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => createAddressService(undefined as any)).toThrow(TypeError);
  });
  it('deps.normalize が null → TypeError', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => createAddressService({ normalize: null as any })).toThrow(TypeError);
  });
  it('deps.normalize が string → TypeError', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => createAddressService({ normalize: 'fn' as any })).toThrow(TypeError);
  });
  it('deps.normalize が number → TypeError', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => createAddressService({ normalize: 42 as any })).toThrow(TypeError);
  });
  it('deps.normalize が boolean → TypeError', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => createAddressService({ normalize: true as any })).toThrow(TypeError);
  });
  it('deps.normalize が plain object → TypeError', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => createAddressService({ normalize: {} as any })).toThrow(TypeError);
  });
  it('deps.normalize が array → TypeError', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => createAddressService({ normalize: [] as any })).toThrow(TypeError);
  });
  it('有効な normalize 関数 → AddressService を返す', () => {
    const svc = createAddressService({ normalize: vi.fn() });
    expect(typeof svc.normalize).toBe('function');
  });
});

// ============================================================================
// normalize — 引数バリデーション
// ============================================================================

describe('normalize — 引数バリデーション', () => {
  const mkSvc = () => createAddressService({ normalize: vi.fn().mockResolvedValue(mkRaw()) });

  it('空文字 → TypeError', () => {
    expect(() => mkSvc().normalize('')).toThrow(TypeError);
  });
  it('null → TypeError', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => mkSvc().normalize(null as any)).toThrow(TypeError);
  });
  it('undefined → TypeError', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => mkSvc().normalize(undefined as any)).toThrow(TypeError);
  });
  it('number → TypeError', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => mkSvc().normalize(123 as any)).toThrow(TypeError);
  });
  it('boolean → TypeError', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => mkSvc().normalize(true as any)).toThrow(TypeError);
  });
  it('plain object → TypeError', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => mkSvc().normalize({} as any)).toThrow(TypeError);
  });
  it('array → TypeError', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => mkSvc().normalize([] as any)).toThrow(TypeError);
  });
  it('空白のみ文字列はバリデーションを通過し normalize を呼ぶ（空文字ではない）', async () => {
    const normalize = vi.fn().mockResolvedValue(mkRaw());
    const svc = createAddressService({ normalize });
    await svc.normalize('   ');
    expect(normalize).toHaveBeenCalledWith('   ');
  });
});

// ============================================================================
// normalize — toNjaResult フィールドマッピング
// ============================================================================

describe('normalize — toNjaResult フィールドマッピング', () => {
  it('全フィールドが undefined の場合は各フィールドが空文字になる', async () => {
    const svc = createAddressService({ normalize: vi.fn().mockResolvedValue({ level: 0 }) });
    const r = await svc.normalize('不明な住所');
    expect(r).toEqual({ pref: '', city: '', town: '', addr: '', other: '', level: 0, point: undefined });
  });
  it('point が undefined → point プロパティは undefined', async () => {
    const svc = createAddressService({
      normalize: vi.fn().mockResolvedValue({ pref: '東京都', city: '千代田区', town: '', addr: '', other: '', level: 2 }),
    });
    const r = await svc.normalize('東京都千代田区');
    expect(r.point).toBeUndefined();
  });
  it('point が存在する → そのまま返す', async () => {
    const svc = createAddressService({
      normalize: vi.fn().mockResolvedValue(mkRaw({ point: { lat: 1.23, lng: 4.56, level: 7 } })),
    });
    const r = await svc.normalize('テスト住所');
    expect(r.point).toEqual({ lat: 1.23, lng: 4.56, level: 7 });
  });
  it('level 0 もそのまま返す', async () => {
    const svc = createAddressService({
      normalize: vi.fn().mockResolvedValue({ pref: '', city: '', town: '', addr: '', other: 'foo', level: 0 }),
    });
    const r = await svc.normalize('わからない');
    expect(r.level).toBe(0);
    expect(r.point).toBeUndefined();
  });
  it('level 8 もそのまま返す', async () => {
    const svc = createAddressService({
      normalize: vi.fn().mockResolvedValue(mkRaw({ level: 8, point: { lat: 35.6, lng: 139.7, level: 8 } })),
    });
    const r = await svc.normalize('建物まで');
    expect(r.level).toBe(8);
  });
  it('正常な住所 → pref / city / point が正しく変換される', async () => {
    const svc = createAddressService({ normalize: vi.fn().mockResolvedValue(mkRaw()) });
    const r = await svc.normalize('東京都千代田区丸の内1-1');
    expect(r.pref).toBe('東京都');
    expect(r.city).toBe('千代田区');
    expect(r.point).toEqual({ lat: 35.6, lng: 139.7, level: 3 });
  });
});

// ============================================================================
// normalize — キャッシュ（Promise キャッシュ）
// ============================================================================

describe('normalize — キャッシュ', () => {
  it('2 回目以降はキャッシュを返し normalize を再呼び出ししない', async () => {
    const normalize = vi.fn().mockResolvedValue(mkRaw());
    const svc = createAddressService({ normalize });
    await svc.normalize('東京都千代田区');
    await svc.normalize('東京都千代田区');
    expect(normalize).toHaveBeenCalledTimes(1);
  });
  it('同一住所への並列呼び出しでも normalize は 1 回だけ', async () => {
    const normalize = vi.fn().mockResolvedValue(mkRaw());
    const svc = createAddressService({ normalize });
    await Promise.all([svc.normalize('A'), svc.normalize('A'), svc.normalize('A')]);
    expect(normalize).toHaveBeenCalledTimes(1);
  });
  it('異なる住所文字列は個別にキャッシュされる', async () => {
    const normalize = vi.fn().mockResolvedValue(mkRaw());
    const svc = createAddressService({ normalize });
    await svc.normalize('住所A');
    await svc.normalize('住所B');
    await svc.normalize('住所A'); // キャッシュから
    await svc.normalize('住所B'); // キャッシュから
    expect(normalize).toHaveBeenCalledTimes(2);
  });
  it('インスタンスが異なればキャッシュも別々', async () => {
    const normalize = vi.fn().mockResolvedValue(mkRaw());
    const svc1 = createAddressService({ normalize });
    const svc2 = createAddressService({ normalize });
    await svc1.normalize('X');
    await svc2.normalize('X');
    expect(normalize).toHaveBeenCalledTimes(2);
  });
  it('失敗はキャッシュしない（次回再試行できる）', async () => {
    const normalize = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(mkRaw());
    const svc = createAddressService({ normalize });
    await expect(svc.normalize('X')).rejects.toThrow('boom');
    await expect(svc.normalize('X')).resolves.toMatchObject({ pref: '東京都' });
    expect(normalize).toHaveBeenCalledTimes(2);
  });
  it('並列失敗: 全呼び出し元が同じ rejection を受け normalize は 1 回だけ呼ばれる', async () => {
    const err = new Error('network failure');
    const normalize = vi.fn().mockRejectedValue(err);
    const svc = createAddressService({ normalize });
    const results = await Promise.allSettled([
      svc.normalize('Y'),
      svc.normalize('Y'),
      svc.normalize('Y'),
    ]);
    for (const r of results) {
      expect(r.status).toBe('rejected');
      expect((r as PromiseRejectedResult).reason).toBe(err);
    }
    expect(normalize).toHaveBeenCalledTimes(1);
  });
  it('失敗後の再試行が成功すると、その後はキャッシュを返す', async () => {
    const normalize = vi.fn()
      .mockRejectedValueOnce(new Error('first fail'))
      .mockResolvedValue(mkRaw());
    const svc = createAddressService({ normalize });
    await expect(svc.normalize('Z')).rejects.toThrow('first fail');
    await svc.normalize('Z'); // 再試行: 成功
    await svc.normalize('Z'); // キャッシュから
    expect(normalize).toHaveBeenCalledTimes(2);
  });
});

// ============================================================================
// normalize — エラー伝播
// ============================================================================

describe('normalize — エラー伝播', () => {
  it('Error を投げる normalize → 同じインスタンスが再スローされる', async () => {
    const err = new Error('API down');
    const svc = createAddressService({ normalize: vi.fn().mockRejectedValue(err) });
    await expect(svc.normalize('東京')).rejects.toBe(err);
  });
  it('TypeError を投げる normalize → そのまま再スロー', async () => {
    const err = new TypeError('bad response');
    const svc = createAddressService({ normalize: vi.fn().mockRejectedValue(err) });
    await expect(svc.normalize('東京')).rejects.toBe(err);
  });
  it('非 Error 値を投げる normalize → そのまま再スロー', async () => {
    const svc = createAddressService({ normalize: vi.fn().mockRejectedValue('string error') });
    await expect(svc.normalize('東京')).rejects.toBe('string error');
  });
});
