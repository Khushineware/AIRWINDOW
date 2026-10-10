/**
 * Optimizer module: slides duration window to find the cleanest outdoor activity time.
 */
import { Slot, BaselineSlot, SeriesPoint } from '../../types';
import { computeDoseUg, getProfileWeight, MODEL_CONFIG } from './exposure';
import { parseIso } from './series';

export class NoFeasibleSlotError extends Error {
  code = 'NO_FEASIBLE_SLOT';
  constructor(message: string) {
    super(message);
    this.name = 'NoFeasibleSlotError';
  }
}

export function roundUpTo15Minutes(dt: Date): Date {
  const d = new Date(dt.getTime());
  d.setSeconds(0, 0);
  const mins = d.getMinutes();
  const remainder = mins % 15;
  if (remainder === 0) return d;
  d.setMinutes(mins + (15 - remainder));
  return d;
}

export function formatSlotLabel(startDt: Date, endDt: Date): string {
  const sHour = startDt.getHours() % 12 || 12;
  const sMin = startDt.getMinutes().toString().padStart(2, '0');
  const sAmpm = startDt.getHours() < 12 ? 'AM' : 'PM';

  const eHour = endDt.getHours() % 12 || 12;
  const eMin = endDt.getMinutes().toString().padStart(2, '0');
  const eAmpm = endDt.getHours() < 12 ? 'AM' : 'PM';

  if (sAmpm === eAmpm) {
    return `${sHour}:${sMin} – ${eHour}:${eMin} ${eAmpm}`;
  }
  return `${sHour}:${sMin} ${sAmpm} – ${eHour}:${eMin} ${eAmpm}`;
}

interface CandidateSlot {
  index: number;
  startDt: Date;
  endDt: Date;
  start: string;
  end: string;
  label: string;
  dose_ug: number;
  temp_c: number;
  heat_penalty: number;
  rank_metric: number;
  avg_pm25: number;
  exposure_score: number;
}

export interface OptimizeResult {
  best: Slot;
  baseline: BaselineSlot;
  alternatives: Slot[];
  candidates_count: number;
}

