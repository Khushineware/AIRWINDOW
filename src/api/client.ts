import {
  AirNow,
  LocationItem,
  PlanData,
  WhatIfResponse,
  AgentResponse,
  TrustResponse,
  StatusResponse,
} from '../types';

import samplePlan from '../../frontend/src/fixtures/sample_plan.json';
import sampleNow from '../../frontend/src/fixtures/sample_now.json';
import sampleTrust from '../../frontend/src/fixtures/sample_trust.json';
import sampleStatus from '../../frontend/src/fixtures/sample_status.json';
import sampleLocations from '../../frontend/src/fixtures/sample_locations.json';
import sampleAgent from '../../frontend/src/fixtures/sample_agent.json';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');

// In-memory store for created / modified plans in fixture / preview mode
const fixturePlansStore = new Map<string, PlanData>();
fixturePlansStore.set((samplePlan as PlanData).plan_id, samplePlan as PlanData);

export function isUsingFixtures(): boolean {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('fixtures') === 'false') return false;
    if (params.get('fixtures') === 'true') return true;
  }
  return import.meta.env.VITE_USE_FIXTURES === 'true';
}

export function isBackendConfigured(): boolean {
  return Boolean(API_BASE_URL);
}

class ApiError extends Error {
  code: string;
  retryable: boolean;
  status: number;

  constructor(code: string, message: string, status: number = 400, retryable: boolean = false) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  if (!API_BASE_URL) {
    throw new ApiError('BACKEND_NOT_CONNECTED', 'Backend not connected: VITE_API_BASE_URL is not configured.', 503, false);
  }

  const url = `${API_BASE_URL}${endpoint}`;
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = data.error || {};
      const message = err.message || (typeof data.detail === 'string' ? data.detail : null) || `Request failed with status ${response.status}`;
      throw new ApiError(
        err.code || 'HTTP_ERROR',
        message,
        response.status,
        Boolean(err.retryable)
      );
    }

    return data as T;
  } catch (err: any) {
    if (err instanceof ApiError) {
      throw err;
    }
    const rawMsg = err?.message || '';
    const message = (rawMsg === 'Failed to fetch' || rawMsg.includes('Failed to fetch'))
      ? 'Live air data is busy, please try again in a moment'
      : (rawMsg || 'Live air data is busy, please try again in a moment');
    throw new ApiError('NETWORK_ERROR', message, 503, true);
  }
}

export async function getLocations(query: string): Promise<LocationItem[]> {
  if (isUsingFixtures()) {
    const list = sampleLocations as LocationItem[];
    if (!query) return list;
    return list.filter((l) => l.name.toLowerCase().includes(query.toLowerCase()) || (l.admin && l.admin.toLowerCase().includes(query.toLowerCase())));
  }
  return request<LocationItem[]>(`/locations?q=${encodeURIComponent(query)}`);
}

export async function reverseGeocode(lat: number, lon: number): Promise<LocationItem> {
  if (isUsingFixtures()) {
    return {
      name: 'Sample Locality',
      admin: 'India',
      full_address: `Sample Locality (${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E), India`,
      lat,
      lon,
    };
  }
  return request<LocationItem>(`/reverse?lat=${lat}&lon=${lon}`);
}

export async function getNow(lat: number, lon: number): Promise<AirNow> {
  if (isUsingFixtures()) {
    return sampleNow as AirNow;
  }
  return request<AirNow>(`/now?lat=${lat}&lon=${lon}`);
}

