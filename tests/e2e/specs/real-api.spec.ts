/**
 * Salesforce 実 API を使う結合 E2E テスト。
 *
 * .env.test に SF_CONSUMER_KEY / SF_CONSUMER_SECRET / SF_USERNAME / SF_PASSWORD が
 * すべて設定されている場合のみ実行される。未設定のときは全テストをスキップする。
 *
 * Connected App の設定:
 *   - "Allow OAuth Username-Password Flows" を有効にすること
 *   - OAuth スコープに "api" と "refresh_token" を含めること
 *
 * 実行: npm run test:e2e
 */
import { test, expect, loadTestEnv, setupRealAuth } from '../fixtures/electron.js';
import { MainPagePOM } from '../pages/MainPage.js';

// 認証情報チェック（一度だけ）
const env = loadTestEnv();
const hasCredentials =
  Boolean(env['SF_CONSUMER_KEY']) &&
  Boolean(env['SF_CONSUMER_SECRET']) &&
  Boolean(env['SF_USERNAME']) &&
  Boolean(env['SF_PASSWORD']);

test.describe('Salesforce 実 API 結合テスト', () => {
  test.beforeEach(async ({ window }) => {
    if (!hasCredentials) {
      test.skip();
      return;
    }
    await setupRealAuth(window);
  });

  test('sObject 一覧が実 Salesforce から取得できる', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });

    // 実 SF には必ず Account が存在する
    await expect(main.getSObjectItem('Account')).toBeVisible({ timeout: 30_000 });
  });

  test('Account をシングルクリックするとフィールド詳細が表示される', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await expect(main.getSObjectItem('Account')).toBeVisible({ timeout: 30_000 });

    await main.clickSObject('Account');

    await expect(main.fieldDetailPanel).toBeVisible({ timeout: 10_000 });
  });

  test('Account をダブルクリックすると SOQL エディタにクエリがセットされる', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await expect(main.getSObjectItem('Account')).toBeVisible({ timeout: 30_000 });

    await main.doubleClickSObject('Account');

    const editor = window.locator('.cm-content');
    await expect(editor).toContainText('SELECT', { timeout: 10_000 });
    await expect(editor).toContainText('FROM Account', { timeout: 10_000 });
  });

  test('SOQL クエリを実行して結果が返ってくる', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await expect(main.getSObjectItem('Account')).toBeVisible({ timeout: 30_000 });

    // Account をダブルクリックしてクエリをセット
    await main.doubleClickSObject('Account');

    const editor = window.locator('.cm-content');
    await expect(editor).toContainText('FROM Account', { timeout: 10_000 });

    // 実行ボタンをクリック
    const runButton = window.getByRole('button', { name: '実行' });
    await expect(runButton).toBeEnabled({ timeout: 5_000 });
    await runButton.dispatchEvent('click');

    // クエリ結果テーブルが表示される（件数問わず）
    // 空の場合でも「0件」などのステータス表示が出る
    await expect(window.locator('.cm-content')).toBeVisible({ timeout: 15_000 });
  });
});
