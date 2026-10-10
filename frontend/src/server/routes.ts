/**
 * Express router implementing all AirWindow API endpoints.
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { PlanData } from '../types';
import { buildTimeSeries, classifyCpcb } from './core/series';
import { getBreathingRate, getMaskFactor } from './core/exposure';
import { optimizeSchedule, NoFeasibleSlotError } from './core/optimizer';
import { correct } from './core/correction';
import { evaluateConfidence } from './core/confidence';
import { geocodeLocation, reverseGeocode } from './services/geocoding';
import { fetchAlignedForecast, isWithinIndia } from './services/openMeteo';
import { fetchNearbyStations } from './services/openAq';
import { savePlan, getPlan, getTrustMetrics, getStepStatuses } from './services/storage';
import { askAgent } from './agent/geminiAgent';

export const apiRouter = Router();

// Route 1: GET /health
apiRouter.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy', service: 'AirWindow API' });
});

// Route 2: GET /locations?q=
apiRouter.get('/locations', async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q || q.length < 3) {
      return res.json([]);
    }
    const results = await geocodeLocation(q);
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: { code: 'UPSTREAM_ERROR', message: err.message } });
  }
});

// Route 2b: GET /reverse?lat=&lon=
apiRouter.get('/reverse', async (req: Request, res: Response) => {
  try {
    const lat = parseFloat(String(req.query.lat || ''));
    const lon = parseFloat(String(req.query.lon || ''));

    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Query parameters lat and lon must be valid numbers.' },
      });
    }

    if (!isWithinIndia(lat, lon)) {
      return res.status(400).json({
        error: { code: 'OUTSIDE_COVERAGE', message: 'Coordinates are outside India (Lat 6-37, Lon 68-98).' },
      });
    }

    const location = await reverseGeocode(lat, lon);
    res.json(location);
  } catch (err: any) {
    res.status(500).json({ error: { code: 'REVERSE_GEOCODE_ERROR', message: err.message } });
  }
});

// Route 3: GET /now?lat&lon
apiRouter.get('/now', async (req: Request, res: Response) => {
  try {
    const lat = parseFloat(String(req.query.lat || ''));
    const lon = parseFloat(String(req.query.lon || ''));

    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Query parameters lat and lon must be valid numbers.' },
      });
    }

    if (!isWithinIndia(lat, lon)) {
      return res.status(400).json({
        error: { code: 'OUTSIDE_COVERAGE', message: 'Coordinates are outside India coverage (Lat 6-37, Lon 68-98).' },
      });
    }

    const [{ pm25s }, { stationSummaries }] = await Promise.all([
      fetchAlignedForecast(lat, lon),
      fetchNearbyStations(lat, lon),
    ]);

    if (!pm25s || pm25s.length === 0) {
      return res.status(502).json({
        error: { code: 'UPSTREAM_UNAVAILABLE', message: 'Failed to retrieve current atmospheric forecast.' },
      });
    }

    const currentPm25 = pm25s[0];

    // Compute real minutes since last station reading
    let updatedMinutesAgo = Math.max(5, new Date().getMinutes());
    if (stationSummaries && stationSummaries.length > 0) {
      const timestamps = stationSummaries
        .map((s) => (s.last_reading ? new Date(s.last_reading).getTime() : 0))
        .filter((t) => t > 0);
      if (timestamps.length > 0) {
        const newest = Math.max(...timestamps);
        updatedMinutesAgo = Math.max(1, Math.round((Date.now() - newest) / 60000));
      }
    }

    res.json({
      pm25: currentPm25,
      category: classifyCpcb(currentPm25),
      updated_minutes_ago: updatedMinutesAgo,
      stations_used: stationSummaries.length,
      stations: stationSummaries,
    });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'INTERNAL', message: err.message } });
  }
});

// Route 4: POST /plan
apiRouter.post('/plan', async (req: Request, res: Response) => {
  try {
    const payload = req.body || {};
    const loc = payload.location;

    if (!loc || typeof loc.lat !== 'number' || typeof loc.lon !== 'number') {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Payload must contain location with numeric lat and lon.' },
      });
    }

    const lat = loc.lat;
    const lon = loc.lon;

    if (!isWithinIndia(lat, lon)) {
      return res.status(400).json({
        error: { code: 'OUTSIDE_COVERAGE', message: 'Selected location is outside India.' },
      });
    }

    const activity = String(payload.activity || 'running').toLowerCase();
    if (!['running', 'walking', 'cycling', 'sports'].includes(activity)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: `Activity '${activity}' is not supported.` },
      });
    }

    const durationMin = parseInt(String(payload.duration_min || 45), 10);
    if (isNaN(durationMin) || durationMin < 15 || durationMin > 120) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'duration_min must be between 15 and 120 minutes.' },
      });
    }

    let windowStart = payload.window_start;
    let windowEnd = payload.window_end;
    const profile = payload.profile || 'adult';
    const usualTime = payload.usual_time;
    const mask = Boolean(payload.mask);

    if (!windowStart || !windowEnd) {
      const todayStr = new Date().toISOString().substring(0, 10);
      windowStart = `${todayStr}T05:00:00`;
      windowEnd = `${todayStr}T21:00:00`;
    }

    // Fetch upstream forecast and nearby stations
    const [{ times, pm25s, temps }, { stationSummaries, observations }] = await Promise.all([
      fetchAlignedForecast(lat, lon),
      fetchNearbyStations(lat, lon),
    ]);

    // Build 15-minute interpolated series
    const rawSeries = buildTimeSeries(times, pm25s, temps, pm25s);

    // Apply ground station calibration
    const [calibratedSeries, corrInfo] = correct(rawSeries, observations);
    const corrApplied = corrInfo.method !== 'uncalibrated_cams';

    // Evaluate confidence
    const conf = evaluateConfidence({
      stationSummaries,
      correctionApplied: corrApplied,
    });

    // Run schedule optimizer
    const optResult = optimizeSchedule({
      series: calibratedSeries,
      activity,
      duration_min: durationMin,
      window_start: windowStart,
      window_end: windowEnd,
      profile,
      usual_time: usualTime,
      mask,
    });

    const planId = `plan-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const currentPm25 = calibratedSeries[0]?.pm25 ?? 50.0;

    // Compute real minutes since last ground station reading
    let planUpdatedMinutesAgo = Math.max(5, new Date().getMinutes());
    if (stationSummaries && stationSummaries.length > 0) {
      const timestamps = stationSummaries
        .map((s) => (s.last_reading ? new Date(s.last_reading).getTime() : 0))
        .filter((t) => t > 0);
      if (timestamps.length > 0) {
        const newest = Math.max(...timestamps);
        planUpdatedMinutesAgo = Math.max(1, Math.round((Date.now() - newest) / 60000));
      }
    }

    const planOutput: PlanData = {
      plan_id: planId,
      location: {
        name: loc.name || 'Selected Location',
        full_address: loc.full_address || loc.name || 'Selected Location',
        lat: Math.round(lat * 10000) / 10000,
        lon: Math.round(lon * 10000) / 10000,
        admin: loc.admin || 'India',
      },
      inputs: {
        activity: activity as any,
        duration_min: durationMin,
        window_start: windowStart,
        window_end: windowEnd,
        profile,
        usual_time: usualTime,
        mask,
      },
      best: optResult.best,
      baseline: optResult.baseline,
      alternatives: optResult.alternatives,
      series: calibratedSeries,
      confidence: conf,
      assumptions: {
        breathing_rate_lpm: getBreathingRate(activity),
        mask_factor: getMaskFactor(),
      },
      current: {
        pm25: currentPm25,
        category: classifyCpcb(currentPm25),
        updated_minutes_ago: planUpdatedMinutesAgo,
        stations_used: conf.live_stations_count,
      },
      data_notes: corrApplied
        ? [`Calibrated against ${corrInfo.qualifying_stations} live ground stations within 25 km.`]
        : ['Using direct CAMS forecast (no nearby ground stations with 12+ readings in past 24h).'],
    };

    savePlan(planOutput);
    res.json(planOutput);
  } catch (err: any) {
    if (err instanceof NoFeasibleSlotError) {
      return res.status(422).json({ error: { code: 'NO_FEASIBLE_SLOT', message: err.message } });
    }
    console.error('Error in /plan:', err);
    res.status(500).json({ error: { code: 'INTERNAL', message: err.message } });
  }
});

// Route 5: GET /plan/:id
apiRouter.get('/plan/:id', (req: Request, res: Response) => {
  const planId = req.params.id;
  const planObj = getPlan(planId);
  if (!planObj) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Plan '${planId}' not found.` } });
  }
  res.json(planObj);
});

// Route 6: POST /whatif
apiRouter.post('/whatif', (req: Request, res: Response) => {
  try {
    const payload = req.body || {};
    const planId = payload.plan_id;
    const changes = payload.changes || {};

    const existing = getPlan(planId);
    if (!existing) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Original plan '${planId}' not found.` } });
    }

    const inputs = { ...existing.inputs };
    if (changes.duration_min !== undefined) {
      inputs.duration_min = parseInt(String(changes.duration_min), 10);
    }
    if (changes.activity) {
      inputs.activity = String(changes.activity).toLowerCase() as any;
    }
    if (changes.mask !== undefined) {
      inputs.mask = Boolean(changes.mask);
    }

    const opt = optimizeSchedule({
      series: existing.series,
      activity: inputs.activity,
      duration_min: inputs.duration_min,
      window_start: inputs.window_start,
      window_end: inputs.window_end,
      profile: inputs.profile,
      usual_time: inputs.usual_time,
      mask: inputs.mask,
    });

    const beforeDose = existing.best.dose_ug;
    const afterDose = opt.best.dose_ug;
    const deltaPct = beforeDose > 0 ? Math.max(0, Math.round((100.0 * (beforeDose - afterDose)) / beforeDose)) : 0;

    const newPlanId = `${planId}-whatif-${Date.now().toString(36)}`;
    const newPlan: PlanData = {
      ...existing,
      plan_id: newPlanId,
      inputs,
      best: opt.best,
      baseline: opt.baseline,
      alternatives: opt.alternatives,
      assumptions: {
        breathing_rate_lpm: getBreathingRate(inputs.activity),
        mask_factor: getMaskFactor(),
      },
    };

    savePlan(newPlan);

    res.json({
      before: { dose_ug: beforeDose },
      after: { dose_ug: afterDose },
      delta_pct: deltaPct,
      plan_id: newPlanId,
      best: opt.best,
    });
  } catch (err: any) {
    if (err instanceof NoFeasibleSlotError) {
      return res.status(422).json({ error: { code: 'NO_FEASIBLE_SLOT', message: err.message } });
    }
    res.status(500).json({ error: { code: 'INTERNAL', message: err.message } });
  }
});

// Route 7: POST /agent/ask
apiRouter.post('/agent/ask', async (req: Request, res: Response) => {
  try {
    const payload = req.body || {};
    const planId = payload.plan_id || payload.plan?.plan_id;
    const question = payload.question || 'Why this time?';

    let planObj: PlanData | null | undefined = payload.plan;
    if (!planObj && planId) {
      planObj = getPlan(planId);
    }

    if (!planObj) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Plan '${planId}' not found.` } });
    }

    const agentRes = await askAgent(planObj, question);
    res.json(agentRes);
  } catch (err: any) {
    res.status(500).json({ error: { code: 'INTERNAL', message: err.message } });
  }
});

// Route 8: GET /trust?lat&lon
apiRouter.get('/trust', async (req: Request, res: Response) => {
  try {
    const lat = parseFloat(String(req.query.lat || '28.70'));
    const lon = parseFloat(String(req.query.lon || '77.10'));

    const { stationSummaries } = await fetchNearbyStations(lat, lon);
    const conf = evaluateConfidence({
      stationSummaries,
      correctionApplied: true,
    });
    const trustMetrics = getTrustMetrics(lat, lon);

    res.json({
      stations: conf.stations,
      mae_raw: trustMetrics.mae_raw,
      mae_corrected: trustMetrics.mae_corrected,
      pairs: trustMetrics.pairs,
      since: trustMetrics.since,
    });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'INTERNAL', message: err.message } });
  }
});

// Route 9: GET /status
apiRouter.get('/status', (_req: Request, res: Response) => {
  res.json({ steps: getStepStatuses() });
});
