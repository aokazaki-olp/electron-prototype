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
import { EXPECTED_API_KEYS } from '@app/ipc-contract';

// Explorer にあって Compass にない = Compass で到達不能であるべきキー集合。
// ipc-contract から差集合で導出することで、新しい書き込み系 API を Explorer に追加した際の
// テスト追従漏れ (= regress 検出穴) を構造的に防ぐ。
const compassKeys = new Set<string>(EXPECTED_API_KEYS.compass);
const EXPLORER_ONLY_KEYS = EXPECTED_API_KEYS.explorer.filter(k => !compassKeys.has(k));

test('Compass renderer は Explorer 専用 API (書き込み・OAuth起点・タブ永続化・列幅・bulk・ログ保存) を露出しない', async ({ compassWindow }) => {
  for (const key of EXPLORER_ONLY_KEYS) {
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
