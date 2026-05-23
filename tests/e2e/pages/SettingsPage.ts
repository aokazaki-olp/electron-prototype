/**
 * 設定ページの Page Object Model。
 */
import type { Page, Locator } from '@playwright/test';

export class SettingsPagePOM {
  private readonly page: Page;
  readonly heading: Locator;
  readonly addProfileButton: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByText('Salesforce Explorer — 設定');
    this.addProfileButton = page.getByRole('button', { name: '追加' });
    this.saveButton = page.getByRole('button', { name: '保存' });
    this.cancelButton = page.getByRole('button', { name: 'キャンセル' });
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

  async fillNewProfileForm(name: string, clientId: string): Promise<void> {
    await this.addProfileButton.click();
    await this.profileNameInput.fill(name);
    await this.clientIdInput.fill(clientId);
  }

  async isVisible(): Promise<boolean> {
    return this.heading.isVisible();
  }
}
