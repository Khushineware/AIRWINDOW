/**
 * Open-Meteo client: fetches air quality (CAMS), weather forecasts, and geocoded locations.
 */
import { LocationItem } from '../../types';

export const INDIA_BBOX = {
  min_lat: 6.0,
  max_lat: 37.0,
  min_lon: 68.0,
  max_lon: 98.0,
};

export function isWithinIndia(lat: number, lon: number): boolean {
  return (
    lat >= INDIA_BBOX.min_lat &&
    lat <= INDIA_BBOX.max_lat &&
    lon >= INDIA_BBOX.min_lon &&
    lon <= INDIA_BBOX.max_lon
  );
}

async function httpGetJson<T>(url: string, timeoutMs: number = 8000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'AirWindow/1.0 (India Clean Activity Planner; contact@airwindow.in)',
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status} fetching ${url}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function searchLocations(query: string, limit: number = 8): Promise<LocationItem[]> {
  const cleanQ = query.trim();
  if (!cleanQ || cleanQ.length < 2) {
    return [];
  }

  const params = new URLSearchParams({
    name: cleanQ,
    count: String(limit),
    language: 'en',
    format: 'json',
  });
  const url = `https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`;

  const data = await httpGetJson<any>(url);
  const results: LocationItem[] = [];

  for (const item of data?.results || []) {
    const lat = Number(item.latitude ?? 0.0);
    const lon = Number(item.longitude ?? 0.0);
    const countryCode = String(item.country_code ?? '').toUpperCase();

    if (countryCode === 'IN' || isWithinIndia(lat, lon)) {
      results.push({
        name: item.name,
        admin: item.admin1 || item.admin2 || item.country || 'India',
        lat: Math.round(lat * 10000) / 10000,
        lon: Math.round(lon * 10000) / 10000,
      });
    }
  }

  return results;
}

export async function fetchCamsPm25(lat: number, lon: number): Promise<any> {
  if (!isWithinIndia(lat, lon)) {
    throw new Error(`Coordinates (${lat}, ${lon}) outside India coverage`);
  }

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: 'pm2_5',
    timezone: 'Asia/Kolkata',
    past_days: '2',
    forecast_days: '2',
  });
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?${params.toString()}`;
  return httpGetJson<any>(url);
}

export async function fetchWeatherForecast(lat: number, lon: number): Promise<any> {
  if (!isWithinIndia(lat, lon)) {
    throw new Error(`Coordinates (${lat}, ${lon}) outside India coverage`);
  }

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: 'temperature_2m',
    timezone: 'Asia/Kolkata',
    past_days: '2',
    forecast_days: '2',
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  return httpGetJson<any>(url);
}

export async function fetchAlignedForecast(
  lat: number,
  lon: number
): Promise<{ times: string[]; pm25s: number[]; temps: number[] }> {
  const [aqData, wxData] = await Promise.all([
    fetchCamsPm25(lat, lon),
    fetchWeatherForecast(lat, lon),
  ]);

  const aqHourly = aqData?.hourly || {};
  const wxHourly = wxData?.hourly || {};

  const aqTimes: string[] = aqHourly.time || [];
  const aqPm25: Array<number | null> = aqHourly.pm2_5 || [];

  const wxTimes: string[] = wxHourly.time || [];
  const wxTemps: Array<number | null> = wxHourly.temperature_2m || [];

  const tempLookup = new Map<string, number>();
  for (let i = 0; i < wxTimes.length; i++) {
    const t = wxTimes[i];
    const val = wxTemps[i];
    if (val !== null && val !== undefined) {
      tempLookup.set(t, val);
    }
  }

  const times: string[] = [];
  const pm25s: number[] = [];
  const temps: number[] = [];

  for (let i = 0; i < aqTimes.length; i++) {
    const t = aqTimes[i];
    const p = aqPm25[i];
    if (p === null || p === undefined) continue;

    const tempVal = tempLookup.get(t) ?? 25.0;
    times.push(t);
    pm25s.push(Number(p));
    temps.push(Number(tempVal));
  }

  return { times, pm25s, temps };
}
