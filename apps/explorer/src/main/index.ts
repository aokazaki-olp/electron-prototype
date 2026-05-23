/**
 * main/index.ts
 * @description Electronメインプロセス — BrowserWindow生成・IPC登録
 */

import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import {
  BUILD,
  initLogger,
  initAuditLogger,
  log,
  getRecentLogs,
  loadProfiles,
  saveProfile,
  deleteProfile,
  loadSettings,
  saveSettings,
  handleCallbackUrl,
  startOAuth,
  refreshAccessToken,
  disconnect,
  isConnected,
  injectTokenForTest,
  listSObjects,
  describeObject,
  query,
  createRecord,
  updateRecord,
  deleteRecord,
  setCurrentProfile,
  markWriteSession,
  clearWriteSession,
  exportCsv,
  exportQueryExcel,
  exportObjectDefinition,
} from '@app/main-core';
import { IPC } from '@app/ipc-contract';
import type { CsvExportOptions, LogEntry, SfConnectionProfile, SObjectSummary, SObjectDescribe } from '@app/ipc-contract';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================================================
// テストモード
// ============================================================================

const isTestMode = process.env['NODE_ENV'] === 'test';

if (isTestMode) {
  // Playwright が CDP 経由で接続できるようにする。
  // 外部 CLI フラグは Electron 32 のセキュリティで拒否されるため、
  // app.commandLine.appendSwitch を使って app.whenReady より前に設定する。
  app.commandLine.appendSwitch('remote-debugging-port', '19222');
}

// テストモード専用の in-memory モックデータ
type TestMockStore = {
  profiles: SfConnectionProfile[];
  activeProfileId: string | null;
  sobjects: SObjectSummary[];
  describe: Record<string, SObjectDescribe>;
  useRealApi: boolean;
};

const testMock: TestMockStore = {
  profiles: [],
  activeProfileId: null,
  sobjects: [],
  describe: {},
  useRealApi: false,
};

// ============================================================================
// シングルインスタンス + カスタムURLスキーム
// ============================================================================

