/**
 * B9 (列幅 resize) + B10 (エクスポート dropdown) の E2E テスト。
 *
 *   - エクスポート dropdown が開閉する
 *   - CSV (BOM+CRLF) / CSV…（詳細設定）/ Excel の 3 メニュー項目が存在する
 *   - 外側クリック / Esc キーで dropdown が閉じる
 *   - 列幅 drag handle (role=separator) がヘッダーに存在する
 *   - 結果が無いとき dropdown ボタンは存在しない (empty state)
 *
 *   contextBridge frozen のため `window.sfx.exportCsv` の上書きスパイは効かない。
 *   IPC 呼び出しの検証は unit test (ResultTable.test.tsx) でカバー済み。
 *   ここでは UI の表示・遷移を網羅的に検証する。
 */
import { test, expect, setupTestState, pressKey } from '../fixtures/electron.js';
import { MainPagePOM } from '../pages/MainPage.js';
import { makeProfile, makeQueryResult } from '../../fixtures/contract.js';

const PROFILE = makeProfile({ id: 'p1' });

const setupWithResult = async (page: import('@playwright/test').Page) => {
  await setupTestState(page, {
    profiles: [PROFILE],
    activeProfileId: PROFILE.id,
    sobjects: [],
    describe: {},
    tabs: {
      tabs: [{ id: 't1', name: 'q', soql: 'SELECT Id, Name FROM Account', fetchAll: false }],
      activeTabId: 't1',
    },
    queryResult: makeQueryResult({
      totalSize: 2, fetchedCount: 2,
      records: [
        { Id: '001', Name: 'Acme' },
        { Id: '002', Name: 'Globex' },
      ],
    }),
  });
};

test.describe('B10 エクスポート dropdown', () => {
  test('結果あり → ボタンクリックで dropdown が開き 3 メニュー項目が出る', async ({ window }) => {
    await setupWithResult(window);
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.runQueryButton.dispatchEvent('click');
    await expect(window.locator('text=/2件取得/')).toBeVisible({ timeout: 5_000 });

    await main.exportMenuButton.dispatchEvent('click');
    await expect(window.getByRole('menu', { name: 'エクスポート形式' })).toBeVisible({ timeout: 3_000 });
    await expect(main.quickCsvMenuItem).toBeVisible();
    await expect(main.csvDetailMenuItem).toBeVisible();
    await expect(main.excelMenuItem).toBeVisible();
  });

  test('結果なし時はエクスポート dropdown ボタンが存在しない (empty state)', async ({ window }) => {
    await setupTestState(window, {
      profiles: [PROFILE],
      activeProfileId: PROFILE.id,
      sobjects: [],
      describe: {},
    });
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });

    // 結果なし → empty state が出る (スニペット表示)。dropdown ボタンは描画されない。
    await expect(window.getByText('SOQLを実行すると結果が表示されます')).toBeVisible({ timeout: 5_000 });
    await expect(main.exportMenuButton).not.toBeVisible();
  });

  test('Esc キーで dropdown が閉じる', async ({ window }) => {
    await setupWithResult(window);
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.runQueryButton.dispatchEvent('click');
    await expect(window.locator('text=/2件取得/')).toBeVisible({ timeout: 5_000 });

    await main.exportMenuButton.dispatchEvent('click');
    await expect(window.getByRole('menu')).toBeVisible();

    await pressKey(window, 'Escape');
    await expect(window.getByRole('menu')).not.toBeVisible({ timeout: 3_000 });
  });

  test('外側クリックで dropdown が閉じる', async ({ window }) => {
    await setupWithResult(window);
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.runQueryButton.dispatchEvent('click');
    await expect(window.locator('text=/2件取得/')).toBeVisible({ timeout: 5_000 });

    await main.exportMenuButton.dispatchEvent('click');
    await expect(window.getByRole('menu')).toBeVisible();

    // body をクリックして外側クリック扱い
    await window.evaluate(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    await expect(window.getByRole('menu')).not.toBeVisible({ timeout: 3_000 });
  });

  test('CSV…（詳細設定）クリックで CSV 詳細ダイアログが開く', async ({ window }) => {
    await setupWithResult(window);
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.runQueryButton.dispatchEvent('click');
    await expect(window.locator('text=/2件取得/')).toBeVisible({ timeout: 5_000 });

    await main.openExportMenuAndPick('csv-detail');
    await expect(main.csvExportDialog).toBeVisible({ timeout: 3_000 });
  });

  test('CSV (BOM+CRLF) ワンショットクリックで dropdown が閉じてダイアログは出ない', async ({ window }) => {
    await setupWithResult(window);
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.runQueryButton.dispatchEvent('click');
    await expect(window.locator('text=/2件取得/')).toBeVisible({ timeout: 5_000 });

    await main.openExportMenuAndPick('csv-quick');
    await expect(window.getByRole('menu')).not.toBeVisible({ timeout: 3_000 });
    // ワンショットなので CSV 詳細ダイアログは開かない
    await expect(main.csvExportDialog).not.toBeVisible();
  });

  test('Excel メニュークリックで dropdown が閉じる', async ({ window }) => {
    await setupWithResult(window);
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.runQueryButton.dispatchEvent('click');
    await expect(window.locator('text=/2件取得/')).toBeVisible({ timeout: 5_000 });

    await main.openExportMenuAndPick('excel');
    await expect(window.getByRole('menu')).not.toBeVisible({ timeout: 3_000 });
  });

  test('dropdown ボタンに aria-haspopup="menu" と aria-expanded が付く', async ({ window }) => {
    await setupWithResult(window);
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.runQueryButton.dispatchEvent('click');
    await expect(window.locator('text=/2件取得/')).toBeVisible({ timeout: 5_000 });

    await expect(main.exportMenuButton).toHaveAttribute('aria-haspopup', 'menu');
    await expect(main.exportMenuButton).toHaveAttribute('aria-expanded', 'false');

    await main.exportMenuButton.dispatchEvent('click');
    await expect(main.exportMenuButton).toHaveAttribute('aria-expanded', 'true');
  });
});

