/**
 * メインページ（SObjectBrowser + SoqlEditor）の Page Object Model。
 */
import type { Page, Locator } from '@playwright/test';

export class MainPagePOM {
  private readonly page: Page;
  readonly header: Locator;
  readonly disconnectButton: Locator;
  readonly settingsButton: Locator;
  readonly searchInput: Locator;
  readonly refreshButton: Locator;
  readonly runQueryButton: Locator;
  readonly addTabButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.header = page.locator('header').filter({ hasText: 'Salesforce Explorer' });
    this.disconnectButton = page.getByRole('button', { name: '切断' });
    this.settingsButton = page.getByRole('button', { name: '設定' });
    this.searchInput = page.getByPlaceholder('オブジェクトを検索...');
    this.refreshButton = page.locator('button[title="再読み込み"]');
    this.runQueryButton = page.getByRole('button', { name: /実行/ });
    this.addTabButton = page.locator('button[title="新しいタブ"]');
  }

  /** sObject 一覧のボタン（ラベルの完全一致で取得） */
  getSObjectItem(label: string): Locator {
    return this.page.getByRole('button', { name: label, exact: true });
  }

  /** 現在アクティブなタブの名前 */
  get activeTabName(): Locator {
    return this.page.locator('.border-b-blue-500 span');
  }

  /** 結果タブのラベル */
  get resultTab(): Locator {
    return this.page.getByRole('button', { name: /結果/ });
  }

  /** ログタブのラベル */
  get logTab(): Locator {
    return this.page.getByRole('button', { name: 'ログ' });
  }

  /** フィールド詳細パネル（selectedObject が設定済みのとき表示）。定義書出力ボタンで特定する */
  get fieldDetailPanel(): Locator {
    return this.page.getByRole('button', { name: '定義書出力' });
  }

  /** フィールド一覧アイテム */
  getFieldItem(fieldName: string): Locator {
    return this.page.locator('.text-slate-400').filter({ hasText: fieldName });
  }

  async isVisible(): Promise<boolean> {
    return this.header.isVisible();
  }

  /** sObject を1回クリック（シングルクリック） */
  async clickSObject(label: string): Promise<void> {
    // CDP の物理マウスイベントではなく JS dispatchEvent を使う（sandbox クラッシュ回避）
    await this.getSObjectItem(label).dispatchEvent('click');
  }

  /** sObject をダブルクリック */
  async doubleClickSObject(label: string): Promise<void> {
    await this.getSObjectItem(label).dispatchEvent('dblclick');
  }
}
