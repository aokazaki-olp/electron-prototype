/**
 * index.ts
 * @description main プロセスのエントリ。BrowserWindow を作成し、IPC を配線する。
 *
 * 環境変数:
 *   GBIZ_API_TOKEN — gBizINFO API トークン。未設定時は Swagger 公開の開発用トークンを使う（プロトタイプ用途）。
 */

import { app, BrowserWindow, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createGBizInfoService } from './GBizInfoService.js';
import { createAddressService } from './AddressService.js';
import { registerIpcHandlers } from './ipcHandlers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Swagger 公開のプロトタイプ用トークン。CODING_RULES §7.3 のとおり renderer には絶対に渡さない。
const DEV_TOKEN_FALLBACK = 'DTcLxzo1lZaUYaQPVdSRxdS4MzlXNCs4';

const createWindow = (): void => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
};

const setupServices = async (): Promise<void> => {
  const token = process.env['GBIZ_API_TOKEN'] ?? DEV_TOKEN_FALLBACK;
  const gbiz = createGBizInfoService(token);

  // normalize-japanese-addresses v3 は ESM。dynamic import で main プロセスでのみ読み込む。
  const nja = await import('@geolonia/normalize-japanese-addresses');
  const address = createAddressService({
    normalize: (addr) =>
      nja.normalize(addr) as Promise<Awaited<ReturnType<typeof nja.normalize>>>,
  });

  registerIpcHandlers({ gbiz, address });
};

app.whenReady().then(async () => {
  await setupServices();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
