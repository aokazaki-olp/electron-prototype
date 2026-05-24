/**
 * メインページ（SObjectBrowser + SoqlEditor + ResultTable + LogViewer）の Page Object Model。
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

  // SoqlEditor
  readonly soqlEditorContent: Locator;
  readonly saveFileButton: Locator;
  readonly openFileButton: Locator;
  readonly fetchAllCheckbox: Locator;
  readonly soqlErrorAlert: Locator;

  // ResultTable
  readonly resultTab: Locator;
  readonly logTab: Locator;
  readonly resultFilterInput: Locator;
  readonly exportCsvButton: Locator;
  readonly exportExcelButton: Locator;
  readonly csvExportDialog: Locator;
  readonly csvExportBomCheckbox: Locator;
  readonly csvExportSaveButton: Locator;
  readonly csvExportCancelButton: Locator;

  // LogViewer
  readonly logSearchInput: Locator;
  readonly logClearButton: Locator;
  readonly logAutoScrollCheckbox: Locator;

  constructor(page: Page) {
    this.page = page;
    this.header = page.locator('header').filter({ hasText: 'Salesforce Explorer' });
    this.disconnectButton = page.getByRole('button', { name: '切断' });
    this.settingsButton = page.getByRole('button', { name: '設定' });
    this.searchInput = page.getByLabel('オブジェクト検索');
    this.refreshButton = page.getByLabel('オブジェクト一覧を再読み込み');
    this.runQueryButton = page.getByRole('button', { name: /実行/ });
    this.addTabButton = page.getByLabel('新しいタブを追加');

    this.soqlEditorContent = page.locator('.cm-content');
    this.saveFileButton = page.getByRole('button', { name: '保存' }).filter({ hasText: /^.*保存$/ });
    this.openFileButton = page.getByRole('button', { name: '開く' });
    this.fetchAllCheckbox = page.locator('label').filter({ hasText: '件数制限を無効' }).locator('input[type="checkbox"]');
    this.soqlErrorAlert = page.getByRole('alert');

    this.resultTab = page.getByRole('tab', { name: /結果/ });
    this.logTab = page.getByRole('tab', { name: 'ログ' });
    this.resultFilterInput = page.getByLabel('結果テーブルをフィルタ');
    this.exportCsvButton = page.getByRole('button', { name: /^.*CSV$/ });
    this.exportExcelButton = page.getByRole('button', { name: /^.*Excel$/ });
    this.csvExportDialog = page.getByRole('dialog', { name: 'CSV エクスポート設定' });
    this.csvExportBomCheckbox = page.locator('label').filter({ hasText: 'BOM を付与する' }).locator('input[type="checkbox"]');
    this.csvExportSaveButton = this.csvExportDialog.getByRole('button', { name: '保存' });
    this.csvExportCancelButton = this.csvExportDialog.getByRole('button', { name: 'キャンセル' });

    this.logSearchInput = page.getByLabel('ログ検索');
    this.logClearButton = page.getByRole('button', { name: 'クリア' });
    this.logAutoScrollCheckbox = page.locator('label').filter({ hasText: '自動スクロール' }).locator('input[type="checkbox"]');
  }

  /** sObject 一覧のボタン（ラベルの完全一致で取得） */
  getSObjectItem(label: string): Locator {
    return this.page.getByRole('button', { name: label, exact: true });
  }

  /** SOQL タブを名前で取得（role=tab） */
  getSoqlTab(name: string): Locator {
    return this.page.getByRole('tab', { name, exact: true });
  }

  /** タブ閉じるボタン */
  getCloseTabButton(name: string): Locator {
    return this.page.getByLabel(`${name} を閉じる`);
  }

  /** 現在アクティブなタブの名前 */
  get activeTabName(): Locator {
    return this.page.locator('.border-b-blue-500 span');
  }

  /** フィールド詳細パネル（selectedObject が設定済みのとき表示）。定義書出力ボタンで特定する */
  get fieldDetailPanel(): Locator {
    return this.page.getByRole('button', { name: '定義書出力' });
  }

  /** フィールド一覧アイテム */
  getFieldItem(fieldName: string): Locator {
    return this.page.locator('.text-slate-400').filter({ hasText: fieldName });
  }

  /** レベルフィルタボタン (LogViewer) */
  getLogLevelButton(level: 'debug' | 'info' | 'warn' | 'error'): Locator {
    return this.page.getByRole('button', { name: new RegExp(`${level} レベルを`, 'i') });
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

  /** CodeMirror のエディタ内に文字列を入力する。dispatchEvent ベースで sandbox を避ける */
  async fillSoqlEditor(text: string): Promise<void> {
    // CodeMirror の DOM に直接書き込むのは困難なため、IPC 経由の testMock を初期化に使うか、
    // タブ追加 + 内容指定で代用するヘルパーをテスト側で利用する想定。
    // ここでは fallback として page.evaluate で react-state を更新できないため、
    // testMock 経由でセットすることを推奨する。
    await this.page.evaluate((t: string) => {
      const ed = document.querySelector('.cm-content');
      if (ed) ed.textContent = t;
    }, text);
  }
}
