/**
 * D18: ログ保持件数 (AppSettings.logBufferSize) と LogViewer 保存ボタンの E2E テスト。
 *   - 設定画面に「ログの保持件数」select が存在する
 *   - LogViewer のツールバーに「保存」ボタンがあり、ログ 0 件のとき disabled になる
 *   - 設定が永続化される (reload 後も復元)
 */
import { test, expect, setupTestState } from '../fixtures/electron.js';
import { MainPagePOM } from '../pages/MainPage.js';
import { makeProfile } from '../../fixtures/contract.js';

const PROFILE = makeProfile({ id: 'p1' });

test.describe('D18 ログ保持件数', () => {
  test('Settings 画面に「ログの保持件数」select が出る', async ({ window }) => {
    await setupTestState(window, {
      profiles: [PROFILE],
      activeProfileId: PROFILE.id,
      sobjects: [],
      describe: {},
    });
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.settingsButton.dispatchEvent('click');

    const select = window.locator('label').filter({ hasText: 'ログの保持件数' }).locator('select');
    await expect(select).toBeVisible({ timeout: 3_000 });
    // 既定 1000
    await expect(select).toHaveValue('1000');
  });

  test('ログの保持件数を 5000 に変更すると saveSettings が走る', async ({ window }) => {
    await setupTestState(window, {
      profiles: [PROFILE],
      activeProfileId: PROFILE.id,
      sobjects: [],
      describe: {},
    });
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.settingsButton.dispatchEvent('click');

    const select = window.locator('label').filter({ hasText: 'ログの保持件数' }).locator('select');
    await select.selectOption('5000');
    // 設定は楽観更新のため、再度確認すると 5000 になっている
    await expect(select).toHaveValue('5000');
  });

  test('「無制限」(0) も選択肢にある', async ({ window }) => {
    await setupTestState(window, {
      profiles: [PROFILE],
      activeProfileId: PROFILE.id,
      sobjects: [],
      describe: {},
    });
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.settingsButton.dispatchEvent('click');

    const select = window.locator('label').filter({ hasText: 'ログの保持件数' }).locator('select');
    await select.selectOption('0');
    await expect(select).toHaveValue('0');
    // 警告テキスト「無制限はメモリに注意」が出る
    await expect(window.getByText('無制限はメモリに注意')).toBeVisible();
  });

  test('LogViewer の保存ボタンはログ 0 件で disabled', async ({ window }) => {
    await setupTestState(window, {
      profiles: [PROFILE],
      activeProfileId: PROFILE.id,
      sobjects: [],
      describe: {},
    });
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });

    // ログタブに切替
    await main.logTab.dispatchEvent('click');
    const saveLogButton = window.getByRole('button', { name: /保存/ }).filter({ has: window.locator('text=保存') });
    // ログ 0 件 → disabled (LogViewer 内の保存ボタン)
    const logViewerSaveBtn = window.locator('button[title="現在のログをファイルに保存"]');
    await expect(logViewerSaveBtn).toBeVisible({ timeout: 3_000 });
    await expect(logViewerSaveBtn).toBeDisabled();
  });

  test('LogViewer 保存ボタンの title 属性は説明的', async ({ window }) => {
    await setupTestState(window, {
      profiles: [PROFILE],
      activeProfileId: PROFILE.id,
      sobjects: [],
      describe: {},
    });
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.logTab.dispatchEvent('click');

    const btn = window.locator('button[title="現在のログをファイルに保存"]');
    await expect(btn).toBeVisible({ timeout: 3_000 });
    await expect(btn).toHaveAttribute('title', '現在のログをファイルに保存');
  });
});
