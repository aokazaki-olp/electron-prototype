/**
 * types.ts
 * @description Yahoo! Open Local Platform API レスポンス型定義
 */

export interface YahooAddressElement {
  Name: string;
  Kana: string;
  Level: string;
  Code: string;
}

export interface YahooGenre {
  Code: string;
  Name: string;
}

export interface YahooFeatureDetail {
  Tel1?: string;
  Tel2?: string;
  PostCode?: string;
  Genre?: YahooGenre[];
}

export interface YahooFeatureProperty {
  Address?: string;
  AddressElement?: YahooAddressElement[];
  GovernmentCode?: string;
  Detail?: YahooFeatureDetail;
}

export interface YahooGeometry {
  Type: string;
  Coordinates: string;
}

export interface YahooFeature {
  Id?: string;
  Name: string;
  Category?: string[];
  Geometry?: YahooGeometry;
  Property?: YahooFeatureProperty;
}

export interface YahooResultInfo {
  Count: number;
  Total: number;
  Start: number;
}

export interface YahooLocalSearchResponse {
  ResultInfo: YahooResultInfo;
  Feature?: YahooFeature[];
}

export interface YahooGeocoderProperty {
  Address?: string;
  AddressElement?: YahooAddressElement[];
  GovernmentCode?: string;
  Detail?: {
    PostCode?: string;
  };
}

export interface YahooGeocoderFeature {
  Id?: string;
  Name: string;
  Geometry?: YahooGeometry;
  Property?: YahooGeocoderProperty;
}

export interface YahooGeocoderResponse {
  ResultInfo: YahooResultInfo;
  Feature?: YahooGeocoderFeature[];
}
