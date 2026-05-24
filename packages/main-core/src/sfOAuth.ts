/**
 * sfOAuth.ts
 * @description Salesforce OAuth 2.0 Web Server Flow + PKCE (S256) + state
 */

import { createHash, randomBytes } from 'node:crypto';
import { URL } from 'node:url';
import { shell } from 'electron';
import { got } from 'got';
import { log } from './logger.js';
import { OAUTH_CALLBACK_URL } from './buildInfo.js';
import {
  saveRefreshToken,
  loadRefreshToken,
  saveInstanceUrl,
  loadInstanceUrl,
  getProfile,
  deleteRefreshToken,
} from './settings.js';

const REDIRECT_URI = OAUTH_CALLBACK_URL;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// アクセストークン・インスタンスURLをメモリで保持（profileId単位）
const accessTokenMap = new Map<string, string>();
const instanceUrlMemory = new Map<string, string>();

// ============================================================================
// PKCE ユーティリティ
// ============================================================================

const generateCodeVerifier = (): string =>
  randomBytes(64).toString('base64url').slice(0, 128);

const generateCodeChallenge = (verifier: string): string =>
  createHash('sha256').update(verifier).digest('base64url');

// ============================================================================
// OAuth フロー
// ============================================================================

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  instance_url: string;
  token_type: string;
}

const exchangeToken = async (
  loginUrl: string,
  clientId: string,
  params: Record<string, string>,
): Promise<TokenResponse> => {
  const tokenUrl = `${loginUrl}/services/oauth2/token`;

  const body: Record<string, string> = {
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    ...params,
  };

  const response = await got.post(tokenUrl, {
    form: body,
    throwHttpErrors: false,
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`トークン取得失敗 (HTTP ${response.statusCode}): ${response.body}`);
  }

  const parsed: unknown = JSON.parse(response.body);
  if (!isPlainObject(parsed)) {
    throw new Error('トークンレスポンスの形式が不正です');
  }
  if (
    typeof parsed['access_token'] !== 'string' ||
    typeof parsed['instance_url'] !== 'string' ||
    typeof parsed['token_type'] !== 'string'
  ) {
    throw new Error('トークンレスポンスの形式が不正です');
  }
  const refreshToken = parsed['refresh_token'];
  return {
    access_token: parsed['access_token'],
    instance_url: parsed['instance_url'],
    token_type: parsed['token_type'],
    refresh_token: typeof refreshToken === 'string' ? refreshToken : undefined,
  };
};

// ============================================================================
// カスタムURLスキームによるコールバック受け取り
// ============================================================================

interface PendingCallback {
  resolve: (code: string) => void;
  reject: (err: Error) => void;
  state: string;
  timer: ReturnType<typeof setTimeout>;
}

let pendingCallback: PendingCallback | null = null;

const clearPendingCallbackIf = (state: string): void => {
  if (pendingCallback?.state === state) {
    clearTimeout(pendingCallback.timer);
    pendingCallback = null;
  }
};

/**
 * OS から渡されたカスタム URL スキーム（例: `salesforce-explorer://callback?code=...`）を処理する。
 * `app.on('second-instance')` / `open-url` ハンドラから呼び出される。
 *
 * @param url - OS が受け取ったコールバック URL（クエリパラメータに `code` と `state` を含む）
 */
export const handleCallbackUrl = (url: string): void => {
  if (!pendingCallback) {
    log.warn('[OAuth] コールバックURLを受け取ったが待機中の認証がありません');
    return;
  }

  const { resolve, reject, state: expectedState, timer } = pendingCallback;
  pendingCallback = null;
  clearTimeout(timer);

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    reject(new Error(`コールバックURLの解析に失敗しました: ${url}`));
    return;
  }

  const error = parsed.searchParams.get('error');
  if (error) {
    const desc = parsed.searchParams.get('error_description') ?? error;
    reject(new Error(`OAuth エラー: ${desc}`));
    return;
  }

  const returnedState = parsed.searchParams.get('state');
  if (returnedState !== expectedState) {
    reject(new Error('state パラメータが一致しません (CSRF対策)'));
    return;
  }

  const code = parsed.searchParams.get('code');
  if (!code) {
    reject(new Error('認証コードが取得できませんでした'));
    return;
  }

  resolve(code);
};

const waitForCallback = (expectedState: string): Promise<string> =>
  new Promise((resolve, reject) => {
    // 前の認証が残っていたらキャンセル
    if (pendingCallback) {
      clearTimeout(pendingCallback.timer);
      pendingCallback.reject(new Error('新しい認証が開始されました'));
    }

    const timer = setTimeout(() => {
      if (pendingCallback?.state === expectedState) {
        pendingCallback = null;
        reject(new Error('OAuth 認証がタイムアウトしました (90秒)'));
      }
    }, 90 * 1000);

    pendingCallback = { resolve, reject, state: expectedState, timer };
    log.debug('[OAuth] コールバック待機開始');
  });

// ============================================================================
// 公開 API
// ============================================================================

