/**
 * Confidence module: evaluates reliability based on station freshness and model snapshots.
 */
import { ConfidenceInfo, StationTrust } from '../../types';
import { parseIso } from './series';

export function evaluateStationStatus(
  latestReadingIso?: string | null,
  nowDt?: Date
): { status: 'LIVE' | 'STALE' | 'MISSING'; ageHours?: number } {
  if (!latestReadingIso) {
    return { status: 'MISSING' };
  }

  const refNow = nowDt ?? new Date();
  try {
    const readDt = parseIso(latestReadingIso);
    let diffHours = (refNow.getTime() - readDt.getTime()) / (1000 * 3600.0);
    if (diffHours < 0) diffHours = 0.0;

    const roundedAge = Math.round(diffHours * 10) / 10;
    if (diffHours <= 3.0) {
      return { status: 'LIVE', ageHours: roundedAge };
    }
    return { status: 'STALE', ageHours: roundedAge };
  } catch {
    return { status: 'MISSING' };
  }
}

export function evaluateConfidence(options: {
  stationSummaries: Array<{ name?: string; distance_km?: number; last_reading?: string }>;
  correctionApplied: boolean;
  snapshotAgeHours?: number;
  referenceTimeIso?: string;
}): ConfidenceInfo & { stations: StationTrust[] } {
  const {
    stationSummaries,
    correctionApplied,
    snapshotAgeHours = 0.5,
    referenceTimeIso,
  } = options;

  const nowDt = referenceTimeIso ? parseIso(referenceTimeIso) : new Date();

  let liveCount = 0;
  let staleCount = 0;
  const evaluatedStations: StationTrust[] = [];

  for (const s of stationSummaries) {
    const { status } = evaluateStationStatus(s.last_reading, nowDt);
    if (status === 'LIVE') {
      liveCount++;
    } else if (status === 'STALE') {
      staleCount++;
    }

    evaluatedStations.push({
      name: s.name ?? 'Unknown Station',
      distance_km: Math.round(Number(s.distance_km ?? 0.0) * 10) / 10,
      last_reading: s.last_reading,
      status,
    });
  }

  const reasons: string[] = [];
  let level: 'high' | 'medium' | 'low' = 'medium';
  const snapAge = snapshotAgeHours ?? 0.5;

  if (snapAge > 3.0) {
    level = 'low';
    reasons.push(`Model snapshot is ${Math.round(snapAge * 10) / 10} hours old (> 3 hours)`);
  } else if (liveCount >= 2 && correctionApplied) {
    level = 'high';
    reasons.push(`${liveCount} nearby ground stations live with CAMS calibration applied`);
  } else if (liveCount === 1) {
    level = 'medium';
    reasons.push('1 live ground station calibrating forecast');
  } else if (staleCount > 0) {
    level = 'medium';
    reasons.push(`${staleCount} nearby stations have stale readings (> 3h old)`);
  } else if (liveCount === 0 && staleCount === 0) {
    if (snapAge <= 3.0) {
      level = 'medium';
      reasons.push('No active ground stations nearby; relying on fresh CAMS atmospheric model');
    } else {
      level = 'low';
      reasons.push('No ground stations and model snapshot is stale');
    }
  }

  if (staleCount > 0 && liveCount > 0) {
    reasons.push(`${staleCount} of ${stationSummaries.length} stations stale`);
  }

  return {
    level,
    reasons,
    live_stations_count: liveCount,
    stale_stations_count: staleCount,
    total_stations: stationSummaries.length,
    snapshot_age_hours: snapAge,
    stations: evaluatedStations,
  };
}
