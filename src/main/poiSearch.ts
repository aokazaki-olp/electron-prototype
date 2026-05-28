/**
 * poiSearch.ts
 * @description POI検索IPCハンドラ（Yahoo! ローカルサーチ + ジオコーダ）
 */

import { loadSettings } from './settings.js';
import { appLogger } from './logger.js';
import { YahooLocalSearchClient } from '../services/yahoo/LocalSearchClient.js';
import { YahooGeocoderClient } from '../services/yahoo/GeocoderClient.js';
import { mapLocalSearchResponse, mapGeocoderResponse } from '../services/yahoo/mapper.js';
import { HttpError } from '../libs/httpTypes.js';
import type { PoiCandidate, PoiQueryType, PoiSearchResult } from '../ipc/contract.js';

const ADDRESS_KEYWORDS = /[都道府県市区町村丁目番地号]/;
const POSTAL_CODE_PATTERN = /^\d{3}-?\d{4}$/;

const logApiError = (prefix: string, reason: unknown): void => {
  if (reason instanceof HttpError) {
    appLogger.warn(`${prefix}: HTTP ${reason.status} body=${JSON.stringify(reason.body)}`);
  } else {
    appLogger.warn(`${prefix}: ${String(reason)}`);
  }
};

const detectQueryType = (query: string): PoiQueryType => {
  if (POSTAL_CODE_PATTERN.test(query.trim()) || ADDRESS_KEYWORDS.test(query)) {
    return 'address';
  }
  return 'name';
};

/**
 * キーワードでPOIを検索する（ローカルサーチ・ジオコーダを並列実行）
 *
 * @param query - 企業名または住所文字列
 * @returns 候補リストとクエリ種別
 * @throws {TypeError} query が空文字または string 以外の場合
 * @throws {Error} Yahoo! AppIDが未設定の場合
 */
export const poiSearch = async (query: string): Promise<PoiSearchResult> => {
  if (typeof query !== 'string' || query.trim() === '') {
    throw new TypeError('query には空でない string を指定してください');
  }

  const settings = loadSettings();
  const appId = settings.yahooAppId ?? '';

  if (!appId) {
    throw new Error('Yahoo! AppIDが設定されていません。設定画面で yahooAppId を登録してください。');
  }

  const trimmedQuery = query.trim();
  const queryType = detectQueryType(trimmedQuery);

  const localClient = YahooLocalSearchClient.create(appId, { logger: appLogger });
  const geocoderClient = YahooGeocoderClient.create(appId, { logger: appLogger });

  const [localResult, geocoderResult] = await Promise.allSettled([
    localClient.search({ query: trimmedQuery, results: 10 }),
    geocoderClient.geocode(trimmedQuery),
  ]);

  const candidates: PoiCandidate[] = [];

  if (localResult.status === 'fulfilled') {
    candidates.push(...mapLocalSearchResponse(localResult.value));
  } else {
    logApiError('[POI] ローカルサーチ失敗', localResult.reason);
  }

  if (geocoderResult.status === 'fulfilled') {
    candidates.push(...mapGeocoderResponse(geocoderResult.value));
  } else {
    logApiError('[POI] ジオコーダ失敗', geocoderResult.reason);
  }

  return { candidates, queryType };
};
