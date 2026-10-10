import { optimizeSchedule, NoFeasibleSlotError } from '../server/core/optimizer';
import { buildTimeSeries } from '../server/core/series';

function createSyntheticSeries() {
  const times: string[] = [];
  for (let h = 0; h < 24; h++) {
    times.push(`2026-10-09T${h.toString().padStart(2, '0')}:00:00`);
  }
  const pm25s = [
    150.0, 160.0, 170.0, 180.0, 150.0, 120.0,
    90.0, 70.0, 50.0, 40.0, 35.0, 30.0,
    30.0, 30.0, 35.0, 50.0, 80.0, 110.0,
    140.0, 160.0, 170.0, 180.0, 175.0, 160.0,
  ];
  const temps = new Array(24).fill(25.0);
  return buildTimeSeries(times, pm25s, temps);
}

export function runOptimizerTests() {
  console.log('Running Optimizer Tests...');

  const series = createSyntheticSeries();
  const res = optimizeSchedule({
    series,
    activity: 'running',
    duration_min: 30,
    window_start: '2026-10-09T06:00:00',
    window_end: '2026-10-09T20:00:00',
  });

  const best = res.best;
  const startMatchesCleanHour =
    best.start.includes('11:') ||
    best.start.includes('12:') ||
    best.start.includes('13:');
  if (!startMatchesCleanHour) {
    throw new Error(`Expected cleanest window in midday hours, got ${best.start}`);
  }
  if (res.candidates_count <= 0) {
    throw new Error(`Expected candidates_count > 0`);
  }
  if (best.dose_ug >= 100.0) {
    throw new Error(`Expected best dose < 100.0`);
  }

  // Heat penalty changes ranking
  const heatTimes: string[] = [];
  for (let h = 8; h < 16; h++) {
    heatTimes.push(`2026-10-09T${h.toString().padStart(2, '0')}:00:00`);
  }
  const heatPm25s = new Array(heatTimes.length).fill(40.0);
  const heatTemps = [28.0, 28.0, 28.0, 28.0, 28.0, 42.0, 42.0, 30.0];
  const heatSeries = buildTimeSeries(heatTimes, heatPm25s, heatTemps);

  const heatRes = optimizeSchedule({
    series: heatSeries,
    activity: 'running',
    duration_min: 30,
    window_start: '2026-10-09T08:00:00',
    window_end: '2026-10-09T15:00:00',
  });

  if (heatRes.best.start.includes('13:00')) {
    throw new Error(`Expected heat penalty to penalize 42°C slot at 13:00`);
  }
  if (heatRes.best.temp_c > 35.0) {
    throw new Error(`Expected best slot temp <= 35.0°C`);
  }

  // Reduction pct never negative
  const redRes = optimizeSchedule({
    series,
    activity: 'running',
    duration_min: 45,
    window_start: '2026-10-09T05:00:00',
    window_end: '2026-10-09T22:00:00',
    usual_time: '13:00',
  });
  if ((redRes.best.reduction_pct ?? 0) < 0) {
    throw new Error(`Expected reduction_pct >= 0`);
  }

  // No feasible slot raises error
  let threw = false;
  try {
    optimizeSchedule({
      series,
      activity: 'running',
      duration_min: 60,
      window_start: '2026-10-09T10:00:00',
      window_end: '2026-10-09T10:15:00',
    });
  } catch (err) {
    if (err instanceof NoFeasibleSlotError) {
      threw = true;
    }
  }
  if (!threw) {
    throw new Error(`Expected NoFeasibleSlotError for narrow window`);
  }

  console.log('✓ Optimizer Tests Passed');
}
