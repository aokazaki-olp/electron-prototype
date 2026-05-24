/**
 * settings.ts
 * @description プロファイル管理・アプリ設定の永続化（electron-store + safeStorage）
 */

import { safeStorage } from 'electron';
import Store from 'electron-store';
import { BUILD } from './buildInfo.js';
import { log } from './logger.js';
import type { AppSettings, SfConnectionProfile } from '@app/ipc-contract';

interface StoreSchema {
  settings: AppSettings;
  profiles: SfConnectionProfile[];
  // profileId → base64エンコードされたsafeStorage暗号化済みrefresh_token
  tokens: Record<string, string>;
  // profileId → instance_url（平文）
  instanceUrls: Record<string, string>;
}

const DEFAULT_SETTINGS: AppSettings = {
  defaultMaxRows: 2000,
  logBufferSize: 1000,
  paneSizes: {
    leftPanel: 18,
    soqlPanel: 40,
  },
  theme: 'system',
};

const store = new Store<StoreSchema>({
  name: BUILD.storeName,
  defaults: {
    settings: DEFAULT_SETTINGS,
    profiles: [],
    tokens: {},
    instanceUrls: {},
  },
});

// ============================================================================
// アプリ設定
// ============================================================================

/**
 * 永続化されたアプリ設定を読み出す。未保存の場合は既定値を返す。
 *
 * @returns 現在のアプリ設定
 */
