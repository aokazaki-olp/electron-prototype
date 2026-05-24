/**
 * CSV エクスポートダイアログの E2E テスト (A11y / インタラクション)。
 *
 * 実 fs 書き込みは Electron の dialog 依存のため避け、モーダル開閉と操作だけ検証する。
 */
import { test, expect, setupTestState, pressKey, safeCheck } from '../fixtures/electron.js';
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
      tabs: [{ id: 't1', name: 'q', soql: 'SELECT Id FROM Account', fetchAll: false }],
      activeTabId: 't1',
    },
    queryResult: makeQueryResult({
      totalSize: 1, fetchedCount: 1,
      records: [{ Id: '001', Name: 'Acme' }],
    }),
  });
};

test.describe('CSV エクスポート — ダイアログ', () => {
  test('CSV ボタンで role=dialog のモーダルが開く', async ({ window }) => {
    await setupWithResult(window);
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.runQueryButton.dispatchEvent('click');
    await expect(window.locator('text=/1件取得/')).toBeVisible({ timeout: 5_000 });

    await main.openExportMenuAndPick('csv-detail');
    await expect(main.csvExportDialog).toBeVisible({ timeout: 3_000 });
    await expect(window.locator('text=/BOM を付与する/')).toBeVisible();
  });

  test('Esc キーでモーダルが閉じる (A11y)', async ({ window }) => {
    await setupWithResult(window);
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.runQueryButton.dispatchEvent('click');
    await expect(window.locator('text=/1件取得/')).toBeVisible({ timeout: 5_000 });

    await main.openExportMenuAndPick('csv-detail');
    await expect(main.csvExportDialog).toBeVisible();

    await pressKey(window, 'Escape');
    await expect(main.csvExportDialog).not.toBeVisible({ timeout: 3_000 });
  });

  test('オーバーレイクリックでモーダルが閉じる', async ({ window }) => {
    await setupWithResult(window);
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.runQueryButton.dispatchEvent('click');
    await expect(window.locator('text=/1件取得/')).toBeVisible({ timeout: 5_000 });

    await main.openExportMenuAndPick('csv-detail');
    await expect(main.csvExportDialog).toBeVisible();

    // オーバーレイ (背景の半透明 div) をクリック。dialog 自体ではなく外側。
    await window.locator('.fixed.inset-0.bg-black\\/40').dispatchEvent('click');
    await expect(main.csvExportDialog).not.toBeVisible({ timeout: 3_000 });
  });

  test('キャンセルボタンで閉じる', async ({ window }) => {
    await setupWithResult(window);
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.runQueryButton.dispatchEvent('click');
    await expect(window.locator('text=/1件取得/')).toBeVisible({ timeout: 5_000 });

    await main.openExportMenuAndPick('csv-detail');
    await main.csvExportCancelButton.dispatchEvent('click');
    await expect(main.csvExportDialog).not.toBeVisible({ timeout: 3_000 });
  });

  test('BOM チェックボックスをトグルできる', async ({ window }) => {
    await setupWithResult(window);
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.runQueryButton.dispatchEvent('click');
    await expect(window.locator('text=/1件取得/')).toBeVisible({ timeout: 5_000 });

    await main.openExportMenuAndPick('csv-detail');
    await expect(main.csvExportBomCheckbox).toBeChecked();
    await safeCheck(main.csvExportBomCheckbox, false);
    await expect(main.csvExportBomCheckbox).not.toBeChecked();
  });

  test('改行コードを LF に切り替えできる', async ({ window }) => {
    await setupWithResult(window);
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.runQueryButton.dispatchEvent('click');
    await expect(window.locator('text=/1件取得/')).toBeVisible({ timeout: 5_000 });

    await main.openExportMenuAndPick('csv-detail');
    const lfRadio = window.getByRole('radio', { name: 'LF', exact: true });
    const crlfRadio = window.getByRole('radio', { name: 'CRLF', exact: true });
    await expect(crlfRadio).toBeChecked();

    await safeCheck(lfRadio);
    await expect(lfRadio).toBeChecked();
    await expect(crlfRadio).not.toBeChecked();
  });

  test('ダイアログは aria-modal="true" と aria-labelledby を持つ', async ({ window }) => {
    await setupWithResult(window);
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.runQueryButton.dispatchEvent('click');
    await expect(window.locator('text=/1件取得/')).toBeVisible({ timeout: 5_000 });

    await main.openExportMenuAndPick('csv-detail');
    const dlg = main.csvExportDialog;
    await expect(dlg).toHaveAttribute('aria-modal', 'true');
    await expect(dlg).toHaveAttribute('aria-labelledby', 'csv-export-title');
  });
});