export async function createPlan(payload: {
  location: LocationItem;
  activity: string;
  duration_min: number;
  window_start: string;
  window_end: string;
  profile?: string;
  usual_time?: string;
  mask?: boolean;
}): Promise<PlanData> {
  if (isUsingFixtures()) {
    const copy = JSON.parse(JSON.stringify(samplePlan)) as PlanData;
    const planId = `plan-${Date.now().toString(36)}`;
    copy.plan_id = planId;
    copy.location = payload.location;
    copy.inputs.activity = payload.activity as any;
    copy.inputs.duration_min = payload.duration_min;
    copy.inputs.window_start = payload.window_start;
    copy.inputs.window_end = payload.window_end;
    if (payload.usual_time) copy.inputs.usual_time = payload.usual_time;
    if (payload.profile) copy.inputs.profile = payload.profile as any;
    if (payload.mask !== undefined) copy.inputs.mask = payload.mask;

    // Scale dose according to duration & activity
    const activityMultipliers: Record<string, number> = {
      running: 1.0,
      cycling: 0.75,
      sports: 0.88,
      walking: 0.5,
    };
    const actFactor = activityMultipliers[payload.activity.toLowerCase()] || 1.0;
    const durFactor = payload.duration_min / 45;
    const maskFactor = payload.mask ? 0.67 : 1.0;
    copy.best.dose_ug = Math.round(52.4 * actFactor * durFactor * maskFactor * 10) / 10;
    copy.baseline.dose_ug = Math.round(97.2 * actFactor * durFactor * 10) / 10;
    copy.best.reduction_pct = Math.max(0, Math.round(((copy.baseline.dose_ug - copy.best.dose_ug) / copy.baseline.dose_ug) * 100));

    fixturePlansStore.set(planId, copy);
    return copy;
  }
  return request<PlanData>('/plan', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getPlanById(id: string): Promise<PlanData> {
  if (isUsingFixtures()) {
    if (fixturePlansStore.has(id)) {
      return fixturePlansStore.get(id)!;
    }
    return samplePlan as PlanData;
  }
  return request<PlanData>(`/plan/${id}`);
}

export async function postWhatIf(payload: {
  plan_id: string;
  changes: {
    duration_min?: number;
    activity?: string;
    mask?: boolean;
  };
}): Promise<WhatIfResponse> {
  if (isUsingFixtures()) {
    const parentPlan = fixturePlansStore.get(payload.plan_id) || (samplePlan as PlanData);
    const baseDose = parentPlan.best.dose_ug;

    const activityMultipliers: Record<string, number> = {
      running: 1.0,
      cycling: 0.75,
      sports: 0.88,
      walking: 0.5,
    };

    const targetActivity = (payload.changes.activity || parentPlan.inputs.activity).toLowerCase();
    const sourceActivity = parentPlan.inputs.activity.toLowerCase();
    const actRatio = (activityMultipliers[targetActivity] || 1.0) / (activityMultipliers[sourceActivity] || 1.0);

    const targetDur = payload.changes.duration_min ?? parentPlan.inputs.duration_min;
    const durRatio = targetDur / parentPlan.inputs.duration_min;

    const targetMask = payload.changes.mask !== undefined ? payload.changes.mask : Boolean(parentPlan.inputs.mask);
    const maskRatio = targetMask ? 0.67 : 1.0;

    const afterDose = Math.round(baseDose * actRatio * durRatio * maskRatio * 10) / 10;
    const delta = Math.max(0, Math.round(((baseDose - afterDose) / baseDose) * 100));
    const newPlanId = `${payload.plan_id}-whatif-${Date.now().toString(36)}`;

    const newPlanCopy: PlanData = JSON.parse(JSON.stringify(parentPlan));
    newPlanCopy.plan_id = newPlanId;
    newPlanCopy.inputs.duration_min = targetDur;
    newPlanCopy.inputs.activity = targetActivity as any;
    newPlanCopy.inputs.mask = targetMask;
    newPlanCopy.best.dose_ug = afterDose;
    newPlanCopy.best.reduction_pct = Math.max(0, Math.round(((newPlanCopy.baseline.dose_ug - afterDose) / newPlanCopy.baseline.dose_ug) * 100));

    fixturePlansStore.set(newPlanId, newPlanCopy);

    return {
      before: { dose_ug: baseDose },
      after: { dose_ug: afterDose },
      delta_pct: delta,
      plan_id: newPlanId,
      best: newPlanCopy.best,
    };
  }
  return request<WhatIfResponse>('/whatif', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function askAgent(plan_id: string, question: string): Promise<AgentResponse> {
  if (isUsingFixtures()) {
    const parentPlan = fixturePlansStore.get(plan_id) || (samplePlan as PlanData);
    const qLower = question.toLowerCase();

    let customizedAnswer = sampleAgent.answer;
    if (qLower.includes('30') || qLower.includes('half hour')) {
      const scaledDose = Math.round((parentPlan.best.dose_ug * 30 / parentPlan.inputs.duration_min) * 10) / 10;
      customizedAnswer = `Reducing your duration from ${parentPlan.inputs.duration_min} minutes to 30 minutes lowers particulate intake to ${scaledDose} µg. For ${parentPlan.inputs.activity} in ${parentPlan.location.name}, the recommended window remains ${parentPlan.best.label}.`;
    } else if (qLower.includes('walking') || qLower.includes('walk')) {
      const walkDose = Math.round((parentPlan.best.dose_ug * 0.5) * 10) / 10;
      customizedAnswer = `Walking is significantly cleaner: your breathing rate drops from 40 L/min to 20 L/min, cutting your inhaled particulate dose in half to ${walkDose} µg. The cleanest slot is still ${parentPlan.best.label}.`;
    } else if (qLower.includes('5 pm') || qLower.includes('17:00')) {
      customizedAnswer = `At 5:00 PM, evening boundary-layer compression traps vehicular exhaust, raising PM2.5 to 96.0 µg/m³ with an inhaled dose of ~84.5 µg. Going during ${parentPlan.best.label} delivers ${parentPlan.best.reduction_pct}% less particulate exposure.`;
    }

    return {
      answer: customizedAnswer,
      tools_used: [
        {
          name: 'get_forecast',
          input: { lat: parentPlan.location.lat, lon: parentPlan.location.lon },
          output: { status: 'success', sample_points: 96, current_pm25: parentPlan.current.pm25, current_temp: parentPlan.best.temp_c },
        },
        {
          name: 'compute_exposure',
          input: { activity: parentPlan.inputs.activity, duration_min: parentPlan.inputs.duration_min, avg_pm25: parentPlan.current.pm25 },
          output: { activity: parentPlan.inputs.activity, duration_min: parentPlan.inputs.duration_min, dose_ug: parentPlan.best.dose_ug, breathing_rate_lpm: 40.0 },
        },
        {
          name: 'optimize_schedule',
          input: { plan_id },
          output: { best: parentPlan.best, baseline: parentPlan.baseline, alternatives: parentPlan.alternatives },
        },
        {
          name: 'get_station_status',
          input: { lat: parentPlan.location.lat, lon: parentPlan.location.lon },
          output: { station_count: parentPlan.confidence.total_stations, live_stations_count: parentPlan.confidence.live_stations_count, confidence: parentPlan.confidence.level },
        },
      ],
      explained_by: 'ai',
    };
  }
  return request<AgentResponse>('/agent/ask', {
    method: 'POST',
    body: JSON.stringify({ plan_id, question }),
  });
}

export async function getTrust(lat: number, lon: number): Promise<TrustResponse> {
  if (isUsingFixtures()) {
    return sampleTrust as TrustResponse;
  }
  return request<TrustResponse>(`/trust?lat=${lat}&lon=${lon}`);
}

export async function getStatus(): Promise<StatusResponse> {
  if (isUsingFixtures()) {
    return sampleStatus as StatusResponse;
  }
  return request<StatusResponse>('/status');
}
