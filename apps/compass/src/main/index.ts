/**
 * apps/compass/src/main/index.ts
 * @description Salesforce Compass — ライト版の Electron main エントリ。
 *   現状は UI 未実装のスケルトン。ウィンドウを開いて placeholder HTML を表示するのみ。
 *   将来 @app/main-core を読み取り系のみ公開する形で接続する。
 */

import { app, BrowserWindow, shell } from 'electron';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILD } from '@app/main-core';

const __dirname = dirname(fileURLToPath(import.meta.url));

// §11.4 セキュリティ境界 e2e 用に CDP ポートを開く（Explorer と別ポート）
if (process.env['NODE_ENV'] === 'test') {
  app.commandLine.appendSwitch('remote-debugging-port', '19223');
}

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:']);

const openExternalSafely = (url: string): void => {
  try {
    const u = new URL(url);
    if (ALLOWED_EXTERNAL_PROTOCOLS.has(u.protocol)) {
      void shell.openExternal(url);
    }
  } catch {
    // 不正 URL は無視
  }
};

if (!app.requestSingleInstanceLock()) {
  app.exit(0);
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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafely(url);
    return { action: 'deny' };
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
};

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    try {
      const target = new URL(navigationUrl);
      const allowed = process.env['ELECTRON_RENDERER_URL'];
      if (allowed && navigationUrl.startsWith(allowed)) return;
      if (target.protocol === 'file:') return;
      event.preventDefault();
      openExternalSafely(navigationUrl);
    } catch {
      event.preventDefault();
    }
  });
});

// Electron のトップレベル起動シーケンスを async/await に統一する
void (async () => {
  await app.whenReady();

  // process.defaultApp で開発/本番を判別し、本番 portable ビルドでは execPath のみで登録する。
  if (process.platform === 'win32') {
    if (process.defaultApp && process.argv.length >= 2 && process.argv[1]) {
      app.setAsDefaultProtocolClient(BUILD.urlScheme, process.execPath, [resolve(process.argv[1])]);
    } else {
      app.setAsDefaultProtocolClient(BUILD.urlScheme);
    }
  } else {
    app.setAsDefaultProtocolClient(BUILD.urlScheme);
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
})();

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
