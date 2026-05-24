/**
 * §11.4 セキュリティ境界テスト (Compass)
 *
 * Compass ビルドの renderer から、書き込み系・タブ永続化・OAuth 起点メソッドが
 * 到達不能であることを assert する。Explorer 用 preload が誤同梱された等の事故を
 * CI で即検出するための regression test。
 *
 * 前提: npm run build:compass 済み (apps/compass/out/main/index.js が存在する)
 */
import { test, expect } from '../fixtures/compass.js';

const WRITE_API_KEYS = [
  'createRecord', 'updateRecord', 'deleteRecord',
  'saveProfile', 'deleteProfile', 'saveSettings',
  'startOAuth', 'reauthForWrite', 'disconnect',
  'saveSoqlFile', 'openSoqlFile', 'saveTabs', 'loadTabs',
] as const;

test('Compass renderer は書き込み系 / OAuth 起点 / タブ永続化メソッドを露出しない', async ({ compassWindow }) => {
  for (const key of WRITE_API_KEYS) {
    const isUndefined = await compassWindow.evaluate(
      (k: string) => typeof (window as unknown as { sfx?: Record<string, unknown> }).sfx?.[k] === 'undefined',
      key,
    );
    expect(isUndefined, `Compass renderer に ${key} が露出している`).toBe(true);
  }
});

test('Compass renderer の window.sfx は object として露出している（preload 自体は走った）', async ({ compassWindow }) => {
  const type = await compassWindow.evaluate(
    () => typeof (window as unknown as { sfx?: unknown }).sfx,
  );
  expect(type).toBe('object');
});
