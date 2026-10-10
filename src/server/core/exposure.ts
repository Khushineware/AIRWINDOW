/**
 * Exposure module: calculates inhaled particulate dose in micrograms (ug).
 */

export interface ModelConfig {
  breathing_rate_lpm: Record<string, number>;
  mask_factor: number;
  heat_threshold_c: number;
  heat_penalty_per_c: number;
  profile_weight: Record<string, number>;
}

export const MODEL_CONFIG: ModelConfig = {
  breathing_rate_lpm: {
    running: 40.0,
    walking: 20.0,
    cycling: 30.0,
    sports: 35.0,
  },
  mask_factor: 0.67,
  heat_threshold_c: 35.0,
  heat_penalty_per_c: 0.02,
  profile_weight: {
    adult: 1.0,
    child: 1.2,
    sensitive: 1.5,
  },
};

export function getBreathingRate(activity: string): number {
  const actKey = activity.toLowerCase().trim();
  return MODEL_CONFIG.breathing_rate_lpm[actKey] ?? 25.0;
}

export function getMaskFactor(): number {
  return MODEL_CONFIG.mask_factor;
}

export function getProfileWeight(profile?: string | null): number {
  if (!profile) return 1.0;
  const key = profile.toLowerCase().trim();
  return MODEL_CONFIG.profile_weight[key] ?? 1.0;
}

/**
 * Compute inhaled PM2.5 dose in micrograms for a single 15-minute step.
 */
export function computeStepDoseUg(
  pm25: number,
  breathingRateLpm: number,
  mask: boolean = false,
  maskFactor?: number
): number {
  let effectivePm25 = Number(pm25);
  if (mask) {
    const mf = maskFactor !== undefined ? maskFactor : getMaskFactor();
    effectivePm25 *= mf;
  }

  // 15 minutes of breathing at breathingRateLpm L/min
  // Volume in m3 = (breathingRateLpm / 1000.0) * 15.0
  const volumeM3 = (breathingRateLpm / 1000.0) * 15.0;
  return effectivePm25 * volumeM3;
}

/**
 * Computes total inhaled particulate dose in micrograms for an activity window.
 */
export function computeDoseUg(
  steps: number[] | Array<{ pm25: number }>,
  activity: string = 'running',
  mask: boolean = false,
  maskFactor?: number,
  profile?: string
): number {
  if (!steps || steps.length === 0) return 0.0;

  const br = getBreathingRate(activity);
  let totalDose = 0.0;

  for (const step of steps) {
    const pm25 = typeof step === 'number' ? step : step.pm25;
    totalDose += computeStepDoseUg(pm25, br, mask, maskFactor);
  }

  return Math.round(totalDose * 10) / 10;
}
