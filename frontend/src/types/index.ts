export type CpcbCategory = 'Good' | 'Satisfactory' | 'Moderate' | 'Poor' | 'Very Poor' | 'Severe';

export interface LocationItem {
  name: string;
  admin?: string;
  full_address?: string;
  locality?: string;
  district?: string;
  state?: string;
  postcode?: string;
  lat: number;
  lon: number;
}

export interface AirNow {
  pm25: number;
  category: CpcbCategory;
  updated_minutes_ago: number;
  stations_used: number;
  stations?: Array<{
    name: string;
    distance_km: number;
    status: 'LIVE' | 'STALE' | 'MISSING';
    last_reading?: string;
    pm25?: number;
  }>;
}

export interface Slot {
  start: string;
  end: string;
  label: string;
  dose_ug: number;
  exposure_score: number;
  reduction_pct?: number;
  temp_c: number;
  pm25?: number;
}

export interface BaselineSlot {
  start: string;
  end: string;
  label: string;
  dose_ug: number;
  exposure_score: number;
  temp_c: number;
  kind: 'usual' | 'median';
  pm25?: number;
}

export interface SeriesPoint {
  time: string;
  pm25: number;
  pm25_raw: number;
  temp_c: number;
  category: CpcbCategory;
}

export interface ConfidenceInfo {
  level: 'high' | 'medium' | 'low';
  reasons: string[];
  live_stations_count: number;
  stale_stations_count: number;
  total_stations: number;
  snapshot_age_hours?: number;
}

export interface PlanInputs {
  activity: 'running' | 'walking' | 'cycling' | 'sports';
  duration_min: number;
  window_start: string;
  window_end: string;
  profile?: 'adult' | 'child' | 'sensitive';
  usual_time?: string;
  mask?: boolean;
}

export interface PlanData {
  plan_id: string;
  location: LocationItem;
  inputs: PlanInputs;
  best: Slot;
  baseline: BaselineSlot;
  alternatives: Slot[];
  series: SeriesPoint[];
  confidence: ConfidenceInfo;
  assumptions: {
    breathing_rate_lpm: number;
    mask_factor: number;
  };
  current: AirNow;
  data_notes: string[];
}

export interface WhatIfResponse {
  before: { dose_ug: number };
  after: { dose_ug: number };
  delta_pct: number;
  plan_id: string;
  best?: Slot;
}

export interface AgentResponse {
  answer: string;
  tools_used: {
    name: string;
    input: any;
    output: any;
    summary?: string;
    duration_ms?: number;
    duration?: string;
  }[];
  explained_by: 'ai' | 'template';
}

export interface StationTrust {
  name: string;
  distance_km: number;
  last_reading?: string;
  status: 'LIVE' | 'STALE' | 'MISSING';
}

export interface TrustResponse {
  stations: StationTrust[];
  mae_raw: number | null;
  mae_corrected: number | null;
  pairs: number;
  since: string;
}

export interface PipelineStep {
  name: string;
  aws: string;
  last_run: string;
  ok: boolean;
}

export interface StatusResponse {
  steps: PipelineStep[];
}
