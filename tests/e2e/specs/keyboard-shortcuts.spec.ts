/**
 * キーボードショートカットの E2E テスト。
 * - Ctrl+Enter: クエリ実行
 * - Esc: モーダルクローズ
 * - IME composition: Enter で実行が暴発しないこと
 */
import { test, expect, setupTestState, pressKey, pressKeyOn } from '../fixtures/electron.js';
import { MainPagePOM } from '../pages/MainPage.js';
import { makeProfile, makeQueryResult } from '../../fixtures/contract.js';

const PROFILE = makeProfile({ id: 'p1' });

test.describe('キーボードショートカット', () => {
  test('Ctrl+Enter でクエリ実行', async ({ window }) => {
    await setupTestState(window, {
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
        records: [{ Id: '001' }],
      }),
    });

    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await expect(main.soqlEditorContent).toBeVisible({ timeout: 5_000 });

    const soqlBefore = await main.soqlEditorContent.textContent();

    // CodeMirror (CM6) は自身の contentEditable ルート (.cm-content) に直接
    // keydown リスナーを持つ。親 div にイベントを dispatch しても CM6 自身の
    // リスナーは（子孫要素なので）発火せず、改行が挿入されてしまう不具合を
    // 検出できなかった（過去バージョンのこのテストの問題点）。
    // 実際に CM6 が処理する要素 (.cm-content) に対して直接 dispatch する。
    // sandbox renderer では keyboard.press が CDP 経由でクラッシュするため、
    // page 内 JS で KeyboardEvent を dispatch する。
    await window.evaluate(() => {
      const editor = document.querySelector('.cm-content');
      editor?.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', ctrlKey: true, bubbles: true,
      }));
    });

    await expect(window.locator('text=/1件取得/')).toBeVisible({ timeout: 5_000 });
    // Ctrl+Enter で改行がエディタ本文に混入しないこと（報告された不具合の回帰確認）
    await expect(main.soqlEditorContent).toHaveText(soqlBefore ?? '');
  });

  test('Esc で Settings モーダルが閉じる', async ({ window }) => {
    await setupTestState(window, {
      profiles: [PROFILE],
      activeProfileId: PROFILE.id,
      sobjects: [],
      describe: {},
    });

    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.settingsButton.dispatchEvent('click');
    await expect(window.getByRole('dialog', { name: '設定' })).toBeVisible({ timeout: 3_000 });

    await pressKey(window, 'Escape');
    await expect(window.getByRole('dialog', { name: '設定' })).not.toBeVisible({ timeout: 3_000 });
  });

  test('Esc で CSV エクスポートモーダルが閉じる', async ({ window }) => {
    await setupTestState(window, {
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
        records: [{ Id: '001' }],
      }),
    });

    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.runQueryButton.dispatchEvent('click');
    await expect(window.locator('text=/1件取得/')).toBeVisible({ timeout: 5_000 });

    await main.openExportMenuAndPick('csv-detail');
    await expect(main.csvExportDialog).toBeVisible();

    await pressKey(window, 'Escape');
    await expect(main.csvExportDialog).not.toBeVisible({ timeout: 3_000 });
  });

  test('Esc で削除確認モーダルが閉じる', async ({ window }) => {
    await setupTestState(window, {
      profiles: [PROFILE],
      activeProfileId: PROFILE.id,
      sobjects: [],
      describe: {},
    });

    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.settingsButton.dispatchEvent('click');
    await window.getByLabel(`${PROFILE.name} を削除`).dispatchEvent('click');
    await expect(window.getByRole('dialog', { name: 'プロファイルを削除' })).toBeVisible();

    await pressKey(window, 'Escape');
    await expect(window.getByRole('dialog', { name: 'プロファイルを削除' })).not.toBeVisible({ timeout: 3_000 });
  });

  test('リネーム input で Enter キー確定 / Esc キャンセル', async ({ window }) => {
    await setupTestState(window, {
      profiles: [PROFILE],
      activeProfileId: PROFILE.id,
      sobjects: [],
      describe: {},
    });
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.getSoqlTab('クエリ 1').dispatchEvent('dblclick');

    const renameInput = window.getByLabel('タブ名を編集');
    await expect(renameInput).toBeVisible();
    await renameInput.fill('XYZ');
    await pressKeyOn(renameInput, 'Enter');
    await expect(main.getSoqlTab('XYZ')).toBeVisible({ timeout: 3_000 });

    // 再度開いて Esc
    await main.getSoqlTab('XYZ').dispatchEvent('dblclick');
    const renameInput2 = window.getByLabel('タブ名を編集');
    await renameInput2.fill('PQR');
    await pressKeyOn(renameInput2, 'Escape');
    // 元の XYZ が残る
    await expect(main.getSoqlTab('XYZ')).toBeVisible();
    await expect(main.getSoqlTab('PQR')).not.toBeVisible();
  });
});
