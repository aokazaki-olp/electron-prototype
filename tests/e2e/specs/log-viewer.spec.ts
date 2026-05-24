/**
 * LogViewer の E2E テスト。
 * - ログタブに切替
 * - 検索フィルタ
 * - レベルフィルタ
 * - クリア
 * - aria-pressed
 */
import { test, expect, setupTestState } from '../fixtures/electron.js';
import { MainPagePOM } from '../pages/MainPage.js';
import { makeProfile } from '../../fixtures/contract.js';

const PROFILE = makeProfile({ id: 'p1' });

test.describe('LogViewer', () => {
  test.beforeEach(async ({ window }) => {
    await setupTestState(window, {
      profiles: [PROFILE],
      activeProfileId: PROFILE.id,
      sobjects: [],
      describe: {},
    });
  });

  test('ログタブに切り替えると LogViewer が表示される', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.logTab.dispatchEvent('click');

    await expect(main.logSearchInput).toBeVisible({ timeout: 3_000 });
    await expect(main.logClearButton).toBeVisible();
  });

  test('レベルフィルタは初期で aria-pressed=true', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.logTab.dispatchEvent('click');

    for (const lvl of ['debug', 'info', 'warn', 'error'] as const) {
      await expect(main.getLogLevelButton(lvl)).toHaveAttribute('aria-pressed', 'true');
    }
  });

  test('レベルフィルタをトグルすると aria-pressed が切り替わる', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.logTab.dispatchEvent('click');

    await main.getLogLevelButton('debug').dispatchEvent('click');
    await expect(main.getLogLevelButton('debug')).toHaveAttribute('aria-pressed', 'false');
    await expect(main.getLogLevelButton('info')).toHaveAttribute('aria-pressed', 'true');
  });

  test('クリアボタンでログが空になる (rendererLog 経由でログ追加 → クリア)', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.logTab.dispatchEvent('click');

    // renderer から log を追加（IPC RENDERER_LOG → main → store.appendLog 経由）
    await window.evaluate(() => {
      const sfx = (window as unknown as { sfx?: { rendererLog?: (l: string, t: string) => void } }).sfx;
      sfx?.rendererLog?.('info', 'e2e テストログ A');
      sfx?.rendererLog?.('warn', 'e2e テストログ B');
    });

    // ログが流れるまで少し待つ（IPC 往復）
    await expect(window.locator('text=e2e テストログ A')).toBeVisible({ timeout: 5_000 });

    // クリア
    await main.logClearButton.dispatchEvent('click');
    await expect(window.locator('text=e2e テストログ A')).not.toBeVisible({ timeout: 3_000 });
  });

  test('ログ検索フィールドに aria-label がある', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.logTab.dispatchEvent('click');

    await expect(main.logSearchInput).toBeVisible();
    // getByLabel が引けている時点で aria-label がついている
    await expect(main.logSearchInput).toHaveAttribute('aria-label', 'ログ検索');
  });
});

test.describe('LogViewer — 仮想化 / DOM 健全性 (regress 検出)', () => {
  test.beforeEach(async ({ window }) => {
    await setupTestState(window, {
      profiles: [PROFILE],
      activeProfileId: PROFILE.id,
      sobjects: [],
      describe: {},
    });
  });

  // estimateSize=22px の仮定が崩れる (truncate が外れる / 長文で折返しが発生) と、
  // 絶対配置で並べた行が縦に重なって描画され、UI が崩壊する。
  // 仮想化が効いていない (= 全行 DOM 化) regress も同時に検出する。
  test('大量行 (500件) 流入時も DOM 上のログ行は overscan 範囲に限定される', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.logTab.dispatchEvent('click');

    // rendererLog は ipcRenderer.send (fire-and-forget) なので 500 件でも数百 ms で発行終了
    await window.evaluate(() => {
      const sfx = (window as unknown as { sfx: { rendererLog: (l: string, t: string) => void } }).sfx;
      for (let i = 0; i < 500; i++) {
        sfx.rendererLog('info', `VLOG #${i}`);
      }
    });

    // ログがバッファに反映されるまで少し待つ (IPC 往復 + setLogs)
    await expect(window.locator('text=VLOG #0').first()).toBeVisible({ timeout: 5_000 });

    // 表示されている VLOG 行を数える。仮想化が効いていれば 100 以下、効いていなければ 500。
    const visibleCount = await window.evaluate(() => {
      const matches = Array.from(document.querySelectorAll('span[title^="VLOG #"]'));
      return matches.length;
    });
    expect(visibleCount).toBeGreaterThan(0);
    expect(visibleCount).toBeLessThan(100);
  });

  test('長文ログでも 1 行に truncate され、隣の絶対配置行と高さが重ならない', async ({ window }) => {
    const main = new MainPagePOM(window);
    await expect(main.header).toBeVisible({ timeout: 15_000 });
    await main.logTab.dispatchEvent('click');

    // 長文 + 短文を混在させ、長文行の高さが 22px ± マージンに収まることを確認
    await window.evaluate(() => {
      const sfx = (window as unknown as { sfx: { rendererLog: (l: string, t: string) => void } }).sfx;
      const long = 'TRUNC_MARKER_' + 'x'.repeat(800) + '_END';
      sfx.rendererLog('info', long);
      sfx.rendererLog('info', '短いログ A');
      sfx.rendererLog('info', '短いログ B');
    });

    await expect(window.locator('span[title^="TRUNC_MARKER_"]').first()).toBeVisible({ timeout: 5_000 });

    // 絶対配置で並ぶ各行の高さが estimateSize=22px から大きく外れていないこと。
    // 折返しが発生していれば 40px+ に膨らみ、隣の行と重なる。
    const heights = await window.evaluate(() => {
      const rows = Array.from(
        document.querySelectorAll('div[style*="position: absolute"]'),
      ) as HTMLElement[];
      return rows
        .filter(el => el.textContent && (el.textContent.includes('TRUNC_MARKER_') || el.textContent.includes('短いログ')))
        .map(el => el.getBoundingClientRect().height);
    });
    expect(heights.length).toBeGreaterThan(0);
    for (const h of heights) {
      expect(h, '各ログ行の高さが estimateSize=22px から大きく外れている (truncate 崩れの可能性)').toBeLessThan(28);
    }
  });
});
