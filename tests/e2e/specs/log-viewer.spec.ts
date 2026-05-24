/**
 * LogViewer の E2E テスト。
 * - ログタブに切替
 * - 検索フィルタ
 * - レベルフィルタ
 * - クリア
 * - aria-pressed
 */
import { test, expect, setupTestState } from '../fixtures/electron.js';
import { MainPagePOM } from '../pages/MainPage.js';
import { makeProfile } from '../../fixtures/contract.js';

const PROFILE = makeProfile({ id: 'p1' });

test.describe('LogViewer', () => {
  test.beforeEach(async ({ window }) => {
    await setupTestState(window, {
      profiles: [PROFILE],
      activeProfileId: PROFILE.id,
      sobjects: [],
      describe: {},
    });
  });

  test('ログタブに切り替えると LogViewer が表示される', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.logTab.dispatchEvent('click');

    await expect(main.logSearchInput).toBeVisible({ timeout: 3_000 });
    await expect(main.logClearButton).toBeVisible();
  });

  test('レベルフィルタは初期で aria-pressed=true', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.logTab.dispatchEvent('click');

    for (const lvl of ['debug', 'info', 'warn', 'error'] as const) {
      await expect(main.getLogLevelButton(lvl)).toHaveAttribute('aria-pressed', 'true');
    }
  });

  test('レベルフィルタをトグルすると aria-pressed が切り替わる', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.logTab.dispatchEvent('click');

    await main.getLogLevelButton('debug').dispatchEvent('click');
    await expect(main.getLogLevelButton('debug')).toHaveAttribute('aria-pressed', 'false');
    await expect(main.getLogLevelButton('info')).toHaveAttribute('aria-pressed', 'true');
  });

  test('クリアボタンでログが空になる (rendererLog 経由でログ追加 → クリア)', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.logTab.dispatchEvent('click');

    // renderer から log を追加（IPC RENDERER_LOG → main → store.appendLog 経由）
    await window.evaluate(() => {
      const sfx = (window as unknown as { sfx?: { rendererLog?: (l: string, t: string) => void } }).sfx;
      sfx?.rendererLog?.('info', 'e2e テストログ A');
      sfx?.rendererLog?.('warn', 'e2e テストログ B');
    });

    // ログが流れるまで少し待つ（IPC 往復）
    await expect(window.locator('text=e2e テストログ A')).toBeVisible({ timeout: 5_000 });

    // クリア
    await main.logClearButton.dispatchEvent('click');
    await expect(window.locator('text=e2e テストログ A')).not.toBeVisible({ timeout: 3_000 });
  });

  test('ログ検索フィールドに aria-label がある', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.logTab.dispatchEvent('click');

    await expect(main.logSearchInput).toBeVisible();
    // getByLabel が引けている時点で aria-label がついている
    await expect(main.logSearchInput).toHaveAttribute('aria-label', 'ログ検索');
  });
});
