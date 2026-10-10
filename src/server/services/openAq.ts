/**
 * OpenAQ v3 client: queries nearby continuous monitoring stations for PM2.5 ground observations.
 * Uses OpenAQ API v3 exclusively with X-API-Key authentication.
 */
import { GroundObservation } from '../core/correction';

export interface StationSummary {
  name: string;
  distance_km: number;
  last_reading?: string;
  status: 'LIVE' | 'STALE' | 'MISSING';
}

export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const r = 6371.0; // Earth radius in km
  const toRad = (deg: number) => (deg * Math.PI) / 180.0;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2.0) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2.0) ** 2;
  const c = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(1.0 - a));
  return r * c;
}

export async function fetchNearbyStations(
  lat: number,
  lon: number,
  radiusKm: number = 25.0
): Promise<{ stationSummaries: StationSummary[]; observations: GroundObservation[] }> {
  const apiKey = (process.env.OPENAQ_API_KEY || '').trim();

  // If no API key is provided, gracefully return empty to fall back to raw model forecast
  if (!apiKey) {
    return { stationSummaries: [], observations: [] };
  }

  const headers: Record<string, string> = {
    'User-Agent': 'AirWindow/1.0 (Air Quality Calibration; contact@airwindow.in)',
    'X-API-Key': apiKey,
  };

  // OpenAQ v3 locations query
  const radiusMeters = Math.floor(radiusKm * 1000);
  const params = new URLSearchParams({
    coordinates: `${lat},${lon}`,
    radius: String(radiusMeters),
    limit: '10',
  });
  const url = `https://api.openaq.org/v3/locations?${params.toString()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);

  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) {
      return { stationSummaries: [], observations: [] };
    }
    const data = await res.json();
    const results = (data?.results || []) as Array<{
      id: number;
      name: string;
      coordinates?: { latitude?: number; longitude?: number };
      sensors?: Array<{ id: number; name?: string; parameter?: { id?: number; name?: string } }>;
      datetimeLast?: { utc?: string };
    }>;

    const stationSummaries: StationSummary[] = [];
    const observations: GroundObservation[] = [];
    const now = Date.now();

    // Query latest values for up to 5 nearest locations
    const candidateLocations = results.slice(0, 5);

    const latestPromises = candidateLocations.map(async (loc) => {
      const pm25Sensor = loc.sensors?.find(
        (s) => s.parameter?.name?.toLowerCase() === 'pm25' || s.name?.toLowerCase().includes('pm25')
      );
      if (!pm25Sensor) {
        return { loc, pm25Reading: null };
      }

      try {
        const latestRes = await fetch(`https://api.openaq.org/v3/locations/${loc.id}/latest`, {
          headers,
          signal: AbortSignal.timeout(4000),
        });
        if (!latestRes.ok) return { loc, pm25Reading: null };
        const latestData = await latestRes.json();
        const records = (latestData?.results || []) as Array<{
          sensorsId?: number;
          value?: number;
          datetime?: { utc?: string };
        }>;
        const matchingRecord = records.find((r) => r.sensorsId === pm25Sensor.id);
        return {
          loc,
          pm25Reading: matchingRecord || null,
        };
      } catch {
        return { loc, pm25Reading: null };
      }
    });

    const settled = await Promise.allSettled(latestPromises);

    for (const itemResult of settled) {
      if (itemResult.status !== 'fulfilled') continue;
      const { loc, pm25Reading } = itemResult.value;

      const coords = loc.coordinates || {};
      const stLat = coords.latitude;
      const stLon = coords.longitude;
      const dist =
        stLat !== undefined && stLon !== undefined
          ? haversineDistanceKm(lat, lon, Number(stLat), Number(stLon))
          : 0;

      const stId = String(loc.id ?? loc.name ?? 'station');
      const stName = loc.name || `Station ${stId}`;

      const readingTimeStr = pm25Reading?.datetime?.utc || loc.datetimeLast?.utc;
      let status: 'LIVE' | 'STALE' | 'MISSING' = 'MISSING';

      if (readingTimeStr) {
        const readingMs = new Date(readingTimeStr).getTime();
        const ageHours = (now - readingMs) / (1000 * 60 * 60);
        status = ageHours <= 24 ? 'LIVE' : 'STALE';
      }

      stationSummaries.push({
        name: stName,
        distance_km: Math.round(dist * 10) / 10,
        last_reading: readingTimeStr,
        status,
      });

      if (
        status === 'LIVE' &&
        pm25Reading &&
        typeof pm25Reading.value === 'number' &&
        pm25Reading.value >= 0
      ) {
        observations.push({
          station_id: stId,
          distance_km: Math.round(dist * 10) / 10,
          time: readingTimeStr!,
          pm25: pm25Reading.value,
        });
      }
    }

    return { stationSummaries, observations };
  } catch {
    // Graceful fallback to raw model forecast
    return { stationSummaries: [], observations: [] };
  } finally {
    clearTimeout(timer);
  }
}