export function optimizeSchedule(options: {
  series: SeriesPoint[];
  activity: string;
  duration_min: number;
  window_start: string;
  window_end: string;
  profile?: string;
  usual_time?: string;
  mask?: boolean;
  now_iso?: string;
}): OptimizeResult {
  const {
    series,
    activity,
    duration_min,
    window_start,
    window_end,
    profile = 'adult',
    usual_time,
    mask = false,
    now_iso,
  } = options;

  if (duration_min < 15 || duration_min > 120) {
    throw new Error('duration_min must be between 15 and 120 minutes');
  }

  const numSteps = Math.max(1, Math.floor(duration_min / 15));
  const heatThresh = MODEL_CONFIG.heat_threshold_c;
  const heatPenaltyRate = MODEL_CONFIG.heat_penalty_per_c;
  const pWeight = getProfileWeight(profile);

  let wStartDt = parseIso(window_start);
  const wEndDt = parseIso(window_end);

  if (now_iso) {
    const curNow = parseIso(now_iso);
    const earliestStart = roundUpTo15Minutes(curNow);
    if (wStartDt < earliestStart) {
      wStartDt = earliestStart;
    }
  }

  if (wStartDt >= wEndDt) {
    throw new NoFeasibleSlotError('Search window start must precede window end after clipping to current time.');
  }

  const seriesPoints = series.map((pt) => ({
    dt: parseIso(pt.time),
    raw: pt,
  }));

  const candidates: CandidateSlot[] = [];
  const n = seriesPoints.length;

  for (let i = 0; i <= n - numSteps; i++) {
    const slotStartDt = seriesPoints[i].dt;
    const slotEndDt = new Date(slotStartDt.getTime() + duration_min * 60 * 1000);

    if (slotStartDt < wStartDt) continue;
    if (slotEndDt > wEndDt) continue;

    const slotPts = seriesPoints.slice(i, i + numSteps);
    const pm25Vals = slotPts.map((p) => p.raw.pm25);
    const tempVals = slotPts.map((p) => p.raw.temp_c);

    const doseUg = computeDoseUg(pm25Vals, activity, mask);
    const maxTemp = tempVals.length ? Math.max(...tempVals) : 25.0;
    const heatPenalty = Math.max(0.0, maxTemp - heatThresh) * heatPenaltyRate;
    const rankMetric = doseUg * (1.0 + heatPenalty);

    candidates.push({
      index: i,
      startDt: slotStartDt,
      endDt: slotEndDt,
      start: slotStartDt.toISOString(),
      end: slotEndDt.toISOString(),
      label: formatSlotLabel(slotStartDt, slotEndDt),
      dose_ug: doseUg,
      temp_c: Math.round(maxTemp * 10) / 10,
      heat_penalty: Math.round(heatPenalty * 1000) / 1000,
      rank_metric: rankMetric,
      avg_pm25: pm25Vals.length ? Math.round((pm25Vals.reduce((a, b) => a + b, 0) / pm25Vals.length) * 10) / 10 : 0.0,
      exposure_score: 0,
    });
  }

  if (candidates.length === 0) {
    throw new NoFeasibleSlotError('No feasible slot found in the requested window.');
  }

  // Calculate exposure score relative to max candidate dose
  let maxCandDose = Math.max(...candidates.map((c) => c.dose_ug));
  if (maxCandDose <= 0.0) maxCandDose = 1.0;

  for (const c of candidates) {
    c.exposure_score = Math.min(
      100,
      Math.max(1, Math.round((100.0 * (c.dose_ug * pWeight)) / (maxCandDose * pWeight)))
    );
  }

  // Best slot is lowest rank_metric
  const sortedByRank = [...candidates].sort((a, b) => {
    if (a.rank_metric !== b.rank_metric) return a.rank_metric - b.rank_metric;
    return a.dose_ug - b.dose_ug;
  });
  const best = sortedByRank[0];

  // Baseline determination
  let baselineCand: CandidateSlot | null = null;
  let baselineKind: 'usual' | 'median' = 'median';
  let baselineLabel = 'a typical time in your window';

  if (usual_time) {
    const uClean = usual_time.trim();
    for (const c of candidates) {
      if (c.start.includes(uClean) || c.label.includes(uClean)) {
        baselineCand = c;
        baselineKind = 'usual';
        baselineLabel = 'your usual time';
        break;
      }
    }
  }

  if (!baselineCand) {
    const sortedByDose = [...candidates].sort((a, b) => a.dose_ug - b.dose_ug);
    const midIdx = Math.floor(sortedByDose.length / 2);
    baselineCand = sortedByDose[midIdx];
    baselineKind = 'median';
    baselineLabel = 'a typical time in your window';
  }

  const bDose = Math.max(0.1, baselineCand.dose_ug);
  const bestDose = best.dose_ug;
  const rawRed = Math.round((100.0 * (bDose - bestDose)) / bDose);
  const reductionPct = Math.max(0, rawRed);

  // Top 2 non-overlapping alternatives
  const alternatives: CandidateSlot[] = [];
  const bestStart = best.startDt.getTime();
  const bestEnd = best.endDt.getTime();

  for (const c of sortedByRank) {
    if (c === best) continue;
    const cStart = c.startDt.getTime();
    const cEnd = c.endDt.getTime();

    // Check non-overlap with best
    if (!(cEnd <= bestStart || cStart >= bestEnd)) continue;

    // Check non-overlap with chosen alternatives
    let overlaps = false;
    for (const alt of alternatives) {
      const aStart = alt.startDt.getTime();
      const aEnd = alt.endDt.getTime();
      if (!(cEnd <= aStart || cStart >= aEnd)) {
        overlaps = true;
        break;
      }
    }
    if (!overlaps) {
      alternatives.push(c);
      if (alternatives.length === 2) break;
    }
  }

  const cleanSlot = (s: CandidateSlot, isBest: boolean): Slot => ({
    start: s.start,
    end: s.end,
    label: s.label,
    dose_ug: s.dose_ug,
    exposure_score: s.exposure_score,
    temp_c: s.temp_c,
    reduction_pct: isBest ? reductionPct : Math.max(0, Math.round((100.0 * (bDose - s.dose_ug)) / bDose)),
  });

  return {
    best: cleanSlot(best, true),
    baseline: {
      start: baselineCand.start,
      end: baselineCand.end,
      label: baselineLabel,
      dose_ug: baselineCand.dose_ug,
      exposure_score: baselineCand.exposure_score,
      temp_c: baselineCand.temp_c,
      kind: baselineKind,
    },
    alternatives: alternatives.map((a) => cleanSlot(a, false)),
    candidates_count: candidates.length,
  };
}
