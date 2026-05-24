/**
 * CSP / プロセス境界 / セキュリティの E2E テスト。
 *
 * CODING_RULES §7 / §11 の境界が renderer 側で守られていることを ranntime に検証する。
 */
import { test, expect } from '../fixtures/electron.js';
import { EXPECTED_API_KEYS } from '@app/ipc-contract';

test.describe('CSP / プロセス境界', () => {
  test('CSP meta タグが default-src none ベースで設定されている', async ({ window }) => {
    const csp = await window.evaluate(() => {
      const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
      return meta?.getAttribute('content') ?? '';
    });
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  test('renderer から require / process が undefined (nodeIntegration: false)', async ({ window }) => {
    const reqType = await window.evaluate(() =>
      typeof (window as unknown as { require?: unknown }).require,
    );
    expect(reqType).toBe('undefined');

    const procType = await window.evaluate(() =>
      typeof (window as unknown as { process?: unknown }).process,
    );
    expect(procType).toBe('undefined');
  });

  test('contextBridge 経由の window.sfx だけが公開されている', async ({ window }) => {
    const sfxType = await window.evaluate(() => typeof (window as unknown as { sfx?: unknown }).sfx);
    expect(sfxType).toBe('object');

    // electron グローバルは無い
    const electronType = await window.evaluate(() =>
      typeof (window as unknown as { electron?: unknown }).electron,
    );
    expect(electronType).toBe('undefined');
  });

  test('renderer は localStorage に何も書かない (§7.3)', async ({ window }) => {
    const length = await window.evaluate(() => localStorage.length);
    expect(length).toBe(0);
  });

  test('renderer は sessionStorage に何も書かない (§7.3)', async ({ window }) => {
    const length = await window.evaluate(() => sessionStorage.length);
    expect(length).toBe(0);
  });

  test('renderer から fs などの Node モジュールが見えない', async ({ window }) => {
    const exposed = await window.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      return {
        fs: typeof w['fs'],
        Buffer: typeof w['Buffer'],
        global: typeof w['global'],
        __dirname: typeof w['__dirname'],
      };
    });
    expect(exposed.fs).toBe('undefined');
    expect(exposed.Buffer).toBe('undefined');
    expect(exposed.global).toBe('undefined');
    expect(exposed.__dirname).toBe('undefined');
  });

  test('window.sfx 公開メソッドが SalesforceExplorerApi の期待集合と完全一致', async ({ window }) => {
    const keys = await window.evaluate(() => {
      const sfx = (window as unknown as { sfx?: Record<string, unknown> }).sfx;
      return sfx ? Object.keys(sfx).sort() : [];
    });
    // ipc-contract の EXPECTED_API_KEYS.explorer から期待値を導出する。
    // preload で「公開キー集合」と「expected」を起動時 assertion (§11.3) で照合済みのため、
    // ここをハードコードすると preload 変更時の手動同期が必要になる。
    const expected = [...EXPECTED_API_KEYS.explorer].sort();
    expect(keys).toEqual(expected);
  });

  test('SOQL に <script> を入れても XSS にならない (テキストとして扱われる)', async ({ window }) => {
    // 接続不要。Settings 画面の入力欄に script を入れて XSS を試みる
    const settingsHeading = window.getByText('Salesforce Explorer — 設定');
    await expect(settingsHeading).toBeVisible({ timeout: 10_000 });

    await window.getByRole('button', { name: '追加' }).click();
    await window.getByPlaceholder('本番org').fill('<script>window.__xss=true</script>');
    await window.getByPlaceholder('3MVG9...').fill('key');
    await window.getByRole('button', { name: '保存' }).click();

    // テキストとしてレンダリングされており、グローバル汚染は起きていない
    const xssFlag = await window.evaluate(() => (window as unknown as { __xss?: boolean }).__xss);
    expect(xssFlag).toBeUndefined();
  });
});
