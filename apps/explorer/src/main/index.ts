/**
 * main/index.ts
 * @description Electronメインプロセス — BrowserWindow生成・IPC登録
 */

import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join, resolve } from 'node:path';
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
  loadSoqlTabs,
  saveSoqlTabs,
  handleCallbackUrl,
  startOAuth,
  refreshAccessToken,
  disconnect,
  isConnected,
  injectTokenForTest,
  listSObjects,
  describeObject,
  query,
  bulkQuery,
  createRecord,
  updateRecord,
  deleteRecord,
  setCurrentProfile,
  getCurrentProfile,
  requireCurrentProfile,
  markWriteSession,
  clearWriteSession,
  exportCsv,
  exportQueryExcel,
  exportObjectDefinition,
} from '@app/main-core';
import {
  IPC,
  assertAppSettings,
  assertCsvExportOptions,
  assertLogLevel,
  assertNumber,
  assertProfile,
  assertRecord,
  assertRecordArray,
  assertSoqlTabsState,
  assertString,
  assertStringArray,
} from '@app/ipc-contract';
import type { LogEntry, SfConnectionProfile, SObjectSummary, SObjectDescribe } from '@app/ipc-contract';

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
  // E2E から SOQL タブ初期状態を inject する経路
  tabs: import('@app/ipc-contract').SoqlTabsState | null;
  // E2E から実 SF を叩かないクエリのレスポンスを inject する経路
  queryResult: import('@app/ipc-contract').QueryResult | null;
  // E2E から「クエリは必ず失敗する」モードを有効化
  queryError: string | null;
};

const testMock: TestMockStore = {
  profiles: [],
  activeProfileId: null,
  sobjects: [],
  describe: {},
  useRealApi: false,
  tabs: null,
  queryResult: null,
  queryError: null,
};

// ============================================================================
// シングルインスタンス + カスタムURLスキーム
// ============================================================================

// Windows: 2つ目の起動を防ぎ、URLを最初のインスタンスに転送する。
// テストモードでも必ずロックを取得する。
// OAuth コールバック時に OS が別プロセスを起動するが、ロックがあれば
// second-instance イベント経由でこのプロセスに URL が転送される。
// workers: 1 で実行しているため並列競合は起きない。
//
// app.exit(0) を使うのは、app.quit() が非同期で完了する間に後続コードが走ってしまう事故を避けるため。
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
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
// ウィンドウ
// ============================================================================

let mainWindow: BrowserWindow | null = null;

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:']);

const openExternalSafely = (url: string): void => {
  try {
    const u = new URL(url);
    if (ALLOWED_EXTERNAL_PROTOCOLS.has(u.protocol)) {
      void shell.openExternal(url);
    } else {
      log.warn(`[Security] 許可されていない URL スキームを拒否: ${u.protocol}`);
    }
  } catch {
    log.warn(`[Security] 不正な URL を拒否: ${url}`);
  }
};

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

  // window.open は外部ブラウザに飛ばす（http/https のみ allowlist）
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

// 全 webContents に対し、renderer 起点のナビゲーションを防ぐ多層防御。
// dev 時の hot reload は ELECTRON_RENDERER_URL への navigate を許容する必要があるため、
// ターゲットが既存の loadURL/loadFile 先と一致するかをチェックする。
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    try {
      const target = new URL(navigationUrl);
      const allowed = process.env['ELECTRON_RENDERER_URL'];
      if (allowed && navigationUrl.startsWith(allowed)) {
        return; // dev サーバへの初回 loadURL は通す
      }
      if (target.protocol === 'file:') {
        return; // 本番ビルドの loadFile を通す
      }
      event.preventDefault();
      openExternalSafely(navigationUrl);
    } catch {
      event.preventDefault();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ============================================================================
// エラーシリアライズ（機密情報を renderer に漏らさない）
// ============================================================================

const serializeError = (e: unknown): Error => {
  if (e instanceof Error) {
    const err = new Error(e.message);
    // §11.5 stack は renderer に渡さない（app.log に残すのは catch 側の責務）
    err.stack = undefined;
    return err;
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
      // §11.5: full stack は app.log にのみ残し、renderer には message のみ
      log.error(`[IPC] ${channel} 失敗`, e);
      throw serializeError(e);
    }
  });
};

