/**
 * 設定ページ + 設定モーダル の Page Object Model。
 */
import type { Page, Locator } from '@playwright/test';

export class SettingsPagePOM {
  private readonly page: Page;
  readonly heading: Locator;
  readonly addProfileButton: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;
  readonly closeButton: Locator;
  readonly deleteConfirmDialog: Locator;
  readonly deleteConfirmYesButton: Locator;
  readonly deleteConfirmCancelButton: Locator;
  readonly defaultMaxRowsSelect: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByText('Salesforce Explorer — 設定');
    this.addProfileButton = page.getByRole('button', { name: '追加', exact: true });
    this.saveButton = page.getByRole('button', { name: '保存' });
    this.cancelButton = page.getByRole('button', { name: 'キャンセル' });
    this.closeButton = page.getByLabel('設定を閉じる');
    this.deleteConfirmDialog = page.getByRole('dialog', { name: 'プロファイルを削除' });
    this.deleteConfirmYesButton = this.deleteConfirmDialog.getByRole('button', { name: '削除' });
    this.deleteConfirmCancelButton = this.deleteConfirmDialog.getByRole('button', { name: 'キャンセル' });
    this.defaultMaxRowsSelect = page.locator('label').filter({ hasText: 'デフォルト最大取得件数' }).locator('select');
  }

  get profileNameInput(): Locator {
    return this.page.getByPlaceholder('本番org');
  }

  get clientIdInput(): Locator {
    return this.page.getByPlaceholder('3MVG9...');
  }

  get loginUrlInput(): Locator {
    return this.page.locator('input[value*="login.salesforce.com"]');
  }

  get modeSelect(): Locator {
    // 1 つだけ select があり、value が readonly/readwrite のもの
    return this.page.locator('select').first();
  }

  /** プロファイル一覧の行を name で特定 */
  getProfileRow(name: string): Locator {
    return this.page.locator('.font-medium').filter({ hasText: name }).first();
  }

  /** プロファイル名から「削除」ボタンを取得 */
  getDeleteButton(name: string): Locator {
    return this.page.getByLabel(`${name} を削除`);
  }

  /** プロファイル名から「編集」ボタンを取得 */
  getEditButton(name: string): Locator {
    return this.page.getByLabel(`${name} を編集`);
  }

  /** プロファイル名から「接続」ボタンを取得（行内） */
  getConnectButton(name: string): Locator {
    return this.page.locator('div.last\\:border-0')
      .filter({ hasText: name })
      .getByRole('button', { name: /接続/ });
  }

  async fillNewProfileForm(name: string, clientId: string): Promise<void> {
    await this.addProfileButton.click();
    await this.profileNameInput.fill(name);
    await this.clientIdInput.fill(clientId);
  }

  async isVisible(): Promise<boolean> {
    return this.heading.isVisible();
  }
}
