/**
 * main/index.ts
 * @description Electronメインプロセス — BrowserWindow生成・IPC登録
 */

import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { handleCallbackUrl } from './sfOAuth.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initLogger, initAuditLogger, log, getRecentLogs } from './logger.js';
import { loadProfiles, saveProfile, deleteProfile, loadSettings, saveSettings } from './settings.js';
import {
  startOAuth,
  refreshAccessToken,
  disconnect,
  isConnected,
} from './sfOAuth.js';
import {
  listSObjects,
  describeObject,
  query,
  createRecord,
  updateRecord,
  deleteRecord,
  setCurrentProfile,
  markWriteSession,
  clearWriteSession,
} from './sfApi.js';
import { exportCsv, exportQueryExcel, exportObjectDefinition } from './export.js';
import { IPC } from '../ipc/contract.js';
import type { CsvExportOptions, LogEntry } from '../ipc/contract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================================================
// シングルインスタンス + カスタムURLスキーム
// ============================================================================

// Windows: 2つ目の起動を防ぎ、URLを最初のインスタンスに転送する
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on('second-instance', (_event, argv) => {
  // Windows では argv の末尾に sfexplorer:// URL が入る
  const url = argv.find(a => a.startsWith('sfexplorer://'));
  if (url) {
    handleCallbackUrl(url);
  }
  // ウィンドウを前面に出す
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// Mac では open-url イベントで届く
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleCallbackUrl(url);
});

// ============================================================================
// ログ初期化
// ============================================================================

initLogger();
initAuditLogger();

// ============================================================================
// ウィンドウ
// ============================================================================

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
  app.setAsDefaultProtocolClient('sfexplorer');
  registerIpcHandlers();
  createWindow();

  // electron-log → renderer ストリーミング
  log.hooks.push((message) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const entry: LogEntry = {
        date: message.date.toISOString(),
        level: message.level as LogEntry['level'],
        text: message.data.map(String).join(' '),
      };
      mainWindow.webContents.send(IPC.LOG_ENTRY, entry);
    }
    return message;
  });

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
// エラーシリアライズ（機密情報をrendererに漏らさない）
// ============================================================================

const serializeError = (e: unknown): Error => {
  if (e instanceof Error) {
    return new Error(e.message);
  }
  return new Error(String(e));
};

const handle = <T>(
  channel: string,
  fn: (...args: unknown[]) => Promise<T>,
): void => {
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

let activeProfileId: string | null = null;

const registerIpcHandlers = (): void => {
  // 設定
  handle(IPC.LOAD_SETTINGS, async () => loadSettings());
  handle(IPC.SAVE_SETTINGS, async (settings) => saveSettings(settings as Parameters<typeof saveSettings>[0]));
  handle(IPC.LOAD_PROFILES, async () => loadProfiles());
  handle(IPC.SAVE_PROFILE, async (profile) => saveProfile(profile as Parameters<typeof saveProfile>[0]));
  handle(IPC.DELETE_PROFILE, async (id) => deleteProfile(String(id)));

  // 認証
  handle(IPC.START_OAUTH, async (profileId) => {
    const id = String(profileId);
    await startOAuth(id);
    activeProfileId = id;
    setCurrentProfile(id);
  });

  handle(IPC.REAUTH_FOR_WRITE, async (profileId) => {
    const id = String(profileId);
    await startOAuth(id);
    markWriteSession(id); // sfApi.ts からインポート済み
  });

  handle(IPC.DISCONNECT, async (profileId) => {
    const id = String(profileId);
    disconnect(id);
    clearWriteSession(id);
    if (activeProfileId === id) {
      activeProfileId = null;
    }
  });

  handle(IPC.GET_AUTH_STATE, async (profileId) => {
    const id = String(profileId);
    if (isConnected(id)) {
      return 'connected';
    }
    // refresh_tokenがあれば自動リフレッシュを試みる
    const refreshed = await refreshAccessToken(id);
    if (refreshed) {
      activeProfileId = id;
      setCurrentProfile(id);
      return 'connected';
    }
    return 'disconnected';
  });

  // SF API（読み取り）
  handle(IPC.LIST_SOBJECTS, async () => {
    if (!activeProfileId) {
      throw new Error('プロファイルが選択されていません');
    }
    return listSObjects(activeProfileId);
  });

  handle(IPC.DESCRIBE_OBJECT, async (name) => {
    if (!activeProfileId) {
      throw new Error('プロファイルが選択されていません');
    }
    return describeObject(activeProfileId, String(name));
  });

  handle(IPC.QUERY, async (soql, maxRows) => {
    if (!activeProfileId) {
      throw new Error('プロファイルが選択されていません');
    }
    return query(activeProfileId, String(soql), Number(maxRows));
  });

  // SF API（書き込み）
  handle(IPC.CREATE_RECORD, async (objectName, fields) => {
    if (!activeProfileId) {
      throw new Error('プロファイルが選択されていません');
    }
    return createRecord(activeProfileId, String(objectName), fields as Record<string, unknown>);
  });

  handle(IPC.UPDATE_RECORD, async (objectName, id, fields) => {
    if (!activeProfileId) {
      throw new Error('プロファイルが選択されていません');
    }
    return updateRecord(activeProfileId, String(objectName), String(id), fields as Record<string, unknown>);
  });

  handle(IPC.DELETE_RECORD, async (objectName, id) => {
    if (!activeProfileId) {
      throw new Error('プロファイルが選択されていません');
    }
    return deleteRecord(activeProfileId, String(objectName), String(id));
  });

  // エクスポート
  handle(IPC.EXPORT_CSV, async (records, columns, options) => {
    return exportCsv(
      records as Record<string, unknown>[],
      columns as string[],
      options as CsvExportOptions,
    );
  });

  handle(IPC.EXPORT_QUERY_EXCEL, async (records, columns) => {
    return exportQueryExcel(records as Record<string, unknown>[], columns as string[]);
  });

  handle(IPC.EXPORT_OBJECT_DEFINITION, async (objectName) => {
    if (!activeProfileId) {
      throw new Error('プロファイルが選択されていません');
    }
    return exportObjectDefinition(activeProfileId, String(objectName));
  });

  // ログ
  handle(IPC.GET_RECENT_LOGS, async () => getRecentLogs());
};
