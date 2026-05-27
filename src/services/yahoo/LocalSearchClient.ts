/**
 * LocalSearchClient.ts
 * @description Yahoo! ローカルサーチAPI クライアント
 */

import { ApiClient } from '../../libs/ApiClient.js';
import { HttpCore } from '../../libs/HttpCore.js';
import type { Logger } from '../../libs/LoggerFacade.js';
import type { Transport } from '../../libs/httpTypes.js';
import type { YahooLocalSearchResponse } from './types.js';

const BASE_URL = 'https://map.yahooapis.jp';
const LOCAL_SEARCH_ENDPOINT = '/search/local/V1/localSearch';
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_RESULTS = 10;

export interface YahooLocalSearchClientOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  logger?: Logger;
  transport?: Transport;
}

export interface LocalSearchParams {
  query: string;
  results?: number;
}

export interface LocalSearchClient {
  search(params: LocalSearchParams): Promise<YahooLocalSearchResponse>;
}

/**
 * Yahoo! ローカルサーチAPI クライアントを作成する
 *
 * @param appId - Yahoo! Developer Network アプリケーションID
 * @param options - オプション設定
 * @returns クライアント
 * @throws {TypeError} appId が空文字または string 以外の場合
 */
const create = (
  appId: string,
  options: YahooLocalSearchClientOptions = {},
): LocalSearchClient => {
  if (typeof appId !== 'string' || appId === '') {
    throw new TypeError('appId には Yahoo! Developer Network アプリケーションID (string) を指定してください');
  }

  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    logger,
    transport: injectedTransport,
  } = options;

  const baseClient = ApiClient.createClient<YahooLocalSearchResponse>({
    baseUrl: BASE_URL,
    transport: injectedTransport ?? HttpCore.createTransport(),
    headers: { Accept: 'application/json' },
    logger,
    responseHandler: (response) => response.body as YahooLocalSearchResponse,
  })
    .extend(t => HttpCore.withRetry(t, { maxRetries, baseDelayMs, logger }))
    .extend(t => HttpCore.withLogger(t, logger));

  return {
    search: (params: LocalSearchParams) =>
      baseClient.get(LOCAL_SEARCH_ENDPOINT, {
        appid: appId,
        output: 'json',
        results: params.results ?? DEFAULT_RESULTS,
        query: params.query,
      }),
  };
};

export const YahooLocalSearchClient = { create };
