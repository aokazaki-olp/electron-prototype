/**
 * sfOAuth.ts
 * @description Salesforce OAuth 2.0 Web Server Flow + PKCE (S256) + state
 */

import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { URL } from 'node:url';
import { shell } from 'electron';
import { log } from './logger.js';
import {
  saveRefreshToken,
  loadRefreshToken,
  saveInstanceUrl,
  loadInstanceUrl,
  getProfile,
  deleteRefreshToken,
} from './settings.js';

const CALLBACK_PORT = 8787;
const CALLBACK_PATH = '/callback';
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}`;

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
  const { got } = await import('got');
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
  if (
    typeof parsed !== 'object' || parsed === null ||
    !('access_token' in parsed) || !('instance_url' in parsed)
  ) {
    throw new Error('トークンレスポンスの形式が不正です');
  }

  return parsed as TokenResponse;
};

// ============================================================================
// コールバックサーバー
// ============================================================================

const waitForCallback = (expectedState: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      if (!req.url) {
        return;
      }

      const url = new URL(req.url, `http://localhost:${CALLBACK_PORT}`);
      if (url.pathname !== CALLBACK_PATH) {
        res.writeHead(404);
        res.end();
        return;
      }

      const returnedState = url.searchParams.get('state');
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      const html = (msg: string) =>
        `<html><body><p>${msg}</p><script>window.close()</script></body></html>`;

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html(`認証エラー: ${error}`));
        server.close();
        reject(new Error(`OAuth エラー: ${error}`));
        return;
      }

      if (returnedState !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html('state不一致 — 認証を中断しました'));
        server.close();
        reject(new Error('state パラメータが一致しません (CSRF対策)'));
        return;
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html('認証コードが取得できませんでした'));
        server.close();
        reject(new Error('認証コードが取得できませんでした'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html('認証完了。このタブを閉じてください。'));
      server.close();
      resolve(code);
    });

    server.listen(CALLBACK_PORT, 'localhost', () => {
      log.debug(`[OAuth] コールバックサーバー起動: port=${CALLBACK_PORT}`);
    });

    server.on('error', (e) => {
      reject(new Error(`コールバックサーバー起動失敗: ${e.message} (ポート${CALLBACK_PORT}が使用中の可能性があります)`));
    });

    // 5分でタイムアウト
    setTimeout(() => {
      server.close();
      reject(new Error('OAuth 認証がタイムアウトしました (5分)'));
    }, 5 * 60 * 1000);
  });

// ============================================================================
// 公開 API
// ============================================================================

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
  await shell.openExternal(authUrl.toString());

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

export const disconnect = (profileId: string): void => {
  accessTokenMap.delete(profileId);
  instanceUrlMemory.delete(profileId);
  deleteRefreshToken(profileId);
  log.info(`[OAuth] 切断: profileId=${profileId}`);
};

export const getAccessToken = (profileId: string): string | null =>
  accessTokenMap.get(profileId) ?? null;

export const getInstanceUrl = (profileId: string): string | null =>
  instanceUrlMemory.get(profileId) ?? loadInstanceUrl(profileId);

export const isConnected = (profileId: string): boolean =>
  accessTokenMap.has(profileId);
