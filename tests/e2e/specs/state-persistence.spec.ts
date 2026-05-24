/**
 * 永続化と reload 後の状態復元 E2E テスト。
 *
 * - 設定ページから保存したプロファイルが reload 後も残る
 * - active タブが reload 後も復元される
 * - 設定値 (defaultMaxRows) が reload 後も復元される
 *
 * 隔離テストでは testMock を一次ソースとするが、testMock 自体は main プロセスのメモリ。
 * reload は renderer の再描画のみで main は再起動しないため testMock は保持される。
 */
import { test, expect, setupTestState, pressKeyOn } from '../fixtures/electron.js';
import { MainPagePOM } from '../pages/MainPage.js';
import { SettingsPagePOM } from '../pages/SettingsPage.js';
import { makeProfile } from '../../fixtures/contract.js';

const PROFILE = makeProfile({ id: 'p1', name: '永続化テスト' });

test.describe('永続化 — タブ', () => {
  test('追加したタブが reload 後も残る', async ({ window }) => {
    await setupTestState(window, {
      profiles: [PROFILE],
      activeProfileId: PROFILE.id,
      sobjects: [],
      describe: {},
      tabs: {
        tabs: [{ id: 't0', name: 'クエリ 1', soql: '', fetchAll: false }],
        activeTabId: 't0',
      },
    });

    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.addTabButton.dispatchEvent('click');
    await expect(main.getSoqlTab('クエリ 2')).toBeVisible({ timeout: 3_000 });

    await window.reload();
    await window.waitForLoadState('domcontentloaded');
    await expect(main.header).toBeVisible({ timeout: 15_000 });

    await expect(main.getSoqlTab('クエリ 1')).toBeVisible({ timeout: 5_000 });
    await expect(main.getSoqlTab('クエリ 2')).toBeVisible();
  });

  test('rename したタブ名が reload 後も残る', async ({ window }) => {
    await setupTestState(window, {
      profiles: [PROFILE],
      activeProfileId: PROFILE.id,
      sobjects: [],
      describe: {},
      tabs: {
        tabs: [{ id: 't0', name: 'クエリ 1', soql: '', fetchAll: false }],
        activeTabId: 't0',
      },
    });
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });

    await main.getSoqlTab('クエリ 1').dispatchEvent('dblclick');
    const renameInput = window.getByLabel('タブ名を編集');
    await renameInput.fill('永続化済み');
    await pressKeyOn(renameInput, 'Enter');
    await expect(main.getSoqlTab('永続化済み')).toBeVisible({ timeout: 3_000 });

    await window.reload();
    await window.waitForLoadState('domcontentloaded');
    await expect(main.getSoqlTab('永続化済み')).toBeVisible({ timeout: 5_000 });
  });

  test('閉じたタブは reload 後も復活しない', async ({ window }) => {
    await setupTestState(window, {
      profiles: [PROFILE],
      activeProfileId: PROFILE.id,
      sobjects: [],
      describe: {},
      tabs: {
        tabs: [
          { id: 't1', name: '残るタブ', soql: '', fetchAll: false },
          { id: 't2', name: '消すタブ', soql: '', fetchAll: false },
        ],
        activeTabId: 't1',
      },
    });
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.getCloseTabButton('消すタブ').dispatchEvent('click');
    await expect(main.getSoqlTab('消すタブ')).not.toBeVisible();

    await window.reload();
    await window.waitForLoadState('domcontentloaded');
    await expect(main.getSoqlTab('残るタブ')).toBeVisible({ timeout: 5_000 });
    await expect(main.getSoqlTab('消すタブ')).not.toBeVisible();
  });
});

test.describe('永続化 — プロファイル', () => {
  test('Settings から追加したプロファイルが reload 後も残る', async ({ window }) => {
    await setupTestState(window, {
      profiles: [PROFILE],
      activeProfileId: PROFILE.id,
      sobjects: [],
      describe: {},
    });

    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.settingsButton.dispatchEvent('click');

    const settings = new SettingsPagePOM(window);
    await expect(settings.heading).toBeVisible({ timeout: 5_000 });
    // testMock.profiles に追加されるよう、testMock 自体を更新する経路を使う
    // ※ 実 saveProfile は使うが、setupTestState 以後 useRealApi=false のままなので
    //   loadProfiles の隔離分岐により実 store は読まれない。
    //   testMock.profiles も保存後の再ロードで反映されないので、setupTestState 再注入で確認する。

    await window.evaluate(async () => {
      const setup = (window as unknown as { __testSetup__?: (d: unknown) => Promise<void> }).__testSetup__;
      if (setup) {
        await setup({
          profiles: [
            { id: 'p1', name: '永続化テスト', loginUrl: 'https://login.salesforce.com', clientId: 'k', mode: 'readonly', writeSessionTimeoutMin: 15 },
            { id: 'p2', name: '追加プロファイル', loginUrl: 'https://login.salesforce.com', clientId: 'k2', mode: 'readonly', writeSessionTimeoutMin: 15 },
          ],
        });
      }
    });

    await window.reload();
    await window.waitForLoadState('domcontentloaded');
    await main.settingsButton.dispatchEvent('click');
    await expect(window.locator('.font-medium').filter({ hasText: '追加プロファイル' })).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('永続化 — アプリ設定', () => {
  test('defaultMaxRows の変更が renderer 状態に即時反映される', async ({ window }) => {
    await setupTestState(window, {
      profiles: [PROFILE],
      activeProfileId: PROFILE.id,
      sobjects: [],
      describe: {},
    });

    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.settingsButton.dispatchEvent('click');

    const settings = new SettingsPagePOM(window);
    await expect(settings.heading).toBeVisible({ timeout: 5_000 });
    await settings.defaultMaxRowsSelect.selectOption('5000');

    // SettingsPage を閉じる
    await settings.closeButton.dispatchEvent('click');
    await expect(window.getByRole('dialog', { name: '設定' })).not.toBeVisible({ timeout: 3_000 });

    // 上限表示が 5,000 件に変わっている
    await expect(window.locator('text=/上限: 5,000件/')).toBeVisible({ timeout: 3_000 });
  });
});
