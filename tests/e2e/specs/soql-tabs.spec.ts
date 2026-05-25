/**
 * SOQL タブ管理の E2E テスト。
 * - 追加・閉じる・連番命名・rename・切替
 * - 1 件のときは閉じるボタンが出ない
 * - aria-selected の付与
 */
import { test, expect, setupConnectedState, pressKeyOn } from '../fixtures/electron.js';
import { MainPagePOM } from '../pages/MainPage.js';

test.describe('SOQL タブ管理', () => {
  test.beforeEach(async ({ window }) => {
    await setupConnectedState(window, [], {});
  });

  test('初期表示でタブが 1 件存在する', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await expect(main.getSoqlTab('クエリ 1')).toBeVisible({ timeout: 5_000 });
  });

  test('追加ボタンで連番タブが増える', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });

    await main.addTabButton.dispatchEvent('click');
    await expect(main.getSoqlTab('クエリ 2')).toBeVisible({ timeout: 3_000 });

    await main.addTabButton.dispatchEvent('click');
    await expect(main.getSoqlTab('クエリ 3')).toBeVisible({ timeout: 3_000 });
  });

  test('1 件のときは閉じるボタンが出ない', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await expect(main.getSoqlTab('クエリ 1')).toBeVisible({ timeout: 5_000 });
    await expect(main.getCloseTabButton('クエリ 1')).not.toBeVisible();
  });

  test('2 件以上で閉じるボタンが出る', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });

    await main.addTabButton.dispatchEvent('click');
    await expect(main.getCloseTabButton('クエリ 1')).toBeVisible({ timeout: 3_000 });
    await expect(main.getCloseTabButton('クエリ 2')).toBeVisible();
  });

  test('閉じるボタンでタブが消える', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });

    await main.addTabButton.dispatchEvent('click');
    await main.addTabButton.dispatchEvent('click');
    await expect(main.getSoqlTab('クエリ 3')).toBeVisible({ timeout: 3_000 });

    await main.getCloseTabButton('クエリ 2').dispatchEvent('click');
    await expect(main.getSoqlTab('クエリ 2')).not.toBeVisible();
    // 残り 2 件
    await expect(main.getSoqlTab('クエリ 1')).toBeVisible();
    await expect(main.getSoqlTab('クエリ 3')).toBeVisible();
  });

  test('連番が重複しない (中間を消した後の追加で 1 つ大きい番号になる)', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });

    await main.addTabButton.dispatchEvent('click'); // クエリ 2
    await main.addTabButton.dispatchEvent('click'); // クエリ 3
    await main.getCloseTabButton('クエリ 2').dispatchEvent('click');
    await main.addTabButton.dispatchEvent('click'); // クエリ 4 (max+1)

    await expect(main.getSoqlTab('クエリ 4')).toBeVisible({ timeout: 3_000 });
    // クエリ 2 はもう無い
    await expect(main.getSoqlTab('クエリ 2')).not.toBeVisible();
  });

  test('タブクリックで aria-selected が切り替わる', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.addTabButton.dispatchEvent('click');

    // クエリ 2 が初期アクティブ
    await expect(main.getSoqlTab('クエリ 2')).toHaveAttribute('aria-selected', 'true');
    await expect(main.getSoqlTab('クエリ 1')).toHaveAttribute('aria-selected', 'false');

    // クエリ 1 をクリック
    await main.getSoqlTab('クエリ 1').dispatchEvent('click');
    await expect(main.getSoqlTab('クエリ 1')).toHaveAttribute('aria-selected', 'true');
    await expect(main.getSoqlTab('クエリ 2')).toHaveAttribute('aria-selected', 'false');
  });

  test('タブをダブルクリック → リネーム → Enter で確定', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });

    await main.getSoqlTab('クエリ 1').dispatchEvent('dblclick');
    const renameInput = window.getByLabel('タブ名を編集');
    await expect(renameInput).toBeVisible({ timeout: 3_000 });

    await renameInput.fill('売上分析');
    await pressKeyOn(renameInput, 'Enter');

    await expect(main.getSoqlTab('売上分析')).toBeVisible({ timeout: 3_000 });
  });

  test('リネーム中に Esc を押すと編集破棄', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });

    await main.getSoqlTab('クエリ 1').dispatchEvent('dblclick');
    const renameInput = window.getByLabel('タブ名を編集');
    await renameInput.fill('破棄予定');
    await pressKeyOn(renameInput, 'Escape');

    // 元の名前が残る
    await expect(main.getSoqlTab('クエリ 1')).toBeVisible({ timeout: 3_000 });
    await expect(main.getSoqlTab('破棄予定')).not.toBeVisible();
  });

  test('多量タブを追加してもクラッシュしない (10 件)', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });

    for (let i = 0; i < 9; i++) {
      await main.addTabButton.dispatchEvent('click');
    }
    await expect(main.getSoqlTab('クエリ 10')).toBeVisible({ timeout: 3_000 });
  });
});
