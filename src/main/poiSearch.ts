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
import type { PoiCandidate, PoiQueryType, PoiSearchOptions, PoiSearchResult } from '../ipc/contract.js';

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
 * @param options - 使用するAPIの選択
 * @returns 候補リストとクエリ種別
 * @throws {TypeError} query が空文字または string 以外の場合
 * @throws {Error} Yahoo! AppIDが未設定の場合
 */
export const poiSearch = async (query: string, options: PoiSearchOptions): Promise<PoiSearchResult> => {
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

  const candidates: PoiCandidate[] = [];

  const tasks: Promise<void>[] = [];

  if (options.useLocalSearch) {
    const localClient = YahooLocalSearchClient.create(appId, { logger: appLogger });
    tasks.push(
      localClient.search({ query: trimmedQuery, results: 10 }).then(
        res => { candidates.push(...mapLocalSearchResponse(res)); },
        reason => { logApiError('[POI] ローカルサーチ失敗', reason); },
      ),
    );
  }

  if (options.useGeocoder) {
    const geocoderClient = YahooGeocoderClient.create(appId, { logger: appLogger });
    tasks.push(
      geocoderClient.geocode(trimmedQuery).then(
        res => { candidates.push(...mapGeocoderResponse(res)); },
        reason => { logApiError('[POI] ジオコーダ失敗', reason); },
      ),
    );
  }

  await Promise.all(tasks);

  return { candidates, queryType };
};
