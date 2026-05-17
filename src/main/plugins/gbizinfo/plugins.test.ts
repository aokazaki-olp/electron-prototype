/**
 * plugins.test.ts
 * @description 18 プラグイン全部について、生成された URL とクエリの組み立てを検証する。
 *              テスト用の Transport を差し込んで GBizInfoApiClient → v2BaseUrl → 各プラグインの経路を確認する。
 */

import { describe, it, expect, vi } from 'vitest';
import { createGBizInfoService } from '../../GBizInfoService.js';
import type { Transport, RawResponse } from '../../../libs/index.js';
import { HttpError } from '../../../libs/index.js';

const mkResponse = (overrides: Partial<RawResponse> = {}): RawResponse => ({
  status: 200,
  headers: {},
  body: { ok: true },
  text: '{"ok":true}',
  ...overrides,
});

const mkClient = () => {
  const fetch = vi.fn<Transport['fetch']>().mockResolvedValue(mkResponse());
  // GBizInfoApiClient.create は transport を受け取らないので、token + 自前で transport を差し替えるパターンが必要。
  // → ライブラリ API を見ると create(token, { transport }) で渡せる。ただし createGBizInfoService は token しか取らない。
  // 簡易化のため、GBizInfoService の上で v2BaseUrl を回避できないので、テストでは GBizInfoApiClient を直接組み立てない代わりに、
  // global fetch をモックする路線でなく、libs を経由する。ここでは createGBizInfoService の transport 差し替えは不要、
  // 代わりに「ライブラリ層 → withV2BaseUrl → プラグイン」の組み立てを別途検証する。
  return { fetch };
};

// プラグイン直接呼び出しテスト: GBizInfoApiClient を transport 差し替えで作り、各プラグインを use() する
import { GBizInfoApiClient } from '../../../libs/index.js';
import * as plugins from './index.js';

const buildTestService = () => {
  const fetch = vi.fn<Transport['fetch']>().mockResolvedValue(mkResponse());
  const transport: Transport = { fetch };
  const base = GBizInfoApiClient.create('test-token', { transport });
  return {
    fetch,
    base,
  };
};

