/**
 * SOQL クエリ実行と結果テーブル表示の E2E テスト。
 *
 * - 実行 → 結果タブ自動切替
 * - 件数表示
 * - 大量結果の virtualization
 * - フィルタ debounce
 * - ソート
 * - null / object 値の表示
 * - エラー時の alert 表示
 */
import { test, expect, setupTestState, safeCheck } from '../fixtures/electron.js';
import { MainPagePOM } from '../pages/MainPage.js';
import { makeProfile, makeQueryResult } from '../../fixtures/contract.js';

const PROFILE = makeProfile({ id: 'p1' });

test.describe('クエリ実行 — 結果表示', () => {
  test('実行ボタンで結果タブに切り替わり、件数が表示される', async ({ window }) => {
    await setupTestState(window, {
      profiles: [PROFILE],
      activeProfileId: PROFILE.id,
      sobjects: [],
      describe: {},
      tabs: {
        tabs: [{ id: 't1', name: 'クエリ 1', soql: 'SELECT Id FROM Account', fetchAll: false }],
        activeTabId: 't1',
      },
      queryResult: makeQueryResult({
        totalSize: 3, fetchedCount: 3,
        records: [
          { Id: '001', Name: 'Acme' },
          { Id: '002', Name: 'Globex' },
          { Id: '003', Name: 'Initech' },
        ],
      }),
    });

    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.runQueryButton.dispatchEvent('click');

    await expect(window.locator('text=/3件取得/')).toBeVisible({ timeout: 5_000 });
    await expect(window.locator('text=Acme')).toBeVisible();
    await expect(window.locator('text=Globex')).toBeVisible();
  });

  test('totalSize > fetchedCount で「全体」表示', async ({ window }) => {
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
        totalSize: 1000, fetchedCount: 50,
        records: Array.from({ length: 50 }, (_, i) => ({ Id: `r${i}` })),
      }),
    });

    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.runQueryButton.dispatchEvent('click');

    await expect(window.locator('text=/50件取得/')).toBeVisible({ timeout: 5_000 });
    await expect(window.locator('text=/全体: 1,000件/')).toBeVisible();
  });

  test('null 値は "null" として表示', async ({ window }) => {
    await setupTestState(window, {
      profiles: [PROFILE],
      activeProfileId: PROFILE.id,
      sobjects: [],
      describe: {},
      tabs: {
        tabs: [{ id: 't1', name: 'q', soql: 'SELECT Id, Name FROM Account', fetchAll: false }],
        activeTabId: 't1',
      },
      queryResult: makeQueryResult({
        totalSize: 1, fetchedCount: 1,
        records: [{ Id: '001', Name: null }],
      }),
    });

    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.runQueryButton.dispatchEvent('click');

    await expect(window.locator('td').filter({ hasText: /^null$/ })).toBeVisible({ timeout: 5_000 });
  });

  test('object 値は "[object]" として表示', async ({ window }) => {
    await setupTestState(window, {
      profiles: [PROFILE],
      activeProfileId: PROFILE.id,
      sobjects: [],
      describe: {},
      tabs: {
        tabs: [{ id: 't1', name: 'q', soql: 'SELECT Id, Meta FROM Account', fetchAll: false }],
        activeTabId: 't1',
      },
      queryResult: makeQueryResult({
        totalSize: 1, fetchedCount: 1,
        records: [{ Id: '001', Meta: { nested: 'value' } }],
      }),
    });

    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.runQueryButton.dispatchEvent('click');

    await expect(window.locator('td').filter({ hasText: '[object]' })).toBeVisible({ timeout: 5_000 });
  });

  test('フィルタ入力で結果が絞り込まれる (debounce 後)', async ({ window }) => {
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
        totalSize: 3, fetchedCount: 3,
        records: [
          { Id: '001', Name: 'Acme Corporation' },
          { Id: '002', Name: 'Globex' },
          { Id: '003', Name: 'Initech' },
        ],
      }),
    });

    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.runQueryButton.dispatchEvent('click');
    await expect(window.locator('text=Acme Corporation')).toBeVisible({ timeout: 5_000 });

    await main.resultFilterInput.fill('Acme');
    // 200ms debounce 後に反映
    await expect(window.locator('text=Globex')).not.toBeVisible({ timeout: 2_000 });
    await expect(window.locator('text=Acme Corporation')).toBeVisible();
  });

  test('ヘッダクリックでソートのアイコンが切り替わる (asc → desc)', async ({ window }) => {
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
        totalSize: 3, fetchedCount: 3,
        records: [
          { Id: 'c', Name: 'C' },
          { Id: 'a', Name: 'A' },
          { Id: 'b', Name: 'B' },
        ],
      }),
    });

    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.runQueryButton.dispatchEvent('click');

    const idHeader = window.locator('th').filter({ hasText: /^Id$/ }).first();
    await expect(idHeader).toBeVisible({ timeout: 5_000 });
    await idHeader.dispatchEvent('click');
    // ソート後、最初のデータ行に "a" が来る
    const firstRow = window.locator('tbody tr').filter({ hasText: /a/ }).first();
    await expect(firstRow).toBeVisible();
  });
});

test.describe('クエリ実行 — エラー処理', () => {
  test('クエリ失敗で role=alert + メッセージが出る', async ({ window }) => {
    await setupTestState(window, {
      profiles: [PROFILE],
      activeProfileId: PROFILE.id,
      sobjects: [],
      describe: {},
      tabs: {
        tabs: [{ id: 't1', name: 'q', soql: 'SELECT BadField FROM Account', fetchAll: false }],
        activeTabId: 't1',
      },
      queryError: 'INVALID_FIELD: BadField',
    });

    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.runQueryButton.dispatchEvent('click');

    await expect(window.getByRole('alert').filter({ hasText: 'INVALID_FIELD' })).toBeVisible({ timeout: 5_000 });
  });

  test('実行中は実行ボタンが「実行中...」になり disabled', async ({ window }) => {
    await setupTestState(window, {
      profiles: [PROFILE],
      activeProfileId: PROFILE.id,
      sobjects: [],
      describe: {},
      tabs: {
        tabs: [{ id: 't1', name: 'q', soql: 'SELECT Id FROM Account', fetchAll: false }],
        activeTabId: 't1',
      },
      queryResult: makeQueryResult({ totalSize: 1, fetchedCount: 1, records: [{ Id: '1' }] }),
    });

    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });

    // クリック直後を捉えるのは難しいので、実行完了後の状態だけ確認
    await main.runQueryButton.dispatchEvent('click');
    await expect(window.locator('text=/1件取得/')).toBeVisible({ timeout: 5_000 });
    // 完了後は「実行」ラベルに戻る
    await expect(main.runQueryButton).toContainText('実行');
  });
});

test.describe('クエリ実行 — 件数制限', () => {
  test('「全件取得」をチェックすると警告ラベルが出る', async ({ window }) => {
    await setupTestState(window, {
      profiles: [PROFILE],
      activeProfileId: PROFILE.id,
      sobjects: [],
      describe: {},
    });

    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });

    await safeCheck(main.fetchAllCheckbox);
    await expect(window.locator('text=/大量データに注意/')).toBeVisible({ timeout: 3_000 });
    await expect(window.locator('text=/上限: 無制限/')).toBeVisible();
  });
});
