/**
 * contract.ts
 * @description IPC型契約 — main / preload / renderer の三者で共有する
 */

// ============================================================================
// 設定
// ============================================================================

export interface AppSettings {
  yahooAppId?: string;
}

// ============================================================================
// POI検索
// ============================================================================

export interface PoiAddressFields {
  prefecture: string;
  city: string;
  oaza: string;
  aza: string;
  detail1: string;
  detail2: string;
  building: string;
}

export type PoiSource = 'yahoo-local' | 'yahoo-geocoder';

export type PoiQueryType = 'name' | 'address' | 'ambiguous';

export interface PoiCandidate {
  id: string;
  officialName: string;
  postalCode: string;
  fullAddress: string;
  address: PoiAddressFields;
  phone: string;
  lat: number | null;
  lon: number | null;
  source: PoiSource;
  filledCount: number;
  rawJson: string;
}

export interface PoiSearchOptions {
  useLocalSearch: boolean;
  useGeocoder: boolean;
}

export interface PoiSearchResult {
  candidates: PoiCandidate[];
  queryType: PoiQueryType;
}

// ============================================================================
// IPC チャンネル定数
// ============================================================================

export const IPC = {
  LOAD_SETTINGS: 'settings:load',
  SAVE_SETTINGS: 'settings:save',
  POI_SEARCH: 'poi:search',
} as const;

// ============================================================================
// preload 経由で renderer に公開する API 型
// ============================================================================

export interface AppApi {
  loadSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<void>;
  poiSearch(query: string, options: PoiSearchOptions): Promise<PoiSearchResult>;
}

declare global {
  interface Window {
    sfx: AppApi;
  }
}
