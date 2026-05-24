/**
 * A3: タブ自動命名の E2E テスト。
 *   sObject をダブルクリック → SOQL 自動生成時に active タブ名が `クエリ N` パターンなら sObject 名にリネーム。
 *   ユーザーが手で付けた名前は上書きしない。
 */
import { test, expect, setupTestState, pressKeyOn } from '../fixtures/electron.js';
import { MainPagePOM } from '../pages/MainPage.js';
import {
  makeProfile,
  makeSObjectSummary,
  makeSObjectDescribe,
  makeFieldDescribe,
} from '../../fixtures/contract.js';

const PROFILE = makeProfile({ id: 'p1' });
const ACCOUNT = makeSObjectSummary({ name: 'Account', label: 'アカウント' });
const CONTACT = makeSObjectSummary({ name: 'Contact', label: '取引先責任者' });

const setupBrowserState = async (page: import('@playwright/test').Page) => {
  await setupTestState(page, {
    profiles: [PROFILE],
    activeProfileId: PROFILE.id,
    sobjects: [ACCOUNT, CONTACT],
    describe: {
      Account: makeSObjectDescribe({
        name: 'Account',
        fields: [
          makeFieldDescribe({ name: 'Id', type: 'id' }),
          makeFieldDescribe({ name: 'Name', type: 'string' }),
        ],
      }),
      Contact: makeSObjectDescribe({
        name: 'Contact',
        fields: [
          makeFieldDescribe({ name: 'Id', type: 'id' }),
          makeFieldDescribe({ name: 'LastName', type: 'string' }),
        ],
      }),
    },
  });
};

test.describe('A3 タブ自動命名', () => {
  test('既定名 「クエリ 1」 のタブで dblclick → Account にリネーム', async ({ window }) => {
    await setupBrowserState(window);
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await expect(main.getSoqlTab('クエリ 1')).toBeVisible({ timeout: 5_000 });

    await main.doubleClickSObject('アカウント');
    await expect(main.getSoqlTab('Account')).toBeVisible({ timeout: 5_000 });
    await expect(main.getSoqlTab('クエリ 1')).not.toBeVisible();
  });

  test('ユーザーが rename 済みタブは上書きしない', async ({ window }) => {
    await setupBrowserState(window);
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });

    // 「クエリ 1」 を 「マイクエリ」 にリネーム
    await main.getSoqlTab('クエリ 1').dispatchEvent('dblclick');
    const renameInput = window.getByLabel('タブ名を編集');
    await renameInput.fill('マイクエリ');
    await pressKeyOn(renameInput, 'Enter');
    await expect(main.getSoqlTab('マイクエリ')).toBeVisible({ timeout: 3_000 });

    // dblclick で自動命名対象外 → タブ名は 「マイクエリ」 のまま
    await main.doubleClickSObject('アカウント');
    await expect(main.getSoqlTab('マイクエリ')).toBeVisible({ timeout: 5_000 });
    await expect(main.getSoqlTab('Account')).not.toBeVisible();
  });

  test('「クエリ 2」 のような 2 桁含む既定名でもリネームされる', async ({ window }) => {
    await setupBrowserState(window);
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });

    // タブ追加して 「クエリ 2」 が active
    await main.addTabButton.dispatchEvent('click');
    await expect(main.getSoqlTab('クエリ 2')).toBeVisible({ timeout: 3_000 });

    await main.doubleClickSObject('取引先責任者');
    await expect(main.getSoqlTab('Contact')).toBeVisible({ timeout: 5_000 });
    // 「クエリ 1」 はそのまま残る (active ではない)
    await expect(main.getSoqlTab('クエリ 1')).toBeVisible();
  });

  test('連続 dblclick で active タブが入れ替わる場合、active のみリネーム対象', async ({ window }) => {
    await setupBrowserState(window);
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });

    // 1 つ目: Account → タブ名 Account
    await main.doubleClickSObject('アカウント');
    await expect(main.getSoqlTab('Account')).toBeVisible({ timeout: 5_000 });

    // 新タブ追加 → active が 「クエリ 2」 になる
    await main.addTabButton.dispatchEvent('click');
    await expect(main.getSoqlTab('クエリ 2')).toBeVisible({ timeout: 3_000 });

    // Contact → 「クエリ 2」 が Contact になる、Account タブは無事
    await main.doubleClickSObject('取引先責任者');
    await expect(main.getSoqlTab('Contact')).toBeVisible({ timeout: 5_000 });
    await expect(main.getSoqlTab('Account')).toBeVisible();
    await expect(main.getSoqlTab('クエリ 2')).not.toBeVisible();
  });

  test('describe キャッシュなしの sObject でも 1 回 click 後の dblclick で自動命名される', async ({ window }) => {
    await setupBrowserState(window);
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });

    // 1 回 click → describe をフェッチ
    await main.clickSObject('アカウント');
    await expect(main.fieldDetailPanel).toBeVisible({ timeout: 5_000 });

    // 続けて dblclick で自動命名 + 実行
    await main.doubleClickSObject('アカウント');
    await expect(main.getSoqlTab('Account')).toBeVisible({ timeout: 5_000 });
  });
});