// Windows: 2つ目の起動を防ぎ、URLを最初のインスタンスに転送する
// テストモードでも必ずロックを取得する。
// OAuth コールバック時に OS が別プロセスを起動するが、ロックがあれば
// second-instance イベント経由でこのプロセスに URL が転送される。
// workers: 1 で実行しているため並列競合は起きない。
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on('second-instance', (_event, argv) => {
  // Windows では argv の末尾にカスタムURLスキームの URL が入る（BUILD.urlScheme による）
  const prefix = `${BUILD.urlScheme}://`;
  const url = argv.find(a => a.startsWith(prefix));
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
  // Windows開発環境では process.argv[1] を渡さないと URL がアプリパスとして解釈される
  if (process.platform === 'win32') {
    app.setAsDefaultProtocolClient(BUILD.urlScheme, process.execPath, [
      resolve(process.argv[1] ?? ''),
    ]);
  } else {
    app.setAsDefaultProtocolClient(BUILD.urlScheme);
  }
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
  // テストモード専用: テスト用モックデータをセットアップするチャンネル
  if (isTestMode) {
    ipcMain.handle('test:setup', (_event, data: unknown) => {
      if (typeof data !== 'object' || data === null) return;
      const d = data as Partial<TestMockStore> & { accessToken?: string; instanceUrl?: string };
      if (Array.isArray(d.profiles)) testMock.profiles = d.profiles;
      if (Array.isArray(d.sobjects)) testMock.sobjects = d.sobjects;
      if (typeof d.describe === 'object' && d.describe !== null) testMock.describe = d.describe;
      if (typeof d.useRealApi === 'boolean') testMock.useRealApi = d.useRealApi;
      if (typeof d.activeProfileId === 'string') {
        testMock.activeProfileId = d.activeProfileId;
        activeProfileId = d.activeProfileId;
        setCurrentProfile(d.activeProfileId);
      }
      // 実APIモード: アクセストークンをメモリに注入（リロード前に設定しておく必要がある）
      if (testMock.useRealApi && typeof d.accessToken === 'string' && typeof d.instanceUrl === 'string' && activeProfileId) {
        injectTokenForTest(activeProfileId, d.accessToken, d.instanceUrl);
      }
    });
  }

  // 設定
  handle(IPC.LOAD_SETTINGS, async () => loadSettings());
  handle(IPC.SAVE_SETTINGS, async (settings) => saveSettings(settings as Parameters<typeof saveSettings>[0]));
  handle(IPC.LOAD_PROFILES, async () => {
    // テストモードでは testMock を唯一の真とする（実 store からの漏えいを防ぐ）。
    // ただし testMock.useRealApi が true のときだけは実 store を使う
    // （real-oauth.spec.ts 等、保存済み refresh_token を前提とする結合テスト用）。
    if (isTestMode && !testMock.useRealApi) return testMock.profiles;
    return loadProfiles();
  });
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
    if (isTestMode && !testMock.useRealApi) {
      // 隔離テスト: testMock + 明示注入されたメモリトークンのみで判断する。
      // 実 store の refresh_token を使った自動リフレッシュは行わない。
      if (testMock.activeProfileId === id && testMock.profiles.some(p => p.id === id)) {
        return 'connected';
      }
      return isConnected(id) ? 'connected' : 'disconnected';
    }
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
    if (isTestMode && !testMock.useRealApi) return testMock.sobjects;
    if (!activeProfileId) {
      throw new Error('プロファイルが選択されていません');
    }
    return listSObjects(activeProfileId);
  });

  handle(IPC.DESCRIBE_OBJECT, async (name) => {
    if (isTestMode && !testMock.useRealApi) {
      const objectName = String(name);
      return testMock.describe[objectName] ?? {
        name: objectName, label: objectName, labelPlural: objectName, fields: [], childRelationships: [],
      };
    }
    if (!activeProfileId) {
      throw new Error('プロファイルが選択されていません');
    }
    return describeObject(activeProfileId, String(name));
  });

  handle(IPC.QUERY, async (soql, maxRows) => {
    if (isTestMode && !testMock.useRealApi) return { totalSize: 0, done: true, records: [], fetchedCount: 0 };
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

  // SOQLファイル
  handle(IPC.SAVE_SOQL_FILE, async (soql, defaultName) => {
    const { filePath, canceled } = await dialog.showSaveDialog({
      defaultPath: `${String(defaultName)}.soql`,
      filters: [
        { name: 'SOQL ファイル', extensions: ['soql'] },
        { name: 'SQL ファイル', extensions: ['sql'] },
        { name: 'すべてのファイル', extensions: ['*'] },
      ],
    });
    if (canceled || !filePath) return;
    await writeFile(filePath, String(soql), 'utf-8');
  });

  handle(IPC.OPEN_SOQL_FILE, async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      filters: [
        { name: 'SOQL / SQL ファイル', extensions: ['soql', 'sql'] },
        { name: 'すべてのファイル', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0 || !filePaths[0]) return null;
    const content = await readFile(filePaths[0], 'utf-8');
    const baseName = filePaths[0].replace(/\\/g, '/').split('/').pop()?.replace(/\.(soql|sql)$/i, '') ?? 'クエリ';
    return { name: baseName, soql: content };
  });

  // ログ
  handle(IPC.GET_RECENT_LOGS, async () => getRecentLogs());

  // レンダラー → メインへのログ転送
  ipcMain.on(IPC.RENDERER_LOG, (_event, level: unknown, text: unknown) => {
    const lvl = String(level);
    const msg = `[Renderer] ${String(text)}`;
    if (lvl === 'error') { log.error(msg); }
    else if (lvl === 'warn') { log.warn(msg); }
    else if (lvl === 'info') { log.info(msg); }
    else { log.debug(msg); }
  });
};
