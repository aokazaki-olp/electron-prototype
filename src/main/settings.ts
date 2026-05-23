/**
 * settings.ts
 * @description プロファイル管理・アプリ設定の永続化（electron-store + safeStorage）
 */

import { safeStorage } from 'electron';
import Store from 'electron-store';
import { BUILD } from './buildInfo.js';
import type { AppSettings, SfConnectionProfile } from '../ipc/contract.js';

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

export const loadSettings = (): AppSettings =>
  store.get('settings', DEFAULT_SETTINGS);

export const saveSettings = (settings: AppSettings): void => {
  store.set('settings', settings);
};

// ============================================================================
// プロファイル管理
// ============================================================================

export const loadProfiles = (): SfConnectionProfile[] =>
  store.get('profiles', []);

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

export const deleteProfile = (id: string): void => {
  const profiles = loadProfiles().filter(p => p.id !== id);
  store.set('profiles', profiles);
  deleteRefreshToken(id);
};

export const getProfile = (id: string): SfConnectionProfile | undefined =>
  loadProfiles().find(p => p.id === id);

// ============================================================================
// トークン管理（safeStorage + electron-store）
// ============================================================================

export const saveRefreshToken = (profileId: string, token: string): void => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('safeStorage が利用できません');
  }
  const encrypted = safeStorage.encryptString(token);
  const tokens = store.get('tokens', {});
  tokens[profileId] = encrypted.toString('base64');
  store.set('tokens', tokens);
};

export const loadRefreshToken = (profileId: string): string | null => {
  if (!safeStorage.isEncryptionAvailable()) {
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

export const deleteRefreshToken = (profileId: string): void => {
  const tokens = store.get('tokens', {});
  delete tokens[profileId];
  store.set('tokens', tokens);
};

export const saveInstanceUrl = (profileId: string, instanceUrl: string): void => {
  const urls = store.get('instanceUrls', {});
  urls[profileId] = instanceUrl;
  store.set('instanceUrls', urls);
};

export const loadInstanceUrl = (profileId: string): string | null => {
  const urls = store.get('instanceUrls', {});
  return urls[profileId] ?? null;
};
