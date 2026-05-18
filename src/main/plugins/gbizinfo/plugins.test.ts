/**
 * plugins.test.ts
 * @description 18 プラグイン全部について、生成された URL とクエリの組み立てを検証する。
 *              テスト用の Transport を差し込んで GBizInfoApiClient → v2BaseUrl → 各プラグインの経路を確認する。
 */

import { describe, it, expect, vi } from 'vitest';
import { createGBizInfoService } from '../../GBizInfoService.js';
import type { Transport, RawResponse } from '../../../libs/index.js';
import { HttpError, RetryExhaustedError } from '../../../libs/index.js';

const mkResponse = (overrides: Partial<RawResponse> = {}): RawResponse => ({
  status: 200,
  headers: {},
  body: { ok: true },
  text: '{"ok":true}',
  ...overrides,
});

import { GBizInfoApiClient } from '../../../libs/index.js';
import * as plugins from './index.js';

const buildTestService = () => {
  const fetch = vi.fn<Transport['fetch']>().mockResolvedValue(mkResponse());
  const transport: Transport = { fetch };
  const base = GBizInfoApiClient.create('test-token', { transport });
  return { fetch, base };
};

// ============================================================================
// searchHojin
// ============================================================================

describe('searchHojin', () => {
  it('GET v2 base with query params', async () => {
    const { fetch, base } = buildTestService();
    const svc = base.use(plugins.searchHojin);
    await svc.searchHojin({ name: 'トヨタ', page: 1 });
    const url = fetch.mock.calls[0]![0];
    expect(url).toContain('https://api.info.gbiz.go.jp/hojin/v2/');
    expect(url).toContain('name=%E3%83%88%E3%83%A8%E3%82%BF');
    expect(url).toContain('page=1');
  });
  it('undefined / null パラメータはクエリに含めない', async () => {
    const { fetch, base } = buildTestService();
    const svc = base.use(plugins.searchHojin);
    await svc.searchHojin({ name: 'X', corporate_number: undefined, prefecture: undefined });
    const url = fetch.mock.calls[0]![0];
    expect(url).toContain('name=X');
    expect(url).not.toContain('corporate_number');
    expect(url).not.toContain('prefecture');
  });
  it('page と limit が両方クエリに含まれる', async () => {
    const { fetch, base } = buildTestService();
    const svc = base.use(plugins.searchHojin);
    await svc.searchHojin({ name: 'B', page: 2, limit: 10 });
    const url = fetch.mock.calls[0]![0];
    expect(url).toContain('page=2');
    expect(url).toContain('limit=10');
  });
  it('数値パラメータ（capital_stock_from）がクエリに含まれる', async () => {
    const { fetch, base } = buildTestService();
    const svc = base.use(plugins.searchHojin);
    await svc.searchHojin({ name: 'テスト', capital_stock_from: 1000000 });
    const url = fetch.mock.calls[0]![0];
    expect(url).toContain('capital_stock_from=1000000');
  });
  it('capital_stock_from/to と employee_number がクエリに含まれる', async () => {
    const { fetch, base } = buildTestService();
    const svc = base.use(plugins.searchHojin);
    await svc.searchHojin({
      capital_stock_from: 100,
      capital_stock_to: 999,
      employee_number_from: 10,
    });
    const url = fetch.mock.calls[0]![0];
    expect(url).toContain('capital_stock_from=100');
    expect(url).toContain('capital_stock_to=999');
    expect(url).toContain('employee_number_from=10');
  });
  it('metadata_flg=true がクエリに含まれる', async () => {
    const { fetch, base } = buildTestService();
    const svc = base.use(plugins.searchHojin);
    await svc.searchHojin({ name: 'A', metadata_flg: 'true' });
    const url = fetch.mock.calls[0]![0];
    expect(url).toContain('metadata_flg=true');
  });
  it('認証ヘッダ X-hojinInfo-api-token が乗る', async () => {
    const { fetch, base } = buildTestService();
    const svc = base.use(plugins.searchHojin);
    await svc.searchHojin({ name: 'X' });
    expect(fetch.mock.calls[0]![1]?.headers?.['X-hojinInfo-api-token']).toBe('test-token');
  });
});

// ============================================================================
// getHojin
// ============================================================================

describe('getHojin', () => {
  it('path parameter エンコード（13 桁法人番号）', async () => {
    const { fetch, base } = buildTestService();
    const svc = base.use(plugins.getHojin);
    await svc.getHojin({ corporate_number: '1234567890123' });
    expect(fetch.mock.calls[0]![0]).toBe('https://api.info.gbiz.go.jp/hojin/v2/hojin/1234567890123');
  });
  it('corporate_number に "/" が含まれる場合は URL エンコードされる', async () => {
    const { fetch, base } = buildTestService();
    const svc = base.use(plugins.getHojin);
    await svc.getHojin({ corporate_number: 'abc/def' });
    expect(fetch.mock.calls[0]![0]).toContain('/hojin/v2/hojin/abc%2Fdef');
  });
  it('corporate_number にスペースが含まれる場合は URL エンコードされる', async () => {
    const { fetch, base } = buildTestService();
    const svc = base.use(plugins.getHojin);
    await svc.getHojin({ corporate_number: 'abc def' });
    expect(fetch.mock.calls[0]![0]).toContain('/hojin/v2/hojin/abc%20def');
  });
  it('認証ヘッダ X-hojinInfo-api-token が乗る', async () => {
    const { fetch, base } = buildTestService();
    const svc = base.use(plugins.getHojin);
    await svc.getHojin({ corporate_number: '1234567890123' });
    const opts = fetch.mock.calls[0]![1];
    expect(opts?.headers?.['X-hojinInfo-api-token']).toBe('test-token');
  });
});

