/**
 * India Geocoding & Reverse Geocoding Service.
 * Implements cascading providers:
 * 1. Photon (Komoot) autocomplete restricted to India BBox
 * 2. OSM Nominatim fallback (rate-limited to 1 req/sec, User-Agent compliant)
 * 3. Open-Meteo geocoding fallback
 * Plus reverse geocoding for GPS "Use My Location".
 */
import { LocationItem } from '../../types';
import { INDIA_BBOX, isWithinIndia } from './openMeteo';

const USER_AGENT = 'AirWindow/1.0 (India Clean Activity Planner; contact@airwindow.in)';

// In-memory short-lived cache (5-minute TTL)
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}
const searchCache = new Map<string, CacheEntry<LocationItem[]>>();
const reverseCache = new Map<string, CacheEntry<LocationItem>>();
const CACHE_TTL_MS = 5 * 60 * 1000;

// Nominatim 1-request-per-second rate limiter
let lastNominatimTime = 0;
async function throttleNominatim(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastNominatimTime;
  if (elapsed < 1100) {
    await new Promise((resolve) => setTimeout(resolve, 1100 - elapsed));
  }
  lastNominatimTime = Date.now();
}

function buildFormattedAddress(parts: {
  name: string;
  street?: string;
  locality?: string;
  district?: string;
  city?: string;
  state?: string;
  postcode?: string;
}): string {
  const chunks: string[] = [];
  if (parts.name) chunks.push(parts.name);
  if (parts.street && parts.street !== parts.name) chunks.push(parts.street);
  if (parts.locality && parts.locality !== parts.name && !chunks.includes(parts.locality)) chunks.push(parts.locality);
  if (parts.district && parts.district !== parts.name && !chunks.includes(parts.district)) chunks.push(parts.district);
  if (parts.city && parts.city !== parts.name && !chunks.includes(parts.city)) chunks.push(parts.city);
  if (parts.state && !chunks.includes(parts.state)) {
    if (parts.postcode) {
      chunks.push(`${parts.state} ${parts.postcode}`);
    } else {
      chunks.push(parts.state);
    }
  } else if (parts.postcode && !chunks.some((c) => c.includes(parts.postcode!))) {
    chunks.push(parts.postcode);
  }
  return chunks.join(', ');
}

/**
 * Photon geocoding query
 */
async function searchPhoton(query: string, limit: number = 8): Promise<LocationItem[]> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=${limit}&bbox=68.0,6.0,98.0,37.0`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`Photon returned HTTP ${res.status}`);
  const data = await res.json();
  const results: LocationItem[] = [];

  for (const feature of data.features || []) {
    const props = feature.properties || {};
    const [lon, lat] = feature.geometry?.coordinates || [0, 0];

    if (!isWithinIndia(lat, lon)) continue;
    const countryCode = String(props.countrycode || props.country || '').toUpperCase();
    if (countryCode && countryCode !== 'IN' && countryCode !== 'INDIA') continue;

    const name = props.name || props.street || props.city || query;
    const locality = props.district || props.suburb || props.locality;
    const city = props.city || props.town || props.county;
    const state = props.state;
    const postcode = props.postcode;

    const fullAddress = buildFormattedAddress({
      name,
      street: props.street,
      locality,
      district: props.district,
      city,
      state,
      postcode,
    });

    results.push({
      name,
      admin: state || city || 'India',
      locality: locality || undefined,
      district: props.district || undefined,
      state: state || undefined,
      postcode: postcode || undefined,
      full_address: fullAddress,
      lat: Math.round(lat * 10000) / 10000,
      lon: Math.round(lon * 10000) / 10000,
    });
  }

  return results;
}

/**
 * OpenStreetMap Nominatim search fallback
 */
async function searchNominatim(query: string, limit: number = 8): Promise<LocationItem[]> {
  await throttleNominatim();
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&countrycodes=in&limit=${limit}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) throw new Error(`Nominatim returned HTTP ${res.status}`);
  const data = await res.json();
  const results: LocationItem[] = [];

  for (const item of data || []) {
    const lat = parseFloat(item.lat);
    const lon = parseFloat(item.lon);
    if (!isWithinIndia(lat, lon)) continue;

    const addr = item.address || {};
    const name = item.name || addr.suburb || addr.neighbourhood || addr.city || query;
    const state = addr.state;
    const city = addr.city || addr.town || addr.county;
    const postcode = addr.postcode;
    const locality = addr.suburb || addr.neighbourhood || addr.road;
    const district = addr.state_district || addr.county;

    const fullAddress = item.display_name || buildFormattedAddress({
      name,
      locality,
      district,
      city,
      state,
      postcode,
    });

    results.push({
      name,
      admin: state || city || 'India',
      locality: locality || undefined,
      district: district || undefined,
      state: state || undefined,
      postcode: postcode || undefined,
      full_address: fullAddress,
      lat: Math.round(lat * 10000) / 10000,
      lon: Math.round(lon * 10000) / 10000,
    });
  }

  return results;
}

/**
 * Open-Meteo geocoding fallback
 */
async function searchOpenMeteo(query: string, limit: number = 8): Promise<LocationItem[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=${limit}&language=en&format=json`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`Open-Meteo returned HTTP ${res.status}`);
  const data = await res.json();
  const results: LocationItem[] = [];

  for (const item of data.results || []) {
    const lat = Number(item.latitude ?? 0.0);
    const lon = Number(item.longitude ?? 0.0);
    const countryCode = String(item.country_code ?? '').toUpperCase();
    if (countryCode !== 'IN' && !isWithinIndia(lat, lon)) continue;

    const name = item.name;
    const state = item.admin1;
    const city = item.admin2 || item.admin3;
    const fullAddress = `${name}${state ? ', ' + state : ''}, India`;

    results.push({
      name,
      admin: state || 'India',
      state: state || undefined,
      district: city || undefined,
      full_address: fullAddress,
      lat: Math.round(lat * 10000) / 10000,
      lon: Math.round(lon * 10000) / 10000,
    });
  }

  return results;
}

