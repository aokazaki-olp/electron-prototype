/**
 * Salesforce 実接続 E2E テスト。
 * 前提: 事前に OAuth 認証済みでリフレッシュトークンが保存されていること。
 *
 * 仮想スクロールの制約:
 *   sObject 一覧は仮想スクロールのため、画面外のアイテムは DOM に存在しない。
 *   検索ボックスで API 名 "Account" を入力して絞り込み、取引先を表示範囲内に収める。
 */
import { test, expect, loadTestEnv } from '../fixtures/electron.js';
import { MainPagePOM } from '../pages/MainPage.js';
import type { Page } from '@playwright/test';

const env = loadTestEnv();
const ACCOUNT_LABEL = env['SF_TEST_ACCOUNT_LABEL'] ?? '取引先';
const ACCOUNT_API_NAME = env['SF_TEST_ACCOUNT_API_NAME'] ?? 'Account';

/** クラッシュ検出リスナー */
function attachCrashDetector(page: Page): () => boolean {
  let crashed = false;
  page.on('crash', () => {
    crashed = true;
    console.log('[PAGE CRASH] レンダラープロセスがクラッシュしました');
  });
  page.on('pageerror', err => console.log('[PAGEERROR]', err.message));
  return () => crashed;
}

test.describe('Salesforce 実接続テスト', () => {
  test.beforeEach(async ({ window }) => {
    await window.evaluate(async () => {
      const setup = (window as unknown as { __testSetup__?: (d: unknown) => Promise<void> }).__testSetup__;
      if (setup) await setup({ useRealApi: true });
    });
    await window.reload();
    await window.waitForLoadState('domcontentloaded');
  });

  test('シングルクリックでクラッシュしない', async ({ window }) => {
    const hasCrashed = attachCrashDetector(window);
    const main = new MainPagePOM(window);

    console.log('Step 1: Main ページ表示待ち');
    await expect(main.header).toBeVisible({ timeout: 30_000 });

    console.log('Step 2: sObject 一覧ロード待ち（API名で検索して仮想リスト内に表示）');
    // 仮想スクロールのため全件は DOM にない。API名 "Account" で検索して絞り込む。
    await expect(main.searchInput).toBeVisible({ timeout: 30_000 });
    await main.searchInput.fill(ACCOUNT_API_NAME);
    await expect(main.getSObjectItem(ACCOUNT_LABEL)).toBeVisible({ timeout: 15_000 });
    expect(hasCrashed(), 'Step2後にクラッシュ').toBe(false);

    console.log('Step 3: シングルクリック');
    await main.clickSObject(ACCOUNT_LABEL);
    expect(hasCrashed(), 'クリック直後にクラッシュ').toBe(false);

    console.log('Step 4: フィールド詳細パネル表示待ち');
    await expect(main.fieldDetailPanel).toBeVisible({ timeout: 10_000 });
    expect(hasCrashed(), 'フィールド詳細表示後にクラッシュ').toBe(false);

    console.log('✓ シングルクリック: クラッシュなし');
  });

  test('ダブルクリックでクラッシュしない', async ({ window }) => {
    const hasCrashed = attachCrashDetector(window);
    const main = new MainPagePOM(window);

    console.log('Step 1: Main ページ表示待ち');
    await expect(main.header).toBeVisible({ timeout: 30_000 });

    console.log('Step 2: sObject 一覧ロード待ち（API名で検索して仮想リスト内に表示）');
    await expect(main.searchInput).toBeVisible({ timeout: 30_000 });
    await main.searchInput.fill(ACCOUNT_API_NAME);
    await expect(main.getSObjectItem(ACCOUNT_LABEL)).toBeVisible({ timeout: 15_000 });
    expect(hasCrashed(), 'Step2後にクラッシュ').toBe(false);

    console.log('Step 3: ダブルクリック');
    await main.doubleClickSObject(ACCOUNT_LABEL);
    expect(hasCrashed(), 'ダブルクリック直後にクラッシュ').toBe(false);

    console.log('Step 4: SOQL エディタ更新待ち');
    const editor = window.locator('.cm-content');
    await expect(editor).toContainText('FROM Account', { timeout: 10_000 });
    expect(hasCrashed(), 'SOQL セット後にクラッシュ').toBe(false);

    console.log('Step 5: クエリ実行完了待ち（結果タブに件数表示）');
    await expect(
      window.locator('button').filter({ hasText: /結果/ }),
    ).toContainText(/\d+件/, { timeout: 30_000 });
    expect(hasCrashed(), 'クエリ実行後にクラッシュ').toBe(false);

    console.log('✓ ダブルクリック: クラッシュなし');
  });
});
