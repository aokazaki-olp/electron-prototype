/**
 * SObjectBrowser のクリック・ダブルクリック E2E テスト。
 *
 * Salesforce 接続なしで動作するよう window.sfx をモックしてテストする。
 * setupConnectedState() がページを reload するため、
 * sfx mock → reload → 接続済み状態で MainPage が表示される。
 *
 * 前提: npm run build 済み (out/main/index.js が存在する)
 * 実行: npm run test:e2e
 */
import { test, expect, setupConnectedState } from '../fixtures/electron.js';
import type { SObjectDescribe } from '../../../src/ipc/contract.js';
import { MainPagePOM } from '../pages/MainPage.js';
import { makeSObjectSummary, makeSObjectDescribe, makeFieldDescribe } from '../../fixtures/contract.js';

const SOBJECTS = [
  makeSObjectSummary({ name: 'Account', label: 'アカウント' }),
  makeSObjectSummary({ name: 'Contact', label: '取引先責任者' }),
  makeSObjectSummary({ name: 'Opportunity__c', label: '商談', custom: true }),
];

const DESCRIBE = makeSObjectDescribe({
  name: 'Account',
  label: 'アカウント',
  fields: [
    makeFieldDescribe({ name: 'Id', label: 'ID', type: 'id' }),
    makeFieldDescribe({ name: 'Name', label: '名前', type: 'string', length: 255 }),
    makeFieldDescribe({ name: 'Industry', label: '業種', type: 'picklist' }),
  ],
});

test.describe('SObjectBrowser — クリック・ダブルクリック', () => {
  test.beforeEach(async ({ window }) => {
    const describeMap: Record<string, SObjectDescribe> = { Account: DESCRIBE };
    await setupConnectedState(window, SOBJECTS, describeMap);
  });

  test('メインページが表示される', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
  });

  test('sObject 一覧が表示される', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    // オブジェクト一覧が読み込まれるまで待機
    await expect(main.getSObjectItem('アカウント')).toBeVisible({ timeout: 10_000 });
    await expect(main.getSObjectItem('取引先責任者')).toBeVisible();
  });

  test('シングルクリックでオブジェクトが選択されフィールド詳細が表示される', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await expect(main.getSObjectItem('アカウント')).toBeVisible({ timeout: 10_000 });

    await main.clickSObject('アカウント');

    // フィールド詳細パネルが表示されることを確認（フリーズしないこと）
    await expect(main.fieldDetailPanel).toBeVisible({ timeout: 5_000 });
  });

  test('シングルクリック後もアプリが応答している（フリーズなし）', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await expect(main.getSObjectItem('アカウント')).toBeVisible({ timeout: 10_000 });

    await main.clickSObject('アカウント');

    // 別のオブジェクトもクリックできることを確認（フリーズしていれば失敗する）
    await expect(main.getSObjectItem('取引先責任者')).toBeVisible();
    await main.clickSObject('取引先責任者');

    // 再びアカウントをクリックできる
    await main.clickSObject('アカウント');
    await expect(main.fieldDetailPanel).toBeVisible({ timeout: 5_000 });
  });

  test('ダブルクリックでクエリが SOQL エディタにセットされる', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await expect(main.getSObjectItem('アカウント')).toBeVisible({ timeout: 10_000 });

    await main.doubleClickSObject('アカウント');

    // SOQL エディタに SELECT が入力されることを確認（フリーズしていれば失敗する）
    const editor = window.locator('.cm-content');
    await expect(editor).toContainText('SELECT', { timeout: 5_000 });
    await expect(editor).toContainText('FROM Account', { timeout: 5_000 });
  });

  test('ダブルクリック後もアプリが応答している（フリーズなし）', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await expect(main.getSObjectItem('アカウント')).toBeVisible({ timeout: 10_000 });

    // ダブルクリック
    await main.doubleClickSObject('アカウント');

    // ダブルクリック後も別のオブジェクトをクリックできることを確認
    await expect(main.getSObjectItem('取引先責任者')).toBeVisible({ timeout: 3_000 });
    await main.clickSObject('取引先責任者');

    // 検索フィールドも操作できることを確認（UI が生きている証拠）
    await main.searchInput.fill('account');
    await expect(main.getSObjectItem('アカウント')).toBeVisible({ timeout: 3_000 });
  });

  test('検索でオブジェクトを絞り込める', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await expect(main.getSObjectItem('アカウント')).toBeVisible({ timeout: 10_000 });

    await main.searchInput.fill('account');

    await expect(main.getSObjectItem('アカウント')).toBeVisible();
    await expect(main.getSObjectItem('取引先責任者')).not.toBeVisible();
  });
});
