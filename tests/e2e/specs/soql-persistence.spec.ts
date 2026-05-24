/**
 * SOQL タブ永続化の E2E テスト (CODING_RULES §7.3 準拠の検証)。
 *
 * - tabs は IPC 経由で main の electron-store に保存される
 * - reload しても復元される
 * - localStorage は使わない
 */
import { test, expect, setupTestState } from '../fixtures/electron.js';
import { MainPagePOM } from '../pages/MainPage.js';
import { makeProfile } from '../../fixtures/contract.js';

test.describe('SOQL タブ永続化', () => {
  test('初期 tabs を inject して reload しても復元される', async ({ window }) => {
    const profile = makeProfile({ id: 'p1' });
    await setupTestState(window, {
      profiles: [profile],
      activeProfileId: profile.id,
      sobjects: [],
      describe: {},
      tabs: {
        tabs: [
          { id: 't-a', name: '売上 Q1', soql: 'SELECT Id FROM Account', fetchAll: false },
          { id: 't-b', name: 'リード Q2', soql: 'SELECT Id FROM Lead LIMIT 10', fetchAll: true },
        ],
        activeTabId: 't-b',
      },
    });

    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await expect(main.getSoqlTab('売上 Q1')).toBeVisible({ timeout: 5_000 });
    await expect(main.getSoqlTab('リード Q2')).toBeVisible();
    await expect(main.getSoqlTab('リード Q2')).toHaveAttribute('aria-selected', 'true');
  });

  test('タブを追加 → reload で永続化された tabs が残る', async ({ window }) => {
    const profile = makeProfile({ id: 'p1' });
    await setupTestState(window, {
      profiles: [profile],
      activeProfileId: profile.id,
      sobjects: [],
      describe: {},
      tabs: {
        tabs: [{ id: 't0', name: 'クエリ 1', soql: '', fetchAll: false }],
        activeTabId: 't0',
      },
    });

    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.addTabButton.dispatchEvent('click');
    await expect(main.getSoqlTab('クエリ 2')).toBeVisible({ timeout: 3_000 });

    // reload で再起動
    await window.reload();
    await window.waitForLoadState('domcontentloaded');
    await expect(main.header).toBeVisible({ timeout: 15_000 });

    await expect(main.getSoqlTab('クエリ 1')).toBeVisible({ timeout: 5_000 });
    await expect(main.getSoqlTab('クエリ 2')).toBeVisible();
  });

  test('renderer は localStorage に SOQL タブを書かない (§7.3 検証)', async ({ window }) => {
    const profile = makeProfile({ id: 'p1' });
    await setupTestState(window, {
      profiles: [profile],
      activeProfileId: profile.id,
      sobjects: [],
      describe: {},
    });

    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.addTabButton.dispatchEvent('click');
    await main.addTabButton.dispatchEvent('click');

    // localStorage に旧キー 'sfx-soql-tabs' が無いことを確認
    const value = await window.evaluate(() => localStorage.getItem('sfx-soql-tabs'));
    expect(value, '§7.3 違反: localStorage に SOQL タブが書かれている').toBeNull();

    // localStorage 自体に何も書いていないことを確認（厳格）
    const length = await window.evaluate(() => localStorage.length);
    expect(length, 'renderer は localStorage を使うべきでない').toBe(0);
  });
});
