/**
 * B8: ダークモードの E2E テスト。
 *   - Settings 画面のテーマ select 切替で documentElement に `dark` クラスが付け外しされる
 *   - 'system' で prefers-color-scheme: dark のとき dark になる
 *   - 設定は saveSettings 経由で永続化され、reload 後も復元される
 */
import { test, expect, setupTestState } from '../fixtures/electron.js';
import { MainPagePOM } from '../pages/MainPage.js';
import { makeProfile } from '../../fixtures/contract.js';

const PROFILE = makeProfile({ id: 'p1' });

test.describe('B8 ダークモード — テーマ切替', () => {
  test.beforeEach(async ({ window }) => {
    await setupTestState(window, {
      profiles: [PROFILE],
      activeProfileId: PROFILE.id,
      sobjects: [],
      describe: {},
    });
  });

  test('Settings 画面にテーマ select があり既定は system', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.settingsButton.dispatchEvent('click');

    const select = window.locator('label').filter({ hasText: 'テーマ' }).locator('select');
    await expect(select).toBeVisible({ timeout: 3_000 });
    await expect(select).toHaveValue('system');
  });

  test('テーマ select の選択肢は OS に従う / ライト / ダーク', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.settingsButton.dispatchEvent('click');

    const select = window.locator('label').filter({ hasText: 'テーマ' }).locator('select');
    const options = await select.locator('option').allTextContents();
    expect(options).toEqual(['OS に従う', 'ライト', 'ダーク']);
  });

  test('テーマを ダーク に変更 → documentElement に "dark" クラスが付く', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.settingsButton.dispatchEvent('click');

    const select = window.locator('label').filter({ hasText: 'テーマ' }).locator('select');
    await select.selectOption('dark');

    await expect.poll(() =>
      window.evaluate(() => document.documentElement.classList.contains('dark')),
    ).toBe(true);
  });

  test('テーマを ライト に変更 → "dark" クラスが外れる', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.settingsButton.dispatchEvent('click');

    // 一度 ダーク にしてから ライト に戻す
    const select = window.locator('label').filter({ hasText: 'テーマ' }).locator('select');
    await select.selectOption('dark');
    await expect.poll(() => window.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);

    await select.selectOption('light');
    await expect.poll(() => window.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(false);
  });

  test('テーマを system に変更 → matchMedia 結果に従う', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });

    // matchMedia('(prefers-color-scheme: dark)') を一時的に true に固定
    await window.evaluate(() => {
      (window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = (_q: string) => ({
        matches: true,
        media: _q,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        onchange: null,
        dispatchEvent: () => false,
      } as MediaQueryList);
    });

    await main.settingsButton.dispatchEvent('click');
    const select = window.locator('label').filter({ hasText: 'テーマ' }).locator('select');
    // 一度 light に切り替えて、その後 system に戻す → useTheme が effect を再評価
    await select.selectOption('light');
    await expect.poll(() => window.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(false);

    await select.selectOption('system');
    await expect.poll(() => window.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);
  });

  test('テーマ変更後 reload しても永続化されていれば dark が復元される', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.settingsButton.dispatchEvent('click');

    const select = window.locator('label').filter({ hasText: 'テーマ' }).locator('select');
    await select.selectOption('dark');
    await expect.poll(() => window.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);

    // reload して再起動 → dark が復元されている
    await window.reload();
    await window.waitForLoadState('domcontentloaded');
    await expect(main.header).toBeVisible({ timeout: 15_000 });

    await expect.poll(() => window.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);
  });

  test('main 領域に dark: クラスが当たる (dark モードで bg-slate-900 が効く)', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.settingsButton.dispatchEvent('click');

    const select = window.locator('label').filter({ hasText: 'テーマ' }).locator('select');
    await select.selectOption('dark');
    await expect.poll(() => window.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);

    // モーダル外のメインコンテナの色を確認
    // モーダルを閉じてから検証
    await window.locator('[aria-label="設定を閉じる"]').dispatchEvent('click');

    // 親 div の computed style: dark モードで bg-slate-900
    // (Tailwind の dark: 修飾子が compile されている前提)
    const mainBg = await window.locator('header').evaluate((el: Element) => {
      const parent = el.parentElement;
      if (!parent) {
        return '';
      }
      return getComputedStyle(parent).backgroundColor;
    });
    // bg-slate-900 = rgb(15, 23, 42) 付近、bg-white = rgb(255, 255, 255)
    // dark モードで rgb(255,255,255) でなければ OK
    expect(mainBg).not.toBe('rgb(255, 255, 255)');
  });
});
