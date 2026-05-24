/**
 * アプリ起動 E2E テスト。
 *
 * 前提: npm run build 済み (out/main/index.js が存在する)
 * 実行: npm run test:e2e
 */
import { test, expect } from '../fixtures/electron.js';
import { SettingsPagePOM } from '../pages/SettingsPage.js';

test.describe('アプリ起動', () => {
  test('プロファイルがないとき設定画面が表示される', async ({ window }) => {
    const settings = new SettingsPagePOM(window);
    await expect(settings.heading).toBeVisible({ timeout: 10_000 });
  });

  test('設定画面に「追加」ボタンがある', async ({ window }) => {
    const settings = new SettingsPagePOM(window);
    await expect(settings.heading).toBeVisible({ timeout: 10_000 });
    await expect(settings.addProfileButton).toBeVisible();
  });

  test('新規プロファイルフォームを開いて入力できる', async ({ window }) => {
    const settings = new SettingsPagePOM(window);
    await expect(settings.heading).toBeVisible({ timeout: 10_000 });

    await settings.fillNewProfileForm('テストプロファイル', '3MVG9mock');

    await expect(settings.saveButton).toBeEnabled();
  });

  test('プロファイル名が未入力のとき保存ボタンが無効', async ({ window }) => {
    const settings = new SettingsPagePOM(window);
    await expect(settings.heading).toBeVisible({ timeout: 10_000 });

    await settings.addProfileButton.click();
    // 名前を入力せずに ClientId だけ入力
    await settings.clientIdInput.fill('3MVG9mock');

    await expect(settings.saveButton).toBeDisabled();
  });

  test('キャンセルするとフォームが閉じる', async ({ window }) => {
    const settings = new SettingsPagePOM(window);
    await expect(settings.heading).toBeVisible({ timeout: 10_000 });

    await settings.addProfileButton.click();
    await expect(settings.cancelButton).toBeVisible();
    await settings.cancelButton.click();
    await expect(settings.cancelButton).not.toBeVisible();
  });
});
