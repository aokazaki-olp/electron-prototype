/**
 * mapper.ts
 * @description Yahoo! API Feature → PoiCandidate マッパー
 */

import type { PoiAddressFields, PoiCandidate } from '../../ipc/contract.js';
import type {
  YahooAddressElement,
  YahooFeature,
  YahooGeocoderFeature,
  YahooGeocoderResponse,
  YahooLocalSearchResponse,
} from './types.js';

export const POI_TOTAL_FIELDS = 10;

const extractAddressFields = (elements: YahooAddressElement[]): PoiAddressFields => {
  const fields: PoiAddressFields = {
    prefecture: '',
    city: '',
    oaza: '',
    aza: '',
    detail1: '',
    detail2: '',
    building: '',
  };

  for (const el of elements) {
    switch (el.Level) {
      case 'prefecture':
        fields.prefecture = el.Name;
        break;
      case 'city':
        fields.city = el.Name;
        break;
      case 'oaza':
        fields.oaza = el.Name;
        break;
      case 'aza':
        fields.aza = el.Name;
        break;
      case 'detail1':
        fields.detail1 = el.Name;
        break;
      case 'detail2':
        fields.detail2 = el.Name;
        break;
      default:
        break;
    }
  }

  return fields;
};

const countFilledFields = (
  officialName: string,
  postalCode: string,
  phone: string,
  address: PoiAddressFields,
): number => {
  const values = [
    officialName,
    postalCode,
    address.prefecture,
    address.city,
    address.oaza,
    address.aza,
    address.detail1,
    address.detail2,
    address.building,
    phone,
  ];
  return values.filter(v => v !== '').length;
};

const parseCoordinates = (coords?: string): { lat: number | null; lon: number | null } => {
  if (!coords) {
    return { lat: null, lon: null };
  }
  const parts = coords.split(',');
  if (parts.length < 2) {
    return { lat: null, lon: null };
  }
  const lon = parseFloat(parts[0]);
  const lat = parseFloat(parts[1]);
  return {
    lon: isNaN(lon) ? null : lon,
    lat: isNaN(lat) ? null : lat,
  };
};

export const mapLocalSearchFeature = (feature: YahooFeature, index: number): PoiCandidate => {
  const elements = feature.Property?.AddressElement ?? [];
  const address = extractAddressFields(elements);
  const postalCode = feature.Property?.Detail?.PostCode ?? '';
  const phone = feature.Property?.Detail?.Tel1 ?? '';
  const { lat, lon } = parseCoordinates(feature.Geometry?.Coordinates);
  const officialName = feature.Name ?? '';

  return {
    id: feature.Id ?? `local-${index}`,
    officialName,
    postalCode,
    address,
    phone,
    lat,
    lon,
    source: 'yahoo-local',
    filledCount: countFilledFields(officialName, postalCode, phone, address),
    rawJson: JSON.stringify(feature, null, 2),
  };
};

export const mapGeocoderFeature = (feature: YahooGeocoderFeature, index: number): PoiCandidate => {
  const elements = feature.Property?.AddressElement ?? [];
  const address = extractAddressFields(elements);
  const postalCode = feature.Property?.Detail?.PostCode ?? '';
  const { lat, lon } = parseCoordinates(feature.Geometry?.Coordinates);
  const officialName = feature.Name ?? '';

  return {
    id: feature.Id ?? `geocoder-${index}`,
    officialName,
    postalCode,
    address,
    phone: '',
    lat,
    lon,
    source: 'yahoo-geocoder',
    filledCount: countFilledFields(officialName, postalCode, '', address),
    rawJson: JSON.stringify(feature, null, 2),
  };
};

export const mapLocalSearchResponse = (response: YahooLocalSearchResponse): PoiCandidate[] => {
  if (!Array.isArray(response.Feature)) {
    return [];
  }
  return response.Feature.map((f, i) => mapLocalSearchFeature(f, i));
};

export const mapGeocoderResponse = (response: YahooGeocoderResponse): PoiCandidate[] => {
  if (!Array.isArray(response.Feature)) {
    return [];
  }
  return response.Feature.map((f, i) => mapGeocoderFeature(f, i));
};
