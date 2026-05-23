/**
 * apps/compass/src/main/index.ts
 * @description Salesforce Compass — ライト版の Electron main エントリ。
 *   現状は UI 未実装のスケルトン。ウィンドウを開いて placeholder HTML を表示するのみ。
 *   将来 @app/main-core を読み取り系のみ公開する形で接続する。
 */

import { app, BrowserWindow } from 'electron';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILD } from '@app/main-core';

const __dirname = dirname(fileURLToPath(import.meta.url));

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    title: BUILD.productName,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
};

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAsDefaultProtocolClient(BUILD.urlScheme, process.execPath, [
      resolve(process.argv[1] ?? ''),
    ]);
  } else {
    app.setAsDefaultProtocolClient(BUILD.urlScheme);
  }
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