/**
 * OAuth 2.0 Authorization Code + PKCE フローを開始する。
 * 外部ブラウザで Salesforce 認可ページを開き、カスタム URL スキームでコールバックを待ち受ける。
 *
 * @param profileId - 認証対象プロファイル ID
 * @throws {TypeError} `profileId` に該当するプロファイルが存在しない場合
 * @throws {Error} state 不一致 / コールバックタイムアウト (90秒) / トークン取得失敗 等
 */
export const startOAuth = async (profileId: string): Promise<void> => {
  const profile = getProfile(profileId);
  if (!profile) {
    throw new TypeError(`プロファイルが見つかりません: ${profileId}`);
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = randomBytes(32).toString('base64url');

  const authUrl = new URL(`${profile.loginUrl}/services/oauth2/authorize`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', profile.clientId);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('scope', 'api refresh_token');

  log.info(`[OAuth] 認証開始: profile=${profile.name}`);

  const callbackPromise = waitForCallback(state);

  // shell.openExternal の失敗時に pendingCallback がリークしないよう、
  // ここで明示的に try/catch して 90 秒タイムアウト待ちを避ける。
  try {
    await shell.openExternal(authUrl.toString());
  } catch (e) {
    clearPendingCallbackIf(state);
    throw e;
  }

  const code = await callbackPromise;

  const tokenRes = await exchangeToken(profile.loginUrl, profile.clientId, {
    grant_type: 'authorization_code',
    code,
    code_verifier: codeVerifier,
  });

  accessTokenMap.set(profileId, tokenRes.access_token);
  instanceUrlMemory.set(profileId, tokenRes.instance_url);
  saveInstanceUrl(profileId, tokenRes.instance_url);

  if (tokenRes.refresh_token) {
    saveRefreshToken(profileId, tokenRes.refresh_token);
  }

  log.info(`[OAuth] 認証成功: profile=${profile.name} instance=${tokenRes.instance_url}`);
};

/**
 * 保存済み refresh_token を使ってアクセストークンを更新する。
 *
 * @param profileId - 対象プロファイル ID
 * @returns 成功時 `true`、プロファイル不在 / refresh_token 不在 / リフレッシュ失敗時は `false`
 */
export const refreshAccessToken = async (profileId: string): Promise<boolean> => {
  const profile = getProfile(profileId);
  if (!profile) {
    return false;
  }

  const refreshToken = loadRefreshToken(profileId);
  if (!refreshToken) {
    return false;
  }

  try {
    const tokenRes = await exchangeToken(profile.loginUrl, profile.clientId, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    accessTokenMap.set(profileId, tokenRes.access_token);
    instanceUrlMemory.set(profileId, tokenRes.instance_url);

    // 新しいrefresh_tokenが発行された場合は上書き保存
    if (tokenRes.refresh_token) {
      saveRefreshToken(profileId, tokenRes.refresh_token);
    }

    log.info(`[OAuth] トークンリフレッシュ成功: profile=${profile.name}`);
    return true;
  } catch (e) {
    log.warn(`[OAuth] トークンリフレッシュ失敗: profile=${profile.name}`, e);
    return false;
  }
};

/**
 * 接続情報を破棄する（メモリ上のアクセストークン・instance URL と、永続化された refresh_token を削除）。
 *
 * @param profileId - 切断対象プロファイル ID
 */
export const disconnect = (profileId: string): void => {
  accessTokenMap.delete(profileId);
  instanceUrlMemory.delete(profileId);
  deleteRefreshToken(profileId);
  log.info(`[OAuth] 切断: profileId=${profileId}`);
};

/**
 * メモリ上に保持されているアクセストークンを取得する（renderer には絶対に渡さない）。
 *
 * @param profileId - 対象プロファイル ID
 * @returns アクセストークン文字列。未取得の場合は `null`
 */
export const getAccessToken = (profileId: string): string | null =>
  accessTokenMap.get(profileId) ?? null;

/**
 * プロファイルに紐づく Salesforce インスタンス URL を返す（メモリ → 永続ストアの順で参照）。
 *
 * @param profileId - 対象プロファイル ID
 * @returns My Domain URL。未取得の場合は `null`
 */
export const getInstanceUrl = (profileId: string): string | null =>
  instanceUrlMemory.get(profileId) ?? loadInstanceUrl(profileId);

/**
 * メモリ上にアクセストークンを保持しているかを返す（= 現プロセスで「接続済み」か）。
 *
 * @param profileId - 対象プロファイル ID
 */
export const isConnected = (profileId: string): boolean =>
  accessTokenMap.has(profileId);

/**
 * テストモード専用: アクセストークンを直接注入する。本番コードからは呼ばない。
 *
 * @param profileId - 対象プロファイル ID
 * @param accessToken - 注入するアクセストークン
 * @param instanceUrl - 注入する instance URL
 */
export const injectTokenForTest = (profileId: string, accessToken: string, instanceUrl: string): void => {
  accessTokenMap.set(profileId, accessToken);
  instanceUrlMemory.set(profileId, instanceUrl);
};