// ============================================================================
// IPC ハンドラ登録
// ============================================================================
//
// 設計方針: renderer → main の IPC payload は preload 経由で型付けされて来るが、
// CODING_RULES §4.3「外部入力は unknown + 型ガード」に従い、すべてのハンドラで
// @app/ipc-contract の assert*** ガードを通してから main-core を呼ぶ。
// preload を信頼しすぎる多層防御の欠落を防ぐ。

const registerIpcHandlers = (): void => {
  // テストモード専用: テスト用モックデータをセットアップするチャンネル
  if (isTestMode) {
    ipcMain.handle('test:setup', (_event, data: unknown) => {
      if (typeof data !== 'object' || data === null || Array.isArray(data)) return;
      const d = data as Record<string, unknown>;
      if (Array.isArray(d['profiles'])) testMock.profiles = d['profiles'] as TestMockStore['profiles'];
      if (Array.isArray(d['sobjects'])) testMock.sobjects = d['sobjects'] as TestMockStore['sobjects'];
      const describe = d['describe'];
      if (typeof describe === 'object' && describe !== null && !Array.isArray(describe)) {
        testMock.describe = describe as TestMockStore['describe'];
      }
      if (typeof d['useRealApi'] === 'boolean') testMock.useRealApi = d['useRealApi'];
      const activeProfileIdRaw = d['activeProfileId'];
      if (typeof activeProfileIdRaw === 'string') {
        testMock.activeProfileId = activeProfileIdRaw;
        setCurrentProfile(activeProfileIdRaw);
      }
      const accessToken = d['accessToken'];
      const instanceUrl = d['instanceUrl'];
      const currentProfileId = getCurrentProfile();
      if (testMock.useRealApi && typeof accessToken === 'string' && typeof instanceUrl === 'string' && currentProfileId) {
        injectTokenForTest(currentProfileId, accessToken, instanceUrl);
      }
      // SOQL タブ初期状態の inject（隔離テスト用）
      const tabs = d['tabs'];
      if (tabs === null) {
        testMock.tabs = null;
      } else if (typeof tabs === 'object' && tabs !== null && !Array.isArray(tabs)) {
        testMock.tabs = tabs as TestMockStore['tabs'];
      }
      // クエリレスポンスの inject
      const queryResult = d['queryResult'];
      if (queryResult === null) {
        testMock.queryResult = null;
      } else if (typeof queryResult === 'object' && queryResult !== null && !Array.isArray(queryResult)) {
        testMock.queryResult = queryResult as TestMockStore['queryResult'];
      }
      const queryError = d['queryError'];
      if (queryError === null || typeof queryError === 'string') {
        testMock.queryError = queryError;
      }
    });
  }

  // 設定
  // テストモード（!useRealApi）では実 electron-store を汚染しないよう、
  // 全ての書き込み系も testMock 内に閉じ込める。
  let mockSettings = { defaultMaxRows: 2000 };

  handle(IPC.LOAD_SETTINGS, async () => {
    if (isTestMode && !testMock.useRealApi) return mockSettings;
    return loadSettings();
  });
  handle(IPC.SAVE_SETTINGS, async (settings) => {
    assertAppSettings(settings);
    if (isTestMode && !testMock.useRealApi) {
      mockSettings = settings;
      return;
    }
    saveSettings(settings);
  });
  handle(IPC.LOAD_PROFILES, async () => {
    // テストモードでは testMock を唯一の真とする（実 store からの漏えいを防ぐ）。
    // ただし testMock.useRealApi が true のときだけは実 store を使う
    // （real-oauth.spec.ts 等、保存済み refresh_token を前提とする結合テスト用）。
    if (isTestMode && !testMock.useRealApi) return testMock.profiles;
    return loadProfiles();
  });
  handle(IPC.SAVE_PROFILE, async (profile) => {
    assertProfile(profile);
    if (isTestMode && !testMock.useRealApi) {
      const idx = testMock.profiles.findIndex(p => p.id === profile.id);
      if (idx >= 0) testMock.profiles[idx] = profile;
      else testMock.profiles.push(profile);
      return;
    }
    saveProfile(profile);
  });
  handle(IPC.DELETE_PROFILE, async (id) => {
    assertString(id);
    if (isTestMode && !testMock.useRealApi) {
      testMock.profiles = testMock.profiles.filter(p => p.id !== id);
      return;
    }
    deleteProfile(id);
  });

  // 認証
  handle(IPC.START_OAUTH, async (profileId) => {
    assertString(profileId);
    await startOAuth(profileId);
    setCurrentProfile(profileId);
  });

  handle(IPC.REAUTH_FOR_WRITE, async (profileId) => {
    assertString(profileId);
    await startOAuth(profileId);
    markWriteSession(profileId);
  });

  handle(IPC.DISCONNECT, async (profileId) => {
    assertString(profileId);
    disconnect(profileId);
    clearWriteSession(profileId);
    if (getCurrentProfile() === profileId) {
      setCurrentProfile(null);
    }
  });

  handle(IPC.GET_AUTH_STATE, async (profileId) => {
    assertString(profileId);
    if (isTestMode && !testMock.useRealApi) {
      // 隔離テスト: testMock + 明示注入されたメモリトークンのみで判断する。
      // 実 store の refresh_token を使った自動リフレッシュは行わない。
      if (testMock.activeProfileId === profileId && testMock.profiles.some(p => p.id === profileId)) {
        return 'connected';
      }
      return isConnected(profileId) ? 'connected' : 'disconnected';
    }
    if (isConnected(profileId)) {
      return 'connected';
    }
    // refresh_token があれば自動リフレッシュを試みる
    const refreshed = await refreshAccessToken(profileId);
    if (refreshed) {
      setCurrentProfile(profileId);
      return 'connected';
    }
    return 'disconnected';
  });

  // SF API（読み取り）
  handle(IPC.LIST_SOBJECTS, async () => {
    if (isTestMode && !testMock.useRealApi) return testMock.sobjects;
    return listSObjects(requireCurrentProfile());
  });

  handle(IPC.DESCRIBE_OBJECT, async (name) => {
    assertString(name);
    if (isTestMode && !testMock.useRealApi) {
      return testMock.describe[name] ?? {
        name, label: name, labelPlural: name, fields: [], childRelationships: [],
      };
    }
    return describeObject(requireCurrentProfile(), name);
  });

  handle(IPC.QUERY, async (soql, maxRows) => {
    assertString(soql);
    assertNumber(maxRows);
    if (isTestMode && !testMock.useRealApi) {
      if (testMock.queryError != null) {
        throw new Error(testMock.queryError);
      }
      if (testMock.queryResult != null) {
        return testMock.queryResult;
      }
      return { totalSize: 0, done: true, records: [], fetchedCount: 0 };
    }
    return query(requireCurrentProfile(), soql, maxRows);
  });

  handle(IPC.BULK_QUERY, async (soql) => {
    assertString(soql);
    if (isTestMode && !testMock.useRealApi) {
      // テストモードでは REST と同じ testMock を使う（フロー検証目的）
      if (testMock.queryError != null) {
        throw new Error(testMock.queryError);
      }
      if (testMock.queryResult != null) {
        return testMock.queryResult;
      }
      return { totalSize: 0, done: true, records: [], fetchedCount: 0 };
    }
    return bulkQuery(requireCurrentProfile(), soql);
  });

  // SF API（書き込み）
  handle(IPC.CREATE_RECORD, async (objectName, fields) => {
    assertString(objectName);
    assertRecord(fields);
    return createRecord(requireCurrentProfile(), objectName, fields);
  });

  handle(IPC.UPDATE_RECORD, async (objectName, id, fields) => {
    assertString(objectName);
    assertString(id);
    assertRecord(fields);
    return updateRecord(requireCurrentProfile(), objectName, id, fields);
  });

  handle(IPC.DELETE_RECORD, async (objectName, id) => {
    assertString(objectName);
    assertString(id);
    return deleteRecord(requireCurrentProfile(), objectName, id);
  });

  // エクスポート
  handle(IPC.EXPORT_CSV, async (records, columns, options) => {
    assertRecordArray(records);
    assertStringArray(columns);
    assertCsvExportOptions(options);
    return exportCsv(records, columns, options);
  });

  handle(IPC.EXPORT_QUERY_EXCEL, async (records, columns) => {
    assertRecordArray(records);
    assertStringArray(columns);
    return exportQueryExcel(records, columns);
  });

  handle(IPC.EXPORT_OBJECT_DEFINITION, async (objectName) => {
    assertString(objectName);
    return exportObjectDefinition(requireCurrentProfile(), objectName);
  });

  // SOQLファイル
  handle(IPC.SAVE_SOQL_FILE, async (soql, defaultName) => {
    assertString(soql);
    assertString(defaultName);
    // defaultName のパス区切り・予約文字を _ に置換し、長すぎる場合は切り詰める
    const safeName = defaultName.replace(/[\\/:*?"<>|]/g, '_').slice(0, 100) || 'クエリ';
    const { filePath, canceled } = await dialog.showSaveDialog({
      defaultPath: `${safeName}.soql`,
      filters: [
        { name: 'SOQL ファイル', extensions: ['soql'] },
        { name: 'SQL ファイル', extensions: ['sql'] },
        { name: 'すべてのファイル', extensions: ['*'] },
      ],
    });
    if (canceled || !filePath) return;
    await writeFile(filePath, soql, 'utf-8');
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
    const path = filePaths[0];
    const content = await readFile(path, 'utf-8');
    const baseName = basename(path).replace(/\.(soql|sql)$/i, '') || 'クエリ';
    return { name: baseName, soql: content };
  });

  // SOQL タブ永続化（CODING_RULES §7.3 遵守: renderer の localStorage を使わない）
  handle(IPC.LOAD_TABS, async () => {
    // 隔離テスト: testMock.tabs を一次ソースとし、実 store からの漏れを防ぐ
    if (isTestMode && !testMock.useRealApi) return testMock.tabs;
    return loadSoqlTabs();
  });
  handle(IPC.SAVE_TABS, async (state) => {
    assertSoqlTabsState(state);
    if (isTestMode && !testMock.useRealApi) {
      // 隔離テストでは testMock のみ更新し、実 store は汚染しない
      testMock.tabs = state;
      return;
    }
    saveSoqlTabs(state);
  });

  // ログ
  handle(IPC.GET_RECENT_LOGS, async () => getRecentLogs());

  // レンダラー → メインへのログ転送
  ipcMain.on(IPC.RENDERER_LOG, (_event, level: unknown, text: unknown) => {
    const msg = `[Renderer] ${String(text)}`;
    let lvl: 'error' | 'warn' | 'info' | 'debug';
    try {
      assertLogLevel(level);
      lvl = level;
    } catch {
      lvl = 'debug';
    }
    switch (lvl) {
      case 'error': log.error(msg); break;
      case 'warn':  log.warn(msg);  break;
      case 'info':  log.info(msg);  break;
      case 'debug': log.debug(msg); break;
      default: log.debug(msg);
    }
  });
};

// ============================================================================
// 起動シーケンス
// ============================================================================

// Electron のトップレベル起動シーケンスを async/await に統一する
void (async () => {
  await app.whenReady();

  // ログ初期化（broadcaster は mainWindow が生成された後に webContents.send で renderer に流す）
  initLogger((entry: LogEntry) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC.LOG_ENTRY, entry);
    }
  });
  initAuditLogger();

  // process.defaultApp で開発/本番を判別し、本番 portable ビルドでは execPath のみで登録する。
  // argv[1] が undefined / '.' のときに resolve('') = CWD が登録される事故を避ける。
  if (process.platform === 'win32') {
    if (process.defaultApp && process.argv.length >= 2 && process.argv[1]) {
      app.setAsDefaultProtocolClient(BUILD.urlScheme, process.execPath, [resolve(process.argv[1])]);
    } else {
      app.setAsDefaultProtocolClient(BUILD.urlScheme);
    }
  } else {
    app.setAsDefaultProtocolClient(BUILD.urlScheme);
  }

  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
})();
