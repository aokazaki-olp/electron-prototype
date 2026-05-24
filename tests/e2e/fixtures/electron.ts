/**
 * Playwright CDP フィクスチャ for Electron 32+。
 *
 * Electron 32 は外部からの --remote-debugging-port CLI フラグを拒否するため、
 * アプリ自身が NODE_ENV=test のとき app.commandLine.appendSwitch で CDP を有効化する。
 * Playwright は chromium.connectOverCDP() でそのポートに接続する。
 *
 * 前提: npm run build 済み (apps/explorer/out/main/index.js が存在する)
 * 実行: npm run test:e2e
 */
import { test as base, chromium, type Page } from '@playwright/test';
import type { Browser } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SObjectSummary, SObjectDescribe, SfConnectionProfile, SoqlTabsState, QueryResult } from '@app/ipc-contract';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '../../..');
const CDP_PORT = 19_222;

const getElectronBin = (): string => {
  const base = path.join(APP_ROOT, 'node_modules/electron/dist');
  if (process.platform === 'win32') return path.join(base, 'electron.exe');
  if (process.platform === 'darwin') return path.join(base, 'Electron.app/Contents/MacOS/Electron');
  return path.join(base, 'electron');
};

interface ElectronFixtures {
  electronProcess: ChildProcess;
  cdpBrowser: Browser;
  window: Page;
}

