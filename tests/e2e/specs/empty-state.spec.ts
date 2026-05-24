/**
 * A4: 空状態スニペットの E2E テスト。
 *   結果なし時に「まず試してみる」ガイダンスと 4 つの SOQL チップが表示され、
 *   クリックで active タブの SOQL にセットされて、実行で結果に切り替わる。
 */
import { test, expect, setupTestState } from '../fixtures/electron.js';
import { MainPagePOM } from '../pages/MainPage.js';
import { makeProfile, makeQueryResult } from '../../fixtures/contract.js';

const PROFILE = makeProfile({ id: 'p1' });

const SNIPPET_LABELS = [
  'Account を 10 件',
  '今日作成された Lead の件数',
  'オープン中の Opportunity',
  '有効な User',
];

test.describe('A4 空状態スニペット', () => {
  test('結果なしのときガイダンスと 4 件のスニペットチップが表示される', async ({ window }) => {
    await setupTestState(window, {
      profiles: [PROFILE],
      activeProfileId: PROFILE.id,
      sobjects: [],
      describe: {},
    });
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });

    await expect(window.getByText('SOQLを実行すると結果が表示されます')).toBeVisible({ timeout: 5_000 });
    await expect(window.getByText('まず試してみる:')).toBeVisible();
    for (const label of SNIPPET_LABELS) {
      await expect(window.getByRole('button', { name: new RegExp(label) })).toBeVisible();
    }
  });

  test('スニペットクリック → SOQL がエディタにセットされる', async ({ window }) => {
    await setupTestState(window, {
      profiles: [PROFILE],
      activeProfileId: PROFILE.id,
      sobjects: [],
      describe: {},
    });
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });

    await window.getByRole('button', { name: /Account を 10 件/ }).dispatchEvent('click');

    // CodeMirror の表示内容に SELECT Id, Name FROM Account LIMIT 10 が含まれる
    await expect(main.soqlEditorContent).toContainText('SELECT Id, Name FROM Account LIMIT 10', { timeout: 5_000 });
  });

  test('スニペット → 実行で結果に切り替わり、空状態は消える', async ({ window }) => {
    await setupTestState(window, {
      profiles: [PROFILE],
      activeProfileId: PROFILE.id,
      sobjects: [],
      describe: {},
      queryResult: makeQueryResult({
        totalSize: 10,
        fetchedCount: 10,
        records: Array.from({ length: 10 }, (_, i) => ({ Id: `001-${i}`, Name: `Acme ${i}` })),
      }),
    });
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });

    await window.getByRole('button', { name: /Account を 10 件/ }).dispatchEvent('click');
    // run ボタンで実行 (Ctrl+Enter ではなく明示クリック)
    await main.runQueryButton.dispatchEvent('click');

    await expect(window.locator('text=/10件取得/')).toBeVisible({ timeout: 5_000 });
    await expect(window.getByText('SOQLを実行すると結果が表示されます')).not.toBeVisible();
    await expect(window.getByText('まず試してみる:')).not.toBeVisible();
  });

  test('結果テーブル表示中はスニペットが出ない', async ({ window }) => {
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

    for (const label of SNIPPET_LABELS) {
      await expect(window.getByRole('button', { name: new RegExp(label) })).not.toBeVisible();
    }
  });

  test('全 4 種類のスニペット SOQL が標準オブジェクトを参照している', async ({ window }) => {
    await setupTestState(window, {
      profiles: [PROFILE],
      activeProfileId: PROFILE.id,
      sobjects: [],
      describe: {},
    });
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });

    // それぞれのスニペットを順にクリックしてエディタ内容が切り替わるか確認
    const cases = [
      { label: /Account を 10 件/, expectedFragment: 'FROM Account' },
      { label: /今日作成された Lead の件数/, expectedFragment: 'FROM Lead' },
      { label: /オープン中の Opportunity/, expectedFragment: 'FROM Opportunity' },
      { label: /有効な User/, expectedFragment: 'FROM User' },
    ];
    for (const { label, expectedFragment } of cases) {
      await window.getByRole('button', { name: label }).dispatchEvent('click');
      await expect(main.soqlEditorContent).toContainText(expectedFragment, { timeout: 3_000 });
    }
  });
});
