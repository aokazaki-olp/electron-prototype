/**
 * index.ts
 * @description @app/main-core のバレル。Electron main プロセスから利用する API を再エクスポートする。
 */

// ビルドターゲット情報
export { BUILD, OAUTH_CALLBACK_URL } from './buildInfo.js';
export type { BuildTarget, BuildInfo } from './buildInfo.js';

// ロガー
export { initLogger, initAuditLogger, log, getRecentLogs, auditLog, appLogger } from './logger.js';

// 設定永続化
export {
  loadSettings,
  saveSettings,
  loadProfiles,
  saveProfile,
  deleteProfile,
  getProfile,
  saveRefreshToken,
  loadRefreshToken,
  deleteRefreshToken,
  saveInstanceUrl,
  loadInstanceUrl,
} from './settings.js';

// OAuth
export {
  startOAuth,
  refreshAccessToken,
  disconnect,
  isConnected,
  handleCallbackUrl,
  getAccessToken,
  getInstanceUrl,
  injectTokenForTest,
} from './sfOAuth.js';

// Salesforce API
export {
  listSObjects,
  describeObject,
  query,
  createRecord,
  updateRecord,
  deleteRecord,
  setCurrentProfile,
  markWriteSession,
  clearWriteSession,
  clearDescribeCache,
  WRITE_REQUIRED,
} from './sfApi.js';

// エクスポート (CSV / Excel)
export { exportCsv, exportQueryExcel, exportObjectDefinition, toCsvBuffer } from './export.js';