describe('gBizINFO plugins — URL composition', () => {
  it('searchHojin: GET v2 base with query params', async () => {
    const { fetch, base } = buildTestService();
    const svc = base.use(plugins.searchHojin);
    await svc.searchHojin({ name: 'トヨタ', page: 1 });
    const url = fetch.mock.calls[0]![0];
    expect(url).toContain('https://api.info.gbiz.go.jp/hojin/v2/');
    expect(url).toContain('name=%E3%83%88%E3%83%A8%E3%82%BF');
    expect(url).toContain('page=1');
  });

  it('searchHojin: undefined / 空文字パラメータはクエリに含めない', async () => {
    const { fetch, base } = buildTestService();
    const svc = base.use(plugins.searchHojin);
    await svc.searchHojin({ name: 'X', corporate_number: undefined, prefecture: undefined });
    const url = fetch.mock.calls[0]![0];
    expect(url).toContain('name=X');
    expect(url).not.toContain('corporate_number');
    expect(url).not.toContain('prefecture');
  });

  it('getHojin: path parameter エンコード', async () => {
    const { fetch, base } = buildTestService();
    const svc = base.use(plugins.getHojin);
    await svc.getHojin({ corporate_number: '1234567890123' });
    expect(fetch.mock.calls[0]![0]).toBe('https://api.info.gbiz.go.jp/hojin/v2/1234567890123');
  });

  const subResources: Array<[keyof typeof plugins, string, boolean]> = [
    ['getCertification', 'certification', true],
    ['getCommendation', 'commendation', true],
    ['getCorporation', 'corporation_info', false],
    ['getFinance', 'finance', false],
    ['getPatent', 'patent', true],
    ['getProcurement', 'procurement', true],
    ['getSubsidy', 'subsidy', true],
    ['getWorkplace', 'workplace', false],
  ];

  it.each(subResources)('%s: /<num>/%s への GET', async (name, path, paging) => {
    const { fetch, base } = buildTestService();
    const plugin = plugins[name];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = base.use(plugin as any) as unknown as Record<string, (p: unknown) => Promise<unknown>>;
    const params = paging
      ? { corporate_number: '1234567890123', page: 2 }
      : { corporate_number: '1234567890123' };
    await svc[name]!(params);
    const url = fetch.mock.calls[0]![0];
    expect(url).toContain(`/hojin/v2/1234567890123/${path}`);
    if (paging) {
      expect(url).toContain('page=2');
    }
  });

  const updateInfo: Array<[keyof typeof plugins, string]> = [
    ['getUpdateInfo', '/updateInfo'],
    ['getUpdateInfoCertification', '/updateInfo/certification'],
    ['getUpdateInfoCommendation', '/updateInfo/commendation'],
    ['getUpdateInfoCorporation', '/updateInfo/corporation_info'],
    ['getUpdateInfoFinance', '/updateInfo/finance'],
    ['getUpdateInfoPatent', '/updateInfo/patent'],
    ['getUpdateInfoProcurement', '/updateInfo/procurement'],
    ['getUpdateInfoSubsidy', '/updateInfo/subsidy'],
    ['getUpdateInfoWorkplace', '/updateInfo/workplace'],
  ];

  it.each(updateInfo)('%s: %s への GET (from/to/page)', async (name, path) => {
    const { fetch, base } = buildTestService();
    const plugin = plugins[name];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = base.use(plugin as any) as unknown as Record<string, (p: unknown) => Promise<unknown>>;
    await svc[name]!({ from: '2024-01-01', to: '2024-01-31', page: 3 });
    const url = fetch.mock.calls[0]![0];
    expect(url).toContain(`/hojin/v2${path}`);
    expect(url).toContain('from=2024-01-01');
    expect(url).toContain('to=2024-01-31');
    expect(url).toContain('page=3');
  });

  it('認証ヘッダ X-hojinInfo-api-token が乗る', async () => {
    const { fetch, base } = buildTestService();
    const svc = base.use(plugins.getHojin);
    await svc.getHojin({ corporate_number: '1234567890123' });
    const opts = fetch.mock.calls[0]![1];
    expect(opts?.headers?.['X-hojinInfo-api-token']).toBe('test-token');
  });

  it('HttpError は伝播する（plain 変換はサービス層の責任ではない）', async () => {
    const fetch = vi.fn<Transport['fetch']>().mockRejectedValue(
      new HttpError('not found', 404, { error: 'x' }),
    );
    const base = GBizInfoApiClient.create('t', { transport: { fetch } });
    const svc = base.use(plugins.getHojin);
    await expect(svc.getHojin({ corporate_number: '1' })).rejects.toBeInstanceOf(HttpError);
  });
});

describe('createGBizInfoService', () => {
  it('全 18 メソッドが生えている', () => {
    const svc = createGBizInfoService('t');
    const expected = [
      'searchHojin', 'getHojin', 'getCertification', 'getCommendation', 'getCorporation',
      'getFinance', 'getPatent', 'getProcurement', 'getSubsidy', 'getWorkplace',
      'getUpdateInfo', 'getUpdateInfoCertification', 'getUpdateInfoCommendation',
      'getUpdateInfoCorporation', 'getUpdateInfoFinance', 'getUpdateInfoPatent',
      'getUpdateInfoProcurement', 'getUpdateInfoSubsidy', 'getUpdateInfoWorkplace',
    ];
    for (const name of expected) {
      expect(typeof (svc as unknown as Record<string, unknown>)[name]).toBe('function');
    }
  });

  it('空 token は TypeError', () => {
    expect(() => createGBizInfoService('')).toThrow(TypeError);
  });
});
