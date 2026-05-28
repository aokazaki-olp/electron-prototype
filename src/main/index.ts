/**
 * main/index.ts
 * @description Electron メインプロセス — BrowserWindow生成・IPC登録
 */

import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initLogger, log } from './logger.js';
import { loadSettings, saveSettings } from './settings.js';
import { poiSearch } from './poiSearch.js';
import { IPC } from '../ipc/contract.js';
import type { PoiSearchOptions } from '../ipc/contract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

initLogger();

let mainWindow: BrowserWindow | null = null;

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
};

app.whenReady().then(() => {
  registerIpcHandlers();
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

// ============================================================================
// エラーシリアライズ
// ============================================================================

const serializeError = (e: unknown): Error =>
  e instanceof Error ? new Error(e.message) : new Error(String(e));

const handle = <T>(channel: string, fn: (...args: unknown[]) => Promise<T>): void => {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      throw serializeError(e);
    }
  });
};

// ============================================================================
// IPC ハンドラ登録
// ============================================================================

const registerIpcHandlers = (): void => {
  handle(IPC.LOAD_SETTINGS, async () => loadSettings());
  handle(IPC.SAVE_SETTINGS, async (settings) =>
    saveSettings(settings as Parameters<typeof saveSettings>[0]),
  );
  handle(IPC.POI_SEARCH, async (query, options) =>
    poiSearch(String(query), options as PoiSearchOptions),
  );
};

export { log };