test.describe('B9 列幅 resize', () => {
  test('ヘッダーセルに role=separator の drag handle が付く (Id / Name)', async ({ window }) => {
    await setupWithResult(window);
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.runQueryButton.dispatchEvent('click');
    await expect(window.locator('text=/2件取得/')).toBeVisible({ timeout: 5_000 });

    await expect(window.getByLabel('Id 列幅を調整')).toBeAttached({ timeout: 3_000 });
    await expect(window.getByLabel('Name 列幅を調整')).toBeAttached();
  });

  test('ヘッダーセルに style.width が付与されている (TanStack columnSizing 連動)', async ({ window }) => {
    await setupWithResult(window);
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.runQueryButton.dispatchEvent('click');
    await expect(window.locator('text=/2件取得/')).toBeVisible({ timeout: 5_000 });

    const width = await window.locator('thead tr:first-child th:first-child').evaluate((el: Element) =>
      Number.parseInt((el as HTMLElement).style.width || '0', 10),
    );
    // defaultColumn.size=150 を期待。0 でないこと。
    expect(width).toBeGreaterThan(0);
  });

  test('th のサイズが style.width で全カラムに渡って効いている', async ({ window }) => {
    await setupWithResult(window);
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.runQueryButton.dispatchEvent('click');
    await expect(window.locator('text=/2件取得/')).toBeVisible({ timeout: 5_000 });

    const widths = await window.locator('thead tr:first-child th').evaluateAll((els: Element[]) =>
      els.map(el => Number.parseInt((el as HTMLElement).style.width || '0', 10)),
    );
    expect(widths.length).toBeGreaterThan(0);
    for (const w of widths) expect(w).toBeGreaterThan(0);
  });
});