export const loadSettings = (): AppSettings => {
  // 過去バージョンの store には新しいフィールド (例: logBufferSize) が無い可能性があるため、
  // DEFAULT_SETTINGS と merge して欠けたキーを補完する。schema migration の代替策。
  const stored = store.get('settings', DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
};

/**
 * アプリ設定を永続化する（全体を上書き）。
 *
 * @param settings - 保存する設定オブジェクト
 */
export const saveSettings = (settings: AppSettings): void => {
  store.set('settings', settings);
};

// ============================================================================
// プロファイル管理
// ============================================================================

/**
 * 登録済みプロファイル一覧を返す。
 *
 * @returns プロファイル配列（登録順）
 */
export const loadProfiles = (): SfConnectionProfile[] =>
  store.get('profiles', []);

/**
 * プロファイルを upsert する（同一 ID が存在すれば上書き、なければ追加）。
 *
 * @param profile - 保存するプロファイル
 */
export const saveProfile = (profile: SfConnectionProfile): void => {
  const profiles = loadProfiles();
  const index = profiles.findIndex(p => p.id === profile.id);
  if (index >= 0) {
    profiles[index] = profile;
  } else {
    profiles.push(profile);
  }
  store.set('profiles', profiles);
};

/**
 * プロファイルと、それに紐づく refresh_token を削除する。
 *
 * @param id - 削除対象プロファイル ID
 */
export const deleteProfile = (id: string): void => {
  const profiles = loadProfiles().filter(p => p.id !== id);
  store.set('profiles', profiles);
  deleteRefreshToken(id);
};

/**
 * 指定 ID のプロファイルを取得する。
 *
 * @param id - プロファイル ID
 * @returns 該当プロファイル。存在しない場合は `undefined`
 */
export const getProfile = (id: string): SfConnectionProfile | undefined =>
  loadProfiles().find(p => p.id === id);

// ============================================================================
// SOQL タブ永続化（CODING_RULES §7.3 遵守: renderer で localStorage を使わない）
// ============================================================================

import type { ColumnSizesState, SoqlTabsState } from '@app/ipc-contract';

interface TabStoreSchema {
  soqlTabs: SoqlTabsState | null;
  columnSizes: ColumnSizesState;
}

const tabStore = new Store<TabStoreSchema>({
  name: `${BUILD.storeName}-tabs`,
  defaults: { soqlTabs: null, columnSizes: {} },
});

/**
 * 永続化済みの SOQL タブ状態を読み出す。
 *
 * @returns 保存済みのタブ一覧と activeTabId。未保存の場合は `null`
 */
export const loadSoqlTabs = (): SoqlTabsState | null =>
  tabStore.get('soqlTabs', null);

/**
 * SOQL タブ状態を永続化する（全体上書き）。
 *
 * @param state - 保存するタブ一覧と activeTabId
 */
export const saveSoqlTabs = (state: SoqlTabsState): void => {
  tabStore.set('soqlTabs', state);
};

/**
 * 結果テーブルの列幅マップを読み出す。
 *
 * @returns sObject 別 / フィールド別の列幅マップ。未保存の場合は空オブジェクト
 */
export const loadColumnSizes = (): ColumnSizesState =>
  tabStore.get('columnSizes', {});

/**
 * 結果テーブルの列幅マップを永続化する（全体上書き）。
 *
 * @param state - sObject 別 / フィールド別の列幅マップ
 * @remarks 数千 sObject × 数十 field を持つ大規模 org で長期使用すると Map が肥大化する。
 *   現状は上限カット等の自動 eviction は実装せず、超過時に log.warn で気付かせる方針。
 */
const COLUMN_SIZES_WARN_BYTES = 5 * 1024 * 1024; // 5MB

export const saveColumnSizes = (state: ColumnSizesState): void => {
  // 想定外肥大化の早期検出: JSON.stringify は同期だが、保存対象を 1 回しか直列化しないので軽量。
  // 5MB 超は通常使用では起こらないため、起きていれば実装側の漏れ (例: ノイズキー追加) の手掛かりになる。
  try {
    const size = JSON.stringify(state).length;
    if (size > COLUMN_SIZES_WARN_BYTES) {
      log.warn(`[Settings] columnSizes が ${(size / 1024 / 1024).toFixed(2)}MB に達しています。古い sObject エントリの整理を検討してください。`);
    }
  } catch {
    // JSON 化失敗は store.set 側でも同様に失敗するため、ここで握りつぶす
  }
  tabStore.set('columnSizes', state);
};

// ============================================================================
// トークン管理（safeStorage + electron-store）
// ============================================================================

let safeStorageWarned = false;

const warnSafeStorageOnce = (): void => {
  if (safeStorageWarned) {
    return;
  }
  safeStorageWarned = true;
  log.warn(
    '[Settings] safeStorage が利用できません。refresh_token は永続化されず、再起動後に再認証が必要です。' +
    ' Linux で libsecret 等の Secret Service が不在の可能性があります。',
  );
};

/**
 * テスト専用: 警告フラグをリセットする。本番コードからは呼ばない。
 */
export const _resetSafeStorageWarnForTest = (): void => {
  safeStorageWarned = false;
};

/**
 * refresh_token を OS の safeStorage で暗号化して永続化する。
 *
 * @param profileId - 対象プロファイル ID
 * @param token - 保存する refresh_token（平文）
 * @throws {Error} safeStorage が利用不能な環境（暗号化キーが取得できない等）
 */
export const saveRefreshToken = (profileId: string, token: string): void => {
  if (!safeStorage.isEncryptionAvailable()) {
    warnSafeStorageOnce();
    throw new Error('safeStorage が利用できません');
  }
  const encrypted = safeStorage.encryptString(token);
  const tokens = store.get('tokens', {});
  tokens[profileId] = encrypted.toString('base64');
  store.set('tokens', tokens);
};

/**
 * 保存済み refresh_token を取り出して復号する。
 *
 * @param profileId - 対象プロファイル ID
 * @returns 復号した refresh_token。safeStorage 利用不能・未保存・復号失敗時は `null`
 */
export const loadRefreshToken = (profileId: string): string | null => {
  if (!safeStorage.isEncryptionAvailable()) {
    warnSafeStorageOnce();
    return null;
  }
  const tokens = store.get('tokens', {});
  const base64 = tokens[profileId];
  if (!base64) {
    return null;
  }
  try {
    return safeStorage.decryptString(Buffer.from(base64, 'base64'));
  } catch {
    return null;
  }
};

/**
 * 保存済み refresh_token を削除する。
 *
 * @param profileId - 対象プロファイル ID
 */
export const deleteRefreshToken = (profileId: string): void => {
  const tokens = store.get('tokens', {});
  delete tokens[profileId];
  store.set('tokens', tokens);
};

/**
 * Salesforce instance URL（My Domain URL）を永続化する。
 *
 * @param profileId - 対象プロファイル ID
 * @param instanceUrl - 保存する instance URL
 */
export const saveInstanceUrl = (profileId: string, instanceUrl: string): void => {
  const urls = store.get('instanceUrls', {});
  urls[profileId] = instanceUrl;
  store.set('instanceUrls', urls);
};

/**
 * 永続化された Salesforce instance URL を読み出す。
 *
 * @param profileId - 対象プロファイル ID
 * @returns instance URL。未保存の場合は `null`
 */
export const loadInstanceUrl = (profileId: string): string | null => {
  const urls = store.get('instanceUrls', {});
  return urls[profileId] ?? null;
};
