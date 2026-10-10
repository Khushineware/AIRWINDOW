/**
 * Correction module: calibrates CAMS numerical model forecasts against OpenAQ ground observations.
 */
import { SeriesPoint } from '../../types';
import { classifyCpcb, parseIso } from './series';

export interface GroundObservation {
  station_id: string;
  distance_km: number;
  time: string;
  pm25: number;
}

export interface CorrectionInfo {
  ratio: number;
  method: string;
  qualifying_stations: number;
  total_active_stations: number;
  matched_pairs: number;
  reasons: string[];
}

export function calculateMedian(values: number[]): number {
  if (!values || values.length === 0) return 0.0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2.0;
}

export function correct(
  series: SeriesPoint[],
  observations: GroundObservation[],
  referenceTimeIso?: string
): [SeriesPoint[], CorrectionInfo] {
  const nowDt = referenceTimeIso ? parseIso(referenceTimeIso) : new Date();
  const last24hDt = new Date(nowDt.getTime() - 24 * 60 * 60 * 1000);

  // Filter observations: within 25 km and within last 24 hours
  const validStationsReadings = new Map<string, Array<{ dt: Date; pm25: number }>>();

  for (const obs of observations) {
    const dist = Number(obs.distance_km ?? 999.0);
    if (dist > 25.0) continue;

    let obsDt: Date;
    try {
      obsDt = parseIso(obs.time);
    } catch {
      continue;
    }

    if (obsDt >= last24hDt && obsDt <= nowDt) {
      const stId = String(obs.station_id ?? 'default');
      if (!validStationsReadings.has(stId)) {
        validStationsReadings.set(stId, []);
      }
      validStationsReadings.get(stId)!.push({
        dt: obsDt,
        pm25: Number(obs.pm25),
      });
    }
  }

  // Check if at least 1 station has >= 12 hourly readings in the last 24h
  const qualifyingStations: string[] = [];
  for (const [stId, rds] of validStationsReadings.entries()) {
    if (rds.length >= 12) {
      qualifyingStations.push(stId);
    }
  }

  let ratio = 1.0;
  let method = 'uncalibrated_cams';
  const reasons: string[] = [];
  let matchedPairsCount = 0;

  if (qualifyingStations.length > 0) {
    // Build quick lookup of CAMS hourly values by hour key: YYYY-MM-DDTHH
    const camsHourLookup = new Map<string, number>();
    for (const pt of series) {
      try {
        const ptDt = parseIso(pt.time);
        const hourKey = ptDt.toISOString().substring(0, 13);
        const rawV = pt.pm25_raw !== undefined ? pt.pm25_raw : pt.pm25;
        camsHourLookup.set(hourKey, Number(rawV));
      } catch {
        continue;
      }
    }

    const obsVals: number[] = [];
    const camsVals: number[] = [];

    for (const st of qualifyingStations) {
      const readings = validStationsReadings.get(st) || [];
      for (const r of readings) {
        const hKey = r.dt.toISOString().substring(0, 13);
        if (camsHourLookup.has(hKey)) {
          obsVals.push(r.pm25);
          camsVals.push(camsHourLookup.get(hKey)!);
        }
      }
    }

    matchedPairsCount = obsVals.length;

    if (obsVals.length > 0 && camsVals.length > 0) {
      const obsMed = calculateMedian(obsVals);
      const camsMed = calculateMedian(camsVals);

      if (camsMed > 5.0 && obsMed > 0.0) {
        const rawRatio = obsMed / camsMed;
        // Clamp ratio between 0.6 and 1.6
        ratio = Math.max(0.6, Math.min(1.6, rawRatio));
        method = 'ratio_v1_median_clamped';
      } else {
        reasons.push('CAMS median too low for stable ratio calculation');
      }
    } else {
      reasons.push('No coincident forecast-observation timestamp pairs found in past 24h');
    }
  } else {
    reasons.push('No OpenAQ stations within 25 km with >= 12 hourly readings in last 24h');
  }

  const ratioApplied = Math.round(ratio * 1000) / 1000;
  const calibratedSeries: SeriesPoint[] = [];

  for (const pt of series) {
    const rawVal = Number(pt.pm25_raw !== undefined ? pt.pm25_raw : pt.pm25);
    const ptDt = parseIso(pt.time);

    let calVal: number;
    if (ptDt >= nowDt) {
      calVal = Math.round(rawVal * ratioApplied * 10) / 10;
    } else {
      calVal = Math.round(rawVal * 10) / 10;
    }

    calibratedSeries.push({
      time: pt.time,
      pm25: calVal,
      pm25_raw: Math.round(rawVal * 10) / 10,
      temp_c: pt.temp_c,
      category: classifyCpcb(calVal),
    });
  }

  const info: CorrectionInfo = {
    ratio: ratioApplied,
    method,
    qualifying_stations: qualifyingStations.length,
    total_active_stations: validStationsReadings.size,
    matched_pairs: matchedPairsCount,
    reasons,
  };

  return [calibratedSeries, info];
}
