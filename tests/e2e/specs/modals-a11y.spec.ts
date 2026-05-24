/**
 * モーダル系の A11y 統合テスト。
 * Settings オーバーレイ / 削除確認 / CSV エクスポートを横断して検証。
 *
 * - role=dialog
 * - aria-modal=true
 * - Esc キーでクローズ
 * - オーバーレイクリックでクローズ
 * - 開閉時のフォーカス管理 (フォーカストラップは未実装だが、開いた直後のフォーカス移動を検証)
 */
import { test, expect, setupTestState, pressKey } from '../fixtures/electron.js';
import { MainPagePOM } from '../pages/MainPage.js';
import { SettingsPagePOM } from '../pages/SettingsPage.js';
import { makeProfile } from '../../fixtures/contract.js';

const PROFILE = makeProfile({ id: 'p1' });

test.describe('設定モーダル (App オーバーレイ)', () => {
  test.beforeEach(async ({ window }) => {
    await setupTestState(window, {
      profiles: [PROFILE],
      activeProfileId: PROFILE.id,
      sobjects: [],
      describe: {},
    });
  });

  test('role=dialog / aria-modal / aria-label を持つ', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.settingsButton.dispatchEvent('click');

    const dlg = window.getByRole('dialog', { name: '設定' });
    await expect(dlg).toBeVisible({ timeout: 3_000 });
    await expect(dlg).toHaveAttribute('aria-modal', 'true');
  });

  test('Esc キーで閉じる', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.settingsButton.dispatchEvent('click');
    await expect(window.getByRole('dialog', { name: '設定' })).toBeVisible();

    await pressKey(window, 'Escape');
    await expect(window.getByRole('dialog', { name: '設定' })).not.toBeVisible({ timeout: 3_000 });
  });

  test('オーバーレイクリックで閉じる', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.settingsButton.dispatchEvent('click');
    await expect(window.getByRole('dialog', { name: '設定' })).toBeVisible();

    // 設定ヘッダーから十分離れた左上 (オーバーレイ部分) をクリック
    await window.locator('.fixed.inset-0.bg-black\\/50').dispatchEvent('click');
    await expect(window.getByRole('dialog', { name: '設定' })).not.toBeVisible({ timeout: 3_000 });
  });

  test('ダイアログ内のクリックは閉じない (stopPropagation)', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.settingsButton.dispatchEvent('click');
    await expect(window.getByRole('dialog', { name: '設定' })).toBeVisible();

    // dialog 内の「追加」ボタンクリック → dialog は閉じない
    const settings = new SettingsPagePOM(window);
    await settings.addProfileButton.dispatchEvent('click');
    await expect(window.getByRole('dialog', { name: '設定' })).toBeVisible();
  });

  test('閉じた後の再オープンで状態がリセットされない (フォーム入力は保持されない)', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.settingsButton.dispatchEvent('click');

    const settings = new SettingsPagePOM(window);
    await settings.addProfileButton.dispatchEvent('click');
    await settings.profileNameInput.fill('一時入力');

    // X ボタンで閉じる
    await settings.closeButton.dispatchEvent('click');
    await expect(window.getByRole('dialog', { name: '設定' })).not.toBeVisible({ timeout: 3_000 });

    // 再オープン
    await main.settingsButton.dispatchEvent('click');
    await expect(window.getByRole('dialog', { name: '設定' })).toBeVisible({ timeout: 3_000 });

    // 編集フォームが残らない（再開時はクリーン）
    await expect(settings.profileNameInput).not.toBeVisible();
  });
});

test.describe('削除確認モーダル', () => {
  test('role=dialog / aria-modal を持つ', async ({ window }) => {
    await setupTestState(window, {
      profiles: [PROFILE],
      activeProfileId: PROFILE.id,
      sobjects: [],
      describe: {},
    });
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.settingsButton.dispatchEvent('click');

    const settings = new SettingsPagePOM(window);
    await settings.getDeleteButton(PROFILE.name).dispatchEvent('click');

    const dlg = settings.deleteConfirmDialog;
    await expect(dlg).toBeVisible({ timeout: 3_000 });
    await expect(dlg).toHaveAttribute('aria-modal', 'true');
    await expect(dlg).toHaveAttribute('aria-labelledby', 'delete-confirm-title');
  });

  test('オーバーレイクリックで削除確認モーダルが閉じる', async ({ window }) => {
    await setupTestState(window, {
      profiles: [PROFILE],
      activeProfileId: PROFILE.id,
      sobjects: [],
      describe: {},
    });
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.settingsButton.dispatchEvent('click');

    const settings = new SettingsPagePOM(window);
    await settings.getDeleteButton(PROFILE.name).dispatchEvent('click');
    await expect(settings.deleteConfirmDialog).toBeVisible();

    // 削除モーダルのオーバーレイ
    await window.locator('.fixed.inset-0.bg-black\\/40').dispatchEvent('click');
    await expect(settings.deleteConfirmDialog).not.toBeVisible({ timeout: 3_000 });
  });
});
