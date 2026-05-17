import { describe, it, expect, vi } from 'vitest';
import { createAddressService } from './AddressService.js';

const mkRaw = (lat = 35.6, lng = 139.7, level = 3) => ({
  pref: '東京都',
  city: '千代田区',
  town: '丸の内一丁目',
  addr: '1-1',
  other: '',
  level,
  point: { lat, lng, level },
});

describe('AddressService', () => {
  it('正常な住所を normalize して NjaResult を返す', async () => {
    const normalize = vi.fn().mockResolvedValue(mkRaw());
    const svc = createAddressService({ normalize });
    const r = await svc.normalize('東京都千代田区丸の内1-1');
    expect(r.pref).toBe('東京都');
    expect(r.point).toEqual({ lat: 35.6, lng: 139.7, level: 3 });
  });

  it('level 0 の結果もそのまま返す', async () => {
    const normalize = vi.fn().mockResolvedValue({ pref: '', city: '', town: '', addr: '', other: 'foo', level: 0 });
    const svc = createAddressService({ normalize });
    const r = await svc.normalize('わからない');
    expect(r.level).toBe(0);
    expect(r.point).toBeUndefined();
  });

  it('空文字は TypeError', () => {
    const svc = createAddressService({ normalize: vi.fn() });
    expect(() => svc.normalize('')).toThrow(TypeError);
  });

  it('キャッシュヒット時は normalize を再呼び出ししない', async () => {
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

  it('失敗はキャッシュしない（次回再試行できる）', async () => {
    const normalize = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(mkRaw());
    const svc = createAddressService({ normalize });
    await expect(svc.normalize('X')).rejects.toThrow('boom');
    await expect(svc.normalize('X')).resolves.toMatchObject({ pref: '東京都' });
    expect(normalize).toHaveBeenCalledTimes(2);
  });

  it('deps.normalize が関数でなければ TypeError', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => createAddressService({ normalize: null as any })).toThrow(TypeError);
  });
});
