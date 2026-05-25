/**
 * buildInfo.ts のユニットテスト。
 *
 * BUILD_TARGET 環境変数による定数解決と OAUTH_CALLBACK_URL の合成、
 * BUILD Union 型 narrow による switch 網羅性が壊れていないことを検証する。
 *
 * buildInfo はモジュール load 時に BUILD を評価するため、
 * vi.resetModules + vi.stubEnv で各ケースを独立に検証する。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe('BUILD 解決', () => {
  it('BUILD_TARGET 未設定 → explorer', async () => {
    vi.stubEnv('BUILD_TARGET', '');
    const { BUILD } = await import('../../../packages/main-core/src/buildInfo.js');
    expect(BUILD.target).toBe('explorer');
    expect(BUILD.appId).toBe('com.example.salesforce-explorer');
    expect(BUILD.productName).toBe('Salesforce Explorer');
    expect(BUILD.urlScheme).toBe('salesforce-explorer');
    expect(BUILD.storeName).toBe('salesforce-explorer');
  });

  it('BUILD_TARGET=compass → compass', async () => {
    vi.stubEnv('BUILD_TARGET', 'compass');
    const { BUILD } = await import('../../../packages/main-core/src/buildInfo.js');
    expect(BUILD.target).toBe('compass');
    expect(BUILD.appId).toBe('com.example.salesforce-compass');
    expect(BUILD.urlScheme).toBe('salesforce-compass');
  });

  it('BUILD_TARGET=explorer → explorer', async () => {
    vi.stubEnv('BUILD_TARGET', 'explorer');
    const { BUILD } = await import('../../../packages/main-core/src/buildInfo.js');
    expect(BUILD.target).toBe('explorer');
  });

  it('BUILD_TARGET に未知の値 → explorer フォールバック', async () => {
    vi.stubEnv('BUILD_TARGET', 'totally-unknown');
    const { BUILD } = await import('../../../packages/main-core/src/buildInfo.js');
    expect(BUILD.target).toBe('explorer');
  });

  it('BUILD_TARGET= (空文字) → explorer', async () => {
    vi.stubEnv('BUILD_TARGET', '');
    const { BUILD } = await import('../../../packages/main-core/src/buildInfo.js');
    expect(BUILD.target).toBe('explorer');
  });

  it('BUILD_TARGET 大文字 (COMPASS) → 厳密一致でないため explorer フォールバック', async () => {
    vi.stubEnv('BUILD_TARGET', 'COMPASS');
    const { BUILD } = await import('../../../packages/main-core/src/buildInfo.js');
    expect(BUILD.target).toBe('explorer');
  });
});

describe('OAUTH_CALLBACK_URL', () => {
  it('Explorer ビルドでは salesforce-explorer://callback', async () => {
    vi.stubEnv('BUILD_TARGET', 'explorer');
    const { OAUTH_CALLBACK_URL } = await import('../../../packages/main-core/src/buildInfo.js');
    expect(OAUTH_CALLBACK_URL).toBe('salesforce-explorer://callback');
  });

  it('Compass ビルドでは salesforce-compass://callback', async () => {
    vi.stubEnv('BUILD_TARGET', 'compass');
    const { OAUTH_CALLBACK_URL } = await import('../../../packages/main-core/src/buildInfo.js');
    expect(OAUTH_CALLBACK_URL).toBe('salesforce-compass://callback');
  });
});

describe('BUILD_INFO_BY_TARGET 表', () => {
  it('explorer と compass が定義されている', async () => {
    const { BUILD_INFO_BY_TARGET } = await import('../../../packages/main-core/src/buildInfo.js');
    expect(Object.keys(BUILD_INFO_BY_TARGET).sort()).toEqual(['compass', 'explorer']);
  });

  it('appId は両ターゲットで異なる (OS で別アプリとして扱われる)', async () => {
    const { BUILD_INFO_BY_TARGET } = await import('../../../packages/main-core/src/buildInfo.js');
    expect(BUILD_INFO_BY_TARGET.explorer.appId).not.toBe(BUILD_INFO_BY_TARGET.compass.appId);
  });

  it('urlScheme は両ターゲットで異なる (OAuth コールバックが混線しない)', async () => {
    const { BUILD_INFO_BY_TARGET } = await import('../../../packages/main-core/src/buildInfo.js');
    expect(BUILD_INFO_BY_TARGET.explorer.urlScheme).not.toBe(BUILD_INFO_BY_TARGET.compass.urlScheme);
  });

  it('storeName は両ターゲットで異なる (electron-store の混線防止)', async () => {
    const { BUILD_INFO_BY_TARGET } = await import('../../../packages/main-core/src/buildInfo.js');
    expect(BUILD_INFO_BY_TARGET.explorer.storeName).not.toBe(BUILD_INFO_BY_TARGET.compass.storeName);
  });

  it('各 BuildInfo の target フィールドが識別子と一致', async () => {
    const { BUILD_INFO_BY_TARGET } = await import('../../../packages/main-core/src/buildInfo.js');
    expect(BUILD_INFO_BY_TARGET.explorer.target).toBe('explorer');
    expect(BUILD_INFO_BY_TARGET.compass.target).toBe('compass');
  });
});