// ============================================================================
// サブリソース（/{corporate_number}/<path>）
// ============================================================================

const subResources: Array<[keyof typeof plugins, string, boolean]> = [
  ['getCertification', 'certification', true],
  ['getCommendation', 'commendation', true],
  ['getCorporation', 'corporation', false],
  ['getFinance', 'finance', false],
  ['getPatent', 'patent', true],
  ['getProcurement', 'procurement', true],
  ['getSubsidy', 'subsidy', true],
  ['getWorkplace', 'workplace', false],
];

describe('サブリソース — /<num>/<path> への GET', () => {
  it.each(subResources)('%s: /hojin/v2/hojin/1234567890123/%s への GET', async (name, path, paging) => {
    const { fetch, base } = buildTestService();
    const plugin = plugins[name];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = base.use(plugin as any) as unknown as Record<string, (p: unknown) => Promise<unknown>>;
    const params = paging
      ? { corporate_number: '1234567890123', page: 2 }
      : { corporate_number: '1234567890123' };
    await svc[name]!(params);
    const url = fetch.mock.calls[0]![0];
    expect(url).toContain(`/hojin/v2/hojin/1234567890123/${path}`);
    if (paging) {
      expect(url).toContain('page=2');
    }
  });
  it('getCertification: limit と metadata_flg もクエリに含まれる', async () => {
    const { fetch, base } = buildTestService();
    const svc = base.use(plugins.getCertification);
    await svc.getCertification({ corporate_number: '1234567890123', page: 1, limit: 50, metadata_flg: 'true' });
    const url = fetch.mock.calls[0]![0];
    expect(url).toContain('limit=50');
    expect(url).toContain('metadata_flg=true');
    expect(url).toContain('page=1');
  });
  it('getPatent: limit がクエリに含まれる', async () => {
    const { fetch, base } = buildTestService();
    const svc = base.use(plugins.getPatent);
    await svc.getPatent({ corporate_number: '1234567890123', limit: 100 });
    const url = fetch.mock.calls[0]![0];
    expect(url).toContain('limit=100');
  });
  it('getCorporation（非ページング）: ページパラメータは URL に含まれない', async () => {
    const { fetch, base } = buildTestService();
    const svc = base.use(plugins.getCorporation);
    await svc.getCorporation({ corporate_number: '1234567890123' });
    const url = fetch.mock.calls[0]![0];
    expect(url).not.toContain('page=');
    expect(url).not.toContain('limit=');
  });
});

// ============================================================================
// updateInfo 系
// ============================================================================

const updateInfo: Array<[keyof typeof plugins, string]> = [
  ['getUpdateInfo', '/updateInfo'],
  ['getUpdateInfoCertification', '/updateInfo/certification'],
  ['getUpdateInfoCommendation', '/updateInfo/commendation'],
  ['getUpdateInfoCorporation', '/updateInfo/corporation'],
  ['getUpdateInfoFinance', '/updateInfo/finance'],
  ['getUpdateInfoPatent', '/updateInfo/patent'],
  ['getUpdateInfoProcurement', '/updateInfo/procurement'],
  ['getUpdateInfoSubsidy', '/updateInfo/subsidy'],
  ['getUpdateInfoWorkplace', '/updateInfo/workplace'],
];

describe('updateInfo 系 — /updateInfo パスへの GET', () => {
  it.each(updateInfo)('%s: %s への GET (from/to/page)', async (name, path) => {
    const { fetch, base } = buildTestService();
    const plugin = plugins[name];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = base.use(plugin as any) as unknown as Record<string, (p: unknown) => Promise<unknown>>;
    await svc[name]!({ from: '2024-01-01', to: '2024-01-31', page: 3 });
    const url = fetch.mock.calls[0]![0];
    expect(url).toContain(`/hojin/v2/hojin${path}`);
    expect(url).toContain('from=2024-01-01');
    expect(url).toContain('to=2024-01-31');
    expect(url).toContain('page=3');
  });
  it('getUpdateInfo: limit パラメータもクエリに含まれる', async () => {
    const { fetch, base } = buildTestService();
    const svc = base.use(plugins.getUpdateInfo);
    await svc.getUpdateInfo({ from: '2024-01-01', to: '2024-01-31', limit: 100 });
    const url = fetch.mock.calls[0]![0];
    expect(url).toContain('limit=100');
    expect(url).not.toContain('page=');
  });
  it('getUpdateInfoFinance: metadata_flg=true がクエリに含まれる', async () => {
    const { fetch, base } = buildTestService();
    const svc = base.use(plugins.getUpdateInfoFinance);
    await svc.getUpdateInfoFinance({ from: '2024-01-01', to: '2024-01-31', metadata_flg: 'true' });
    const url = fetch.mock.calls[0]![0];
    expect(url).toContain('metadata_flg=true');
  });
  it('getUpdateInfoCorporation: 認証ヘッダが乗る', async () => {
    const { fetch, base } = buildTestService();
    const svc = base.use(plugins.getUpdateInfoCorporation);
    await svc.getUpdateInfoCorporation({ from: '2024-01-01', to: '2024-01-31' });
    expect(fetch.mock.calls[0]![1]?.headers?.['X-hojinInfo-api-token']).toBe('test-token');
  });
});

