/**
 * Compass ビルド用 Playwright CDP フィクスチャ。
 * Explorer fixture (electron.ts) と CDP ポートを分けて並走可能にする。
 *
 * 前提: npm run build:compass 済み (apps/compass/out/main/index.js が存在する)
 */
import { test as base, chromium, type Page } from '@playwright/test';
import type { Browser } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '../../..');
const CDP_PORT = 19_223; // Explorer fixture と別ポート

const getElectronBin = (): string => {
  const base = path.join(APP_ROOT, 'node_modules/electron/dist');
  if (process.platform === 'win32') {
    return path.join(base, 'electron.exe');
  }
  if (process.platform === 'darwin') {
    return path.join(base, 'Electron.app/Contents/MacOS/Electron');
  }
  return path.join(base, 'electron');
};

interface CompassFixtures {
  compassProcess: ChildProcess;
  compassCdpBrowser: Browser;
  compassWindow: Page;
}

export const test = base.extend<CompassFixtures>({
  compassProcess: async ({}, use) => {
    const logLines: string[] = [];
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'test', ELECTRON_IS_DEV: '0' };
    delete env['ELECTRON_RUN_AS_NODE'];
    const child = spawn(
      getElectronBin(),
      [path.join(APP_ROOT, 'apps/compass/out/main/index.js')],
      { env },
    );
    child.stdout?.on('data', (d: Buffer) => logLines.push('[stdout] ' + d.toString().trim()));
    child.stderr?.on('data', (d: Buffer) => logLines.push('[stderr] ' + d.toString().trim()));
    child.on('exit', (code, signal) => logLines.push(`[exit] code=${code} signal=${signal}`));

    let cdpReady = false;
    for (let i = 0; i < 33; i++) {
      try {
        const res = await fetch(`http://localhost:${CDP_PORT}/json/version`);
        if (res.ok) {
          cdpReady = true;
          break;
        }
      } catch {
        /* まだ起動中 */
      }
      await sleep(300);
    }
    if (!cdpReady) {
      child.kill('SIGTERM');
      throw new Error(`Compass CDP が ${CDP_PORT} で応答しませんでした`);
    }

    await use(child);

    child.kill('SIGTERM');
    const exited = await Promise.race([
      new Promise<boolean>(resolve => child.once('exit', () => resolve(true))),
      sleep(2000).then(() => false),
    ]);
    if (!exited) {
      try {
        child.kill('SIGKILL');
      } catch {
        /* already dead */
      }
      await sleep(500);
    }
    for (let i = 0; i < 20; i++) {
      try {
        const res = await fetch(`http://localhost:${CDP_PORT}/json/version`);
        if (res.ok) {
          await sleep(200);
          continue;
        }
      } catch {
        break;
      }
    }
    if (logLines.length > 0) {
      console.log('=== Compass process output ===\n' + logLines.join('\n'));
    }
  },

  compassCdpBrowser: async ({ compassProcess: _ }, use) => {
    const browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`);
    await use(browser);
    await browser.close();
  },

  compassWindow: async ({ compassCdpBrowser }, use) => {
    const context = compassCdpBrowser.contexts()[0];
    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();
    await page.waitForLoadState('domcontentloaded');
    await use(page);
  },
});

export { expect } from '@playwright/test';