export const test = base.extend<ElectronFixtures>({
  electronProcess: async ({}, use) => {
    const logLines: string[] = [];
    // AGENTS.md の方針通り ELECTRON_RUN_AS_NODE を確実に除去する。
    // spawn に undefined を渡すと Node のバージョンで挙動が割れるため、明示的に delete する。
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'test', ELECTRON_IS_DEV: '0' };
    delete env['ELECTRON_RUN_AS_NODE'];
    const child = spawn(
      getElectronBin(),
      [path.join(APP_ROOT, 'apps/explorer/out/main/index.js')],
      { env },
    );
    child.stdout?.on('data', (d: Buffer) => logLines.push('[stdout] ' + d.toString().trim()));
    child.stderr?.on('data', (d: Buffer) => logLines.push('[stderr] ' + d.toString().trim()));
    child.on('exit', (code, signal) => logLines.push(`[exit] code=${code} signal=${signal}`));

    // CDP エンドポイントが応答するまでポーリング（最大 10 秒）
    let cdpReady = false;
    for (let i = 0; i < 33; i++) {
      try {
        const res = await fetch(`http://localhost:${CDP_PORT}/json/version`);
        if (res.ok) { cdpReady = true; break; }
      } catch { /* まだ起動中 */ }
      await sleep(300);
    }
    if (!cdpReady) {
      child.kill('SIGTERM');
      throw new Error(`Electron CDP が ${CDP_PORT} で応答しませんでした`);
    }

    await use(child);

    // SIGTERM だけだと Windows で child の Chromium プロセスが残り CDP ポートが解放されない。
    // exit イベントを待ち、不発時は SIGKILL でフォールバック。
    child.kill('SIGTERM');
    const exited = await Promise.race([
      new Promise<boolean>(resolve => child.once('exit', () => resolve(true))),
      sleep(2000).then(() => false),
    ]);
    if (!exited) {
      try { child.kill('SIGKILL'); } catch { /* already dead */ }
      await sleep(500);
    }
    // ポート開放確認: 次の spec の起動前に 19222 が listen 解除されるのを待つ
    for (let i = 0; i < 20; i++) {
      try {
        const res = await fetch(`http://localhost:${CDP_PORT}/json/version`);
        if (res.ok) {
          await sleep(200);
          continue; // まだ開いている
        }
      } catch {
        break; // 接続不可 = ポート解放済み
      }
    }
    if (logLines.length > 0) {
      console.log('=== Electron process output ===\n' + logLines.join('\n'));
    }
  },

  cdpBrowser: async ({ electronProcess: _ }, use) => {
    const browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`);
    await use(browser);
    await browser.close();
  },

  window: async ({ cdpBrowser }, use) => {
    const context = cdpBrowser.contexts()[0];
    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();
    page.on('pageerror', err => console.log('[PAGEERROR]', err.message, err.stack));
    page.on('crash', () => console.log('[PAGE CRASH] renderer process crashed'));
    page.on('console', msg => {
      if (msg.type() === 'error') console.log('[CONSOLE ERROR]', msg.text());
    });
    await page.waitForLoadState('domcontentloaded');
    await use(page);
  },
});

export { expect } from '@playwright/test';
import type { Locator } from '@playwright/test';

/**
 * Sandbox 有効な Electron renderer では Playwright 標準の `locator.click()` が
 * CDP の物理マウスイベントを経由して renderer をクラッシュさせる既知問題がある。
 * dispatchEvent でブラウザ内 JS から発火させればクラッシュしない。
 *
 * すべての click 操作はこのヘルパー経由で行うこと。
 */
export const safeClick = (locator: Locator): Promise<void> =>
  locator.dispatchEvent('click');

export const safeDblClick = (locator: Locator): Promise<void> =>
  locator.dispatchEvent('dblclick');

/**
 * Playwright の `keyboard.press` は focus 依存で React の document-level
 * keydown listener に届かないことがあるため、page 側で直接 document に
 * KeyboardEvent を dispatch する。
 */
export const pressKey = (page: Page, key: string): Promise<void> =>
  page.evaluate((k: string) => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  }, key);

/**
 * checkbox/radio の trigger。Playwright の `.check()` は sandbox renderer で
 * 物理マウスイベントを使うためクラッシュ要因になる。
 * element.click() は内部で synthetic event のみ発火する (CDP 経由ではない) ため安全で、
 * React の onClick + onChange + checked tracker 全部を正しく更新する。
 */
export const safeCheck = (locator: Locator, checked = true): Promise<void> =>
  locator.evaluate((el, c) => {
    if (!(el instanceof HTMLInputElement)) return;
    if (el.checked !== c) el.click();
  }, checked);

/**
 * focused element 内で keydown を発火させる helper。
 * input.press('Enter') が sandbox renderer をクラッシュさせるための代替。
 */
export const pressKeyOn = (locator: Locator, key: string): Promise<void> =>
  locator.evaluate((el, k: string) => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  }, key);

// ============================================================================
// テストヘルパー
// ============================================================================

export type TestSetupData = {
  profiles: SfConnectionProfile[];
  activeProfileId: string;
  sobjects: SObjectSummary[];
  describe: Record<string, SObjectDescribe>;
  useRealApi?: boolean;
  accessToken?: string;
  instanceUrl?: string;
  /** SOQL タブの初期状態。null を渡すと未設定として扱う */
  tabs?: SoqlTabsState | null;
  /** query() のモックレスポンス。null で「クエリは 0 件」 */
  queryResult?: QueryResult | null;
  /** query() を必ずエラーで終わらせる（メッセージ）。null で正常動作 */
  queryError?: string | null;
  /** query() / bulkQuery() の応答に挟む人工遅延 (ms)。skeleton 表示の e2e で使う */
  queryDelayMs?: number;
};

/**
 * メインプロセスの testMock を設定してページをリロードする。
 * リロード後、アプリは testSetupData の状態で再起動する。
 */
export const setupTestState = async (
  page: Page,
  data: TestSetupData,
): Promise<void> => {
  await page.evaluate(async (payload: unknown) => {
    const setup = (window as unknown as { __testSetup__?: (d: unknown) => Promise<void> }).__testSetup__;
    if (!setup) throw new Error('__testSetup__ が見つかりません。テストモードで起動されていません。');
    await setup(payload);
  }, data as unknown);
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
};

/**
 * SObjectBrowser テスト用の接続済み状態をセットアップする。
 */
export const setupConnectedState = async (
  page: Page,
  sobjects: SObjectSummary[] = [],
  describeMap: Record<string, SObjectDescribe> = {},
): Promise<void> => {
  const profile: SfConnectionProfile = {
    id: 'e2e-profile',
    name: 'E2Eテスト',
    loginUrl: 'https://test.salesforce.com',
    clientId: 'test-client',
    mode: 'readonly',
    writeSessionTimeoutMin: 15,
  };
  await setupTestState(page, {
    profiles: [profile],
    activeProfileId: profile.id,
    sobjects,
    describe: describeMap,
  });
};

// ============================================================================
// 実 Salesforce API を使う結合テスト用ヘルパー
// ============================================================================

/**
 * .env.test を読み込んで key=value をパースする。
 * 空行・コメント行は無視し、値が空のキーは除外する。
 */
export const loadTestEnv = (): Record<string, string> => {
  try {
    const content = readFileSync(path.join(APP_ROOT, '.env.test'), 'utf-8');
    const env: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (value) env[key] = value;
    }
    return env;
  } catch {
    return {};
  }
};

export type RealAuthResult = {
  profileId: string;
  instanceUrl: string;
};

/**
 * .env.test の認証情報で Salesforce Username-Password OAuth フローを実行し、
 * 取得したアクセストークンをテスト用 Electron プロセスに注入する。
 *
 * 認証情報が未設定の場合は null を返す（呼び出し側で test.skip すること）。
 * Connected App で "Allow OAuth Username-Password Flows" が有効である必要がある。
 */
export const setupRealAuth = async (page: Page): Promise<RealAuthResult | null> => {
  const env = loadTestEnv();
  const consumerKey = env['SF_CONSUMER_KEY'];
  const consumerSecret = env['SF_CONSUMER_SECRET'];
  const username = env['SF_USERNAME'];
  const password = env['SF_PASSWORD'];
  const loginUrl = env['SF_LOGIN_URL'] ?? 'https://login.salesforce.com';

  if (!consumerKey || !consumerSecret || !username || !password) {
    return null;
  }

  const tokenUrl = `${loginUrl}/services/oauth2/token`;
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: consumerKey,
    client_secret: consumerSecret,
    username,
    password,
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    body: body.toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  if (!res.ok) {
    throw new Error(`Salesforce 認証失敗 (HTTP ${res.status}): ${await res.text()}`);
  }

  const data = await res.json() as { access_token: string; instance_url: string };
  const profileId = 'real-e2e-profile';
  const profile: SfConnectionProfile = {
    id: profileId,
    name: 'Real E2E',
    loginUrl,
    clientId: consumerKey,
    mode: 'readonly',
    writeSessionTimeoutMin: 15,
  };

  await setupTestState(page, {
    profiles: [profile],
    activeProfileId: profileId,
    sobjects: [],
    describe: {},
    useRealApi: true,
    accessToken: data.access_token,
    instanceUrl: data.instance_url,
  });

  return { profileId, instanceUrl: data.instance_url };
};
