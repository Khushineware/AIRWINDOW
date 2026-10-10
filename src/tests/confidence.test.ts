import { evaluateConfidence, evaluateStationStatus } from '../server/core/confidence';

export function runConfidenceTests() {
  console.log('Running Confidence Tests...');

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 1 * 3600 * 1000).toISOString();
  const fourHoursAgo = new Date(now.getTime() - 4 * 3600 * 1000).toISOString();

  const { status: statusLive } = evaluateStationStatus(oneHourAgo, now);
  if (statusLive !== 'LIVE') {
    throw new Error(`Expected LIVE status, got ${statusLive}`);
  }

  const { status: statusStale } = evaluateStationStatus(fourHoursAgo, now);
  if (statusStale !== 'STALE') {
    throw new Error(`Expected STALE status, got ${statusStale}`);
  }

  const { status: statusMissing } = evaluateStationStatus(null, now);
  if (statusMissing !== 'MISSING') {
    throw new Error(`Expected MISSING status, got ${statusMissing}`);
  }

  // Rule 1: High = >= 2 LIVE stations and correction applied
  const confHigh = evaluateConfidence({
    stationSummaries: [
      { name: 'S1', last_reading: oneHourAgo },
      { name: 'S2', last_reading: oneHourAgo },
    ],
    correctionApplied: true,
    snapshotAgeHours: 0.5,
    referenceTimeIso: now.toISOString(),
  });
  if (confHigh.level !== 'high') {
    throw new Error(`Expected high confidence, got ${confHigh.level}`);
  }

  // Rule 2: Medium = 1 LIVE station
  const confMed1 = evaluateConfidence({
    stationSummaries: [{ name: 'S1', last_reading: oneHourAgo }],
    correctionApplied: false,
    snapshotAgeHours: 0.5,
    referenceTimeIso: now.toISOString(),
  });
  if (confMed1.level !== 'medium') {
    throw new Error(`Expected medium confidence for 1 station, got ${confMed1.level}`);
  }

  // Rule 3: Medium = stations stale
  const confMed2 = evaluateConfidence({
    stationSummaries: [{ name: 'S1', last_reading: fourHoursAgo }],
    correctionApplied: false,
    snapshotAgeHours: 0.5,
    referenceTimeIso: now.toISOString(),
  });
  if (confMed2.level !== 'medium') {
    throw new Error(`Expected medium confidence for stale station, got ${confMed2.level}`);
  }

  // Rule 4: Low = snapshot older than 3 hours
  const confLow = evaluateConfidence({
    stationSummaries: [],
    correctionApplied: false,
    snapshotAgeHours: 4.5,
    referenceTimeIso: now.toISOString(),
  });
  if (confLow.level !== 'low') {
    throw new Error(`Expected low confidence for old snapshot, got ${confLow.level}`);
  }

  console.log('✓ Confidence Tests Passed');
}
