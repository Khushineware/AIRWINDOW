/**
 * Series module: builds hourly and 15-minute interpolated air quality series.
 */
import { CpcbCategory, SeriesPoint } from '../../types';

export const CPCB_BREAKPOINTS: Array<[number, number, CpcbCategory]> = [
  [0.0, 30.0, 'Good'],
  [30.0001, 60.0, 'Satisfactory'],
  [60.0001, 90.0, 'Moderate'],
  [90.0001, 120.0, 'Poor'],
  [120.0001, 250.0, 'Very Poor'],
  [250.0001, 10000.0, 'Severe'],
];

export function classifyCpcb(pm25Val: number): CpcbCategory {
  const val = Math.round(pm25Val * 10) / 10;
  if (val <= 30.0) return 'Good';
  if (val <= 60.0) return 'Satisfactory';
  if (val <= 90.0) return 'Moderate';
  if (val <= 120.0) return 'Poor';
  if (val <= 250.0) return 'Very Poor';
  return 'Severe';
}

export function parseIso(tsStr: string): Date {
  const clean = tsStr.replace('Z', '+00:00');
  const d = new Date(clean);
  if (isNaN(d.getTime())) {
    // Try simple Date constructor
    return new Date(tsStr);
  }
  return d;
}

export function formatIsoUtc(date: Date): string {
  return date.toISOString();
}

/**
 * Builds a continuous 15-minute step time series via linear interpolation.
 */
export function buildTimeSeries(
  hourlyTimes: string[],
  hourlyPm25: number[],
  hourlyTemp: number[],
  hourlyPm25Raw?: number[]
): SeriesPoint[] {
  if (
    !hourlyTimes ||
    hourlyTimes.length === 0 ||
    hourlyTimes.length !== hourlyPm25.length ||
    hourlyTimes.length !== hourlyTemp.length
  ) {
    throw new Error('Mismatched hourly lengths for time, pm25, and temp');
  }

  const rawList = hourlyPm25Raw && hourlyPm25Raw.length === hourlyPm25.length ? hourlyPm25Raw : hourlyPm25;
  const series: SeriesPoint[] = [];

  for (let i = 0; i < hourlyTimes.length - 1; i++) {
    const t0 = parseIso(hourlyTimes[i]);
    const p0 = hourlyPm25[i];
    const p0Raw = rawList[i];
    const temp0 = hourlyTemp[i];

    const p1 = hourlyPm25[i + 1];
    const p1Raw = rawList[i + 1];
    const temp1 = hourlyTemp[i + 1];

    for (let step = 0; step < 4; step++) {
      const frac = step / 4.0;
      const stepDate = new Date(t0.getTime() + step * 15 * 60 * 1000);

      const interpPm25 = Math.round((p0 + frac * (p1 - p0)) * 10) / 10;
      const interpPm25Raw = Math.round((p0Raw + frac * (p1Raw - p0Raw)) * 10) / 10;
      const interpTemp = Math.round((temp0 + frac * (temp1 - temp0)) * 10) / 10;

      series.push({
        time: stepDate.toISOString(),
        pm25: interpPm25,
        pm25_raw: interpPm25Raw,
        temp_c: interpTemp,
        category: classifyCpcb(interpPm25),
      });
    }
  }

  // Include final hourly endpoint
  const lastIdx = hourlyTimes.length - 1;
  const lastP = Math.round(hourlyPm25[lastIdx] * 10) / 10;
  const lastPRaw = Math.round(rawList[lastIdx] * 10) / 10;
  const lastTemp = Math.round(hourlyTemp[lastIdx] * 10) / 10;

  series.push({
    time: parseIso(hourlyTimes[lastIdx]).toISOString(),
    pm25: lastP,
    pm25_raw: lastPRaw,
    temp_c: lastTemp,
    category: classifyCpcb(lastP),
  });

  return series;
}