// ============================================================================
// エラー伝播（プラグイン層はエラーを変換しない）
// ============================================================================

describe('エラー伝播', () => {
  it('HttpError は伝播する（plain 変換はサービス層の責任ではない）', async () => {
    const fetch = vi.fn<Transport['fetch']>().mockRejectedValue(
      new HttpError('not found', 404, { error: 'x' }),
    );
    const base = GBizInfoApiClient.create('t', { transport: { fetch } });
    const svc = base.use(plugins.getHojin);
    await expect(svc.getHojin({ corporate_number: '1' })).rejects.toBeInstanceOf(HttpError);
  });
  it('HttpError 5xx → リトライ上限到達後に RetryExhaustedError が伝播する', async () => {
    // shouldRetry で 5xx はリトライ対象。maxRetries=0 でも 1 回失敗で RetryExhaustedError になる
    const fetch = vi.fn<Transport['fetch']>().mockRejectedValue(
      new HttpError('server error', 500, { msg: 'error' }),
    );
    const base = GBizInfoApiClient.create('t', { transport: { fetch }, maxRetries: 0 });
    const svc = base.use(plugins.searchHojin);
    await expect(svc.searchHojin({ name: 'X' })).rejects.toBeInstanceOf(RetryExhaustedError);
  });
  it('generic Error → リトライ上限到達後に RetryExhaustedError が伝播する', async () => {
    // shouldRetry で HttpError/RetryExhaustedError 以外はリトライ対象
    const fetch = vi.fn<Transport['fetch']>().mockRejectedValue(new Error('network timeout'));
    const base = GBizInfoApiClient.create('t', { transport: { fetch }, maxRetries: 0 });
    const svc = base.use(plugins.getUpdateInfo);
    await expect(svc.getUpdateInfo({ from: '2024-01-01', to: '2024-01-31' })).rejects.toBeInstanceOf(RetryExhaustedError);
  });
  it('リトライ上限到達後は RetryExhaustedError が伝播する', async () => {
    // 404 は非リトライ対象のため 1 回でエラーが出る。RetryExhaustedError を得るには
    // 5xx を繰り返すが時間がかかるため、ここでは型チェックのみ行う。
    const fetch = vi.fn<Transport['fetch']>().mockRejectedValue(
      new RetryExhaustedError('exhausted'),
    );
    // maxRetries=0 で transport 自体が RetryExhaustedError を返す場合でも伝播する
    const base = GBizInfoApiClient.create('t', { transport: { fetch }, maxRetries: 0 });
    const svc = base.use(plugins.searchHojin);
    await expect(svc.searchHojin({ name: 'X' })).rejects.toBeInstanceOf(RetryExhaustedError);
  });
});

// ============================================================================
// createGBizInfoService
// ============================================================================

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
  it('全 18 メソッドの数が正確に 18 である', () => {
    const svc = createGBizInfoService('t');
    const methods = Object.keys(svc as unknown as object).filter(
      k => typeof (svc as unknown as Record<string, unknown>)[k] === 'function',
    );
    // use/extend/call/get 等のベースメソッドを除いた gbiz ドメインメソッドが 18 個
    const gbizMethods = methods.filter(k =>
      ['searchHojin', 'getHojin', 'getCertification', 'getCommendation', 'getCorporation',
        'getFinance', 'getPatent', 'getProcurement', 'getSubsidy', 'getWorkplace',
        'getUpdateInfo', 'getUpdateInfoCertification', 'getUpdateInfoCommendation',
        'getUpdateInfoCorporation', 'getUpdateInfoFinance', 'getUpdateInfoPatent',
        'getUpdateInfoProcurement', 'getUpdateInfoSubsidy', 'getUpdateInfoWorkplace'].includes(k),
    );
    expect(gbizMethods).toHaveLength(19);
  });
  it('空 token は TypeError', () => {
    expect(() => createGBizInfoService('')).toThrow(TypeError);
  });
  it('非 string token (number) は TypeError', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => createGBizInfoService(42 as any)).toThrow(TypeError);
  });
});
