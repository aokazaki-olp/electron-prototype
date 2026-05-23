/**
 * Playwright CDP フィクスチャ for Electron 32+。
 *
 * Electron 32 は外部からの --remote-debugging-port CLI フラグを拒否するため、
 * アプリ自身が NODE_ENV=test のとき app.commandLine.appendSwitch で CDP を有効化する。
 * Playwright は chromium.connectOverCDP() でそのポートに接続する。
 *
 * 前提: npm run build 済み (out/main/index.js が存在する)
 * 実行: npm run test:e2e
 */
import { test as base, chromium, type Page } from '@playwright/test';
import type { Browser } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SObjectSummary, SObjectDescribe, SfConnectionProfile } from '@app/ipc-contract';

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
    const child = spawn(
      getElectronBin(),
      [path.join(APP_ROOT, 'out/main/index.js')],
      { env: { ...process.env, NODE_ENV: 'test', ELECTRON_IS_DEV: '0', ELECTRON_RUN_AS_NODE: undefined } },
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

    child.kill('SIGTERM');
    await sleep(500);
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
