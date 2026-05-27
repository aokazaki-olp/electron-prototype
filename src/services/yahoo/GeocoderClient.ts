/**
 * GeocoderClient.ts
 * @description Yahoo! ジオコーダAPI クライアント
 */

import { ApiClient } from '../../libs/ApiClient.js';
import { HttpCore } from '../../libs/HttpCore.js';
import type { Logger } from '../../libs/LoggerFacade.js';
import type { Transport } from '../../libs/httpTypes.js';
import type { YahooGeocoderResponse } from './types.js';

const BASE_URL = 'https://map.yahooapis.jp';
const GEOCODER_ENDPOINT = '/geocode/V1/geoCoder';
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 500;

export interface YahooGeocoderClientOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  logger?: Logger;
  transport?: Transport;
}

export interface GeocoderClient {
  geocode(query: string): Promise<YahooGeocoderResponse>;
}

/**
 * Yahoo! ジオコーダAPI クライアントを作成する
 *
 * @param appId - Yahoo! Developer Network アプリケーションID
 * @param options - オプション設定
 * @returns クライアント
 * @throws {TypeError} appId が空文字または string 以外の場合
 */
const create = (
  appId: string,
  options: YahooGeocoderClientOptions = {},
): GeocoderClient => {
  if (typeof appId !== 'string' || appId === '') {
    throw new TypeError('appId には Yahoo! Developer Network アプリケーションID (string) を指定してください');
  }

  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    logger,
    transport: injectedTransport,
  } = options;

  const baseClient = ApiClient.createClient<YahooGeocoderResponse>({
    baseUrl: BASE_URL,
    transport: injectedTransport ?? HttpCore.createTransport(),
    headers: { Accept: 'application/json' },
    logger,
    responseHandler: (response) => response.body as YahooGeocoderResponse,
  })
    .extend(t => HttpCore.withRetry(t, { maxRetries, baseDelayMs, logger }))
    .extend(t => HttpCore.withLogger(t, logger));

  return {
    geocode: (query: string) =>
      baseClient.get(GEOCODER_ENDPOINT, {
        appid: appId,
        output: 'json',
        query,
      }),
  };
};

export const YahooGeocoderClient = { create };
