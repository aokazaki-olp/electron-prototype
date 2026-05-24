import { app, BrowserWindow, shell, ipcMain } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SalesforceAuth } from '../libs/SalesforceAuth.js';
import { SalesforceApiClient } from '../libs/SalesforceApiClient.js';
import { HttpError } from '../libs/httpTypes.js';
import type { ConnectParams, ConnectResult, QueryResult } from '../ipc/contract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// アクセストークンは main プロセスのメモリのみに保持する（renderer には渡さない）
let storedAccessToken: string | null = null;
let storedInstanceUrl: string | null = null;

const setupIpcHandlers = (): void => {
  ipcMain.handle('sf:connect', async (_event, params: unknown): Promise<ConnectResult> => {
    if (typeof params !== 'object' || params === null) {
      throw new TypeError('接続パラメータが不正です');
    }
    const { consumerKey, username, privateKey, tokenHost } = params as ConnectParams;

    try {
      const { accessToken, instanceUrl } = await SalesforceAuth.getAccessTokenByJwt({
        consumerKey,
        username,
        privateKey,
        tokenHost,
      });
      storedAccessToken = accessToken;
      storedInstanceUrl = instanceUrl;
      return { instanceUrl };
    } catch (e) {
      if (e instanceof HttpError) {
        throw new Error(`認証失敗 (HTTP ${e.status}): ${e.message}`);
      }
      throw e;
    }
  });

  ipcMain.handle('sf:query', async (_event, soql: unknown): Promise<QueryResult> => {
    if (storedAccessToken === null || storedInstanceUrl === null) {
      throw new Error('Salesforce に接続されていません。先に接続してください。');
    }
    if (typeof soql !== 'string' || soql.trim() === '') {
      throw new TypeError('SOQL クエリが空です');
    }

    const client = SalesforceApiClient.create(storedInstanceUrl, storedAccessToken);

    let raw: unknown;
    try {
      raw = await client.get('/query', { q: soql.trim() });
    } catch (e) {
      if (e instanceof HttpError) {
        throw new Error(`クエリ失敗 (HTTP ${e.status}): ${e.message}`);
      }
      throw e;
    }

    if (typeof raw !== 'object' || raw === null) {
      throw new Error('Salesforce API が予期しないレスポンスを返しました');
    }
    const obj = raw as Record<string, unknown>;
    if (typeof obj['totalSize'] !== 'number' || !Array.isArray(obj['records'])) {
      throw new Error('Salesforce クエリ結果の形式が不正です');
    }

    return {
      totalSize: obj['totalSize'],
      done: obj['done'] === true,
      records: obj['records'] as Record<string, unknown>[],
    };
  });

  ipcMain.handle('sf:disconnect', (): void => {
    storedAccessToken = null;
    storedInstanceUrl = null;
  });
};

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

app.whenReady().then(() => {
  setupIpcHandlers();
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
