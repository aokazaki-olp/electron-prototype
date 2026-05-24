/**
 * B7: グローバルショートカット (Ctrl+T / Ctrl+W / Ctrl+Tab) の E2E テスト。
 *   - 全て document keydown ベースなので、page.evaluate で KeyboardEvent を dispatch して検証する
 */
import { test, expect, setupTestState } from '../fixtures/electron.js';
import { MainPagePOM } from '../pages/MainPage.js';
import { makeProfile } from '../../fixtures/contract.js';

const PROFILE = makeProfile({ id: 'p1' });

const dispatchKey = (
  page: import('@playwright/test').Page,
  opts: { key: string; ctrlKey?: boolean; shiftKey?: boolean; metaKey?: boolean; isComposing?: boolean },
): Promise<void> =>
  page.evaluate((o) => {
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: o.key,
      ctrlKey: o.ctrlKey ?? false,
      shiftKey: o.shiftKey ?? false,
      metaKey: o.metaKey ?? false,
      isComposing: o.isComposing ?? false,
      bubbles: true,
    }));
  }, opts);

test.describe('B7 グローバルショートカット', () => {
  test.beforeEach(async ({ window }) => {
    await setupTestState(window, {
      profiles: [PROFILE],
      activeProfileId: PROFILE.id,
      sobjects: [],
      describe: {},
    });
  });

  test('Ctrl+T で新規タブが増える', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await expect(main.getSoqlTab('クエリ 1')).toBeVisible({ timeout: 5_000 });

    await dispatchKey(window, { key: 't', ctrlKey: true });
    await expect(main.getSoqlTab('クエリ 2')).toBeVisible({ timeout: 3_000 });

    await dispatchKey(window, { key: 't', ctrlKey: true });
    await expect(main.getSoqlTab('クエリ 3')).toBeVisible({ timeout: 3_000 });
  });

  test('Cmd+T (metaKey) でも新規タブが増える (Mac 想定)', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await expect(main.getSoqlTab('クエリ 1')).toBeVisible({ timeout: 5_000 });

    await dispatchKey(window, { key: 't', metaKey: true });
    await expect(main.getSoqlTab('クエリ 2')).toBeVisible({ timeout: 3_000 });
  });

  test('Ctrl+W でアクティブタブが閉じる (タブ 2 件以上のとき)', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });

    // タブ 2 件にする
    await dispatchKey(window, { key: 't', ctrlKey: true });
    await expect(main.getSoqlTab('クエリ 2')).toBeVisible({ timeout: 3_000 });

    // Ctrl+W
    await dispatchKey(window, { key: 'w', ctrlKey: true });
    await expect(main.getSoqlTab('クエリ 2')).not.toBeVisible({ timeout: 3_000 });
    await expect(main.getSoqlTab('クエリ 1')).toBeVisible();
  });

  test('Ctrl+W はタブが 1 件のとき何もしない (最後の 1 枚は閉じない)', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await expect(main.getSoqlTab('クエリ 1')).toBeVisible({ timeout: 5_000 });

    await dispatchKey(window, { key: 'w', ctrlKey: true });
    await window.waitForTimeout(300);
    // 残っている
    await expect(main.getSoqlTab('クエリ 1')).toBeVisible();
  });

  test('Ctrl+Tab で次のタブに切り替わる (末尾は最初に循環)', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });

    // タブ 3 件用意
    await dispatchKey(window, { key: 't', ctrlKey: true });
    await dispatchKey(window, { key: 't', ctrlKey: true });
    await expect(main.getSoqlTab('クエリ 3')).toBeVisible({ timeout: 3_000 });
    // active = クエリ 3
    await expect(main.getSoqlTab('クエリ 3')).toHaveAttribute('aria-selected', 'true');

    // Ctrl+Tab → 末尾は最初に戻る = クエリ 1
    await dispatchKey(window, { key: 'Tab', ctrlKey: true });
    await expect(main.getSoqlTab('クエリ 1')).toHaveAttribute('aria-selected', 'true');

    // Ctrl+Tab → クエリ 2
    await dispatchKey(window, { key: 'Tab', ctrlKey: true });
    await expect(main.getSoqlTab('クエリ 2')).toHaveAttribute('aria-selected', 'true');
  });

  test('Ctrl+Shift+Tab で前のタブ (先頭は末尾に循環)', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });

    await dispatchKey(window, { key: 't', ctrlKey: true });
    await dispatchKey(window, { key: 't', ctrlKey: true });
    await expect(main.getSoqlTab('クエリ 3')).toBeVisible({ timeout: 3_000 });
    // クエリ 1 に切り替えてから前へ → 末尾 (クエリ 3) に
    await main.getSoqlTab('クエリ 1').dispatchEvent('click');
    await expect(main.getSoqlTab('クエリ 1')).toHaveAttribute('aria-selected', 'true');

    await dispatchKey(window, { key: 'Tab', ctrlKey: true, shiftKey: true });
    await expect(main.getSoqlTab('クエリ 3')).toHaveAttribute('aria-selected', 'true');
  });

  test('IME composition 中の Ctrl+T は無視される', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await expect(main.getSoqlTab('クエリ 1')).toBeVisible({ timeout: 5_000 });

    await dispatchKey(window, { key: 't', ctrlKey: true, isComposing: true });
    await window.waitForTimeout(300);
    // タブが増えていない
    await expect(main.getSoqlTab('クエリ 2')).not.toBeVisible();
  });

  test('修飾なしの T 単独打鍵は無視される', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });

    await dispatchKey(window, { key: 't' });
    await window.waitForTimeout(300);
    await expect(main.getSoqlTab('クエリ 2')).not.toBeVisible();
  });

  test('Ctrl+Tab はタブが 1 件のとき何もしない', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await expect(main.getSoqlTab('クエリ 1')).toBeVisible({ timeout: 5_000 });

    await dispatchKey(window, { key: 'Tab', ctrlKey: true });
    await window.waitForTimeout(300);
    // active が同じく クエリ 1
    await expect(main.getSoqlTab('クエリ 1')).toHaveAttribute('aria-selected', 'true');
  });
});