/**
 * Main geocode entrypoint with 3-tier cascade and short-lived caching
 */
export async function geocodeLocation(query: string): Promise<LocationItem[]> {
  const cleanQ = query.trim().toLowerCase();
  if (!cleanQ || cleanQ.length < 3) return [];

  // Check cache
  const cached = searchCache.get(cleanQ);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  let results: LocationItem[] = [];

  // 1. Try Photon
  try {
    results = await searchPhoton(query);
  } catch (err) {
    console.warn('Photon geocoding failed, trying Nominatim fallback:', err);
  }

  // 2. Fallback to Nominatim if Photon yielded nothing
  if (results.length === 0) {
    try {
      results = await searchNominatim(query);
    } catch (err) {
      console.warn('Nominatim geocoding failed, trying Open-Meteo fallback:', err);
    }
  }

  // 3. Fallback to Open-Meteo if Nominatim yielded nothing
  if (results.length === 0) {
    try {
      results = await searchOpenMeteo(query);
    } catch (err) {
      console.warn('Open-Meteo geocoding failed:', err);
    }
  }

  // Deduplicate results by rounded coordinates
  const seen = new Set<string>();
  const deduped: LocationItem[] = [];
  for (const item of results) {
    const key = `${Math.round(item.lat * 100)},${Math.round(item.lon * 100)}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
  }

  searchCache.set(cleanQ, { data: deduped, timestamp: Date.now() });
  return deduped;
}

/**
 * Reverse geocoding for GPS coordinates
 */
export async function reverseGeocode(lat: number, lon: number): Promise<LocationItem> {
  if (!isWithinIndia(lat, lon)) {
    throw new Error('Coordinates are outside India (Lat 6-37, Lon 68-98).');
  }

  const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const cached = reverseCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  // 1. Try Nominatim reverse
  try {
    await throttleNominatim();
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(7000),
    });
    if (res.ok) {
      const data = await res.json();
      const addr = data.address || {};
      const name = addr.suburb || addr.neighbourhood || addr.road || addr.village || addr.city || 'Your Location';
      const locality = addr.suburb || addr.neighbourhood;
      const district = addr.state_district || addr.county;
      const city = addr.city || addr.town || addr.village;
      const state = addr.state;
      const postcode = addr.postcode;

      const locItem: LocationItem = {
        name,
        admin: state || city || 'India',
        locality: locality || undefined,
        district: district || undefined,
        state: state || undefined,
        postcode: postcode || undefined,
        full_address: data.display_name || buildFormattedAddress({ name, locality, district, city, state, postcode }),
        lat: Math.round(lat * 10000) / 10000,
        lon: Math.round(lon * 10000) / 10000,
      };

      reverseCache.set(cacheKey, { data: locItem, timestamp: Date.now() });
      return locItem;
    }
  } catch (err) {
    console.warn('Nominatim reverse failed, trying Photon reverse:', err);
  }

  // 2. Try Photon reverse fallback
  try {
    const url = `https://photon.komoot.io/reverse?lon=${lon}&lat=${lat}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const data = await res.json();
      const props = data.features?.[0]?.properties || {};
      const name = props.name || props.street || props.district || props.city || 'Your Location';
      const fullAddress = buildFormattedAddress({
        name,
        street: props.street,
        locality: props.district,
        district: props.district,
        city: props.city,
        state: props.state,
        postcode: props.postcode,
      });

      const locItem: LocationItem = {
        name,
        admin: props.state || props.city || 'India',
        locality: props.district || undefined,
        state: props.state || undefined,
        postcode: props.postcode || undefined,
        full_address: fullAddress,
        lat: Math.round(lat * 10000) / 10000,
        lon: Math.round(lon * 10000) / 10000,
      };

      reverseCache.set(cacheKey, { data: locItem, timestamp: Date.now() });
      return locItem;
    }
  } catch (err) {
    console.warn('Photon reverse failed:', err);
  }

  // Generic fallback if both network reverse services fail
  const fallbackItem: LocationItem = {
    name: `Location (${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E)`,
    admin: 'India',
    full_address: `Latitude: ${lat.toFixed(4)}, Longitude: ${lon.toFixed(4)}, India`,
    lat: Math.round(lat * 10000) / 10000,
    lon: Math.round(lon * 10000) / 10000,
  };
  return fallbackItem;
}
