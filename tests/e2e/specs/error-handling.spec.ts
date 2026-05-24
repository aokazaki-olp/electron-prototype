/**
 * エラー表示の E2E テスト。
 * - IPC エラーが role=alert で UI に表示される
 * - 機密情報がエラーメッセージから漏れない (CODING_RULES §11.5)
 */
import { test, expect, setupTestState } from '../fixtures/electron.js';
import { MainPagePOM } from '../pages/MainPage.js';
import { makeProfile } from '../../fixtures/contract.js';

const PROFILE = makeProfile({ id: 'p1' });

test.describe('エラーハンドリング — SOQL クエリ', () => {
  test('queryError 設定 → 実行で role=alert が表示される', async ({ window }) => {
    await setupTestState(window, {
      profiles: [PROFILE],
      activeProfileId: PROFILE.id,
      sobjects: [],
      describe: {},
      tabs: {
        tabs: [{ id: 't1', name: 'q', soql: 'SELECT Bad FROM Account', fetchAll: false }],
        activeTabId: 't1',
      },
      queryError: 'INVALID_FIELD: Bad',
    });

    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.runQueryButton.dispatchEvent('click');

    await expect(window.getByRole('alert').filter({ hasText: 'INVALID_FIELD' })).toBeVisible({ timeout: 5_000 });
  });

  test('エラー回復: 失敗後に成功するクエリで alert が消える', async ({ window }) => {
    await setupTestState(window, {
      profiles: [PROFILE],
      activeProfileId: PROFILE.id,
      sobjects: [],
      describe: {},
      tabs: {
        tabs: [{ id: 't1', name: 'q', soql: 'SELECT Id FROM Account', fetchAll: false }],
        activeTabId: 't1',
      },
      queryError: '最初の失敗',
    });

    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.runQueryButton.dispatchEvent('click');
    await expect(window.getByRole('alert').filter({ hasText: '最初の失敗' })).toBeVisible({ timeout: 5_000 });

    // 成功するレスポンスに切り替えて再実行
    await window.evaluate(async () => {
      const setup = (window as unknown as { __testSetup__?: (d: unknown) => Promise<void> }).__testSetup__;
      if (setup) {
        await setup({
          queryError: null,
          queryResult: { totalSize: 1, done: true, records: [{ Id: 'ok' }], fetchedCount: 1 },
        });
      }
    });
    // setupTestState は reload するが、ここでは部分更新のみで reload しない
    await main.runQueryButton.dispatchEvent('click');
    await expect(window.locator('text=/1件取得/')).toBeVisible({ timeout: 5_000 });
    await expect(window.getByRole('alert').filter({ hasText: '最初の失敗' })).not.toBeVisible({ timeout: 3_000 });
  });
});

test.describe('エラーハンドリング — IPC 経由のエラー内容', () => {
  test('エラーメッセージにスタックトレースが含まれない (§11.5)', async ({ window }) => {
    await setupTestState(window, {
      profiles: [PROFILE],
      activeProfileId: PROFILE.id,
      sobjects: [],
      describe: {},
      tabs: {
        tabs: [{ id: 't1', name: 'q', soql: 'SELECT Id FROM X', fetchAll: false }],
        activeTabId: 't1',
      },
      queryError: 'simple message',
    });

    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.runQueryButton.dispatchEvent('click');

    const alertText = await window.getByRole('alert').textContent({ timeout: 5_000 });
    expect(alertText).toContain('simple message');
    // ファイルパス・行番号・"at " 等の stack 特徴が混入していないこと
    expect(alertText).not.toMatch(/\bat\s+\w+.*\.ts:\d+/);
    expect(alertText).not.toMatch(/node_modules/);
  });
});
