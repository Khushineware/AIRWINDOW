"""Correction module: calibrates CAMS numerical model forecasts against OpenAQ ground observations."""
from __future__ import annotations
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
import statistics

from .series import classify_cpcb, parse_iso


# ==============================================================================
# EXTENSION POINT: SageMaker / Machine Learning Correction Hook
# In future iterations, replace or augment ratio calibration with an inference
# call to a SageMaker-hosted ML model (e.g. LightGBM / XGBoost residual predictor)
# taking atmospheric features (boundary layer height, humidity, wind vector) and
# ground station residuals.
# The interface must remain: correct(series, observations) -> (calibrated_series, info)
# ==============================================================================


def calculate_median(values: List[float]) -> float:
    """Calculate median of a float list safely."""
    if not values:
        return 0.0
    return float(statistics.median(values))


def correct(
    series: List[Dict[str, Any]],
    observations: List[Dict[str, Any]],
    reference_time_iso: Optional[str] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Calibrate CAMS PM2.5 forecast series using nearby ground truth observations.
    
    Rule (v1):
      If at least 1 OpenAQ station within 25 km has >= 12 hourly readings in the last 24h:
        ratio = clamp(median(observed) / median(CAMS_same_hours), 0.6, 1.6)
        applied to future values.
      Otherwise ratio = 1.0.
    
    Args:
        series: List of dicts [{time, pm25, pm25_raw, temp_c, category}]
        observations: List of ground station readings [{station_id, distance_km, time, pm25}]
        reference_time_iso: Optional current reference timestamp
    
    Returns:
        (calibrated_series, info)
    """
    now_dt = parse_iso(reference_time_iso) if reference_time_iso else datetime.utcnow()
    last_24h_dt = now_dt - timedelta(hours=24)

    # Filter observations: within 25 km and within last 24 hours
    valid_stations_readings: Dict[str, List[Dict[str, Any]]] = {}
    for obs in observations:
        dist = float(obs.get("distance_km", 999.0))
        if dist > 25.0:
            continue
        try:
            obs_dt = parse_iso(obs["time"])
        except Exception:
            continue

        if obs_dt >= last_24h_dt and obs_dt <= now_dt:
            st_id = str(obs.get("station_id", "default"))
            if st_id not in valid_stations_readings:
                valid_stations_readings[st_id] = []
            valid_stations_readings[st_id].append({
                "dt": obs_dt,
                "pm25": float(obs["pm25"]),
            })

    # Check if at least 1 station has at least 12 hourly readings in the last 24h
    qualifying_stations = [
        st for st, rds in valid_stations_readings.items() if len(rds) >= 12
    ]

    ratio = 1.0
    method = "uncalibrated_cams"
    reasons = []
    matched_pairs_count = 0

    if qualifying_stations:
        # Match observed readings with CAMS raw values for the same hours
        # Build quick lookup of CAMS hourly values by hour key: YYYY-MM-DDTHH
        cams_hour_lookup: Dict[str, float] = {}
        for pt in series:
            try:
                pt_dt = parse_iso(pt["time"])
                hour_key = pt_dt.strftime("%Y-%m-%dT%H")
                raw_v = pt.get("pm25_raw", pt.get("pm25", 0.0))
                cams_hour_lookup[hour_key] = float(raw_v)
            except Exception:
                continue

        obs_vals: List[float] = []
        cams_vals: List[float] = []

        for st in qualifying_stations:
            for r in valid_stations_readings[st]:
                h_key = r["dt"].strftime("%Y-%m-%dT%H")
                if h_key in cams_hour_lookup:
                    obs_vals.append(r["pm25"])
                    cams_vals.append(cams_hour_lookup[h_key])

        matched_pairs_count = len(obs_vals)

        if obs_vals and cams_vals:
            obs_med = calculate_median(obs_vals)
            cams_med = calculate_median(cams_vals)

            if cams_med > 5.0 and obs_med > 0.0:
                raw_ratio = obs_med / cams_med
                # Clamp ratio between 0.6 and 1.6
                ratio = max(0.6, min(1.6, raw_ratio))
                method = "ratio_v1_median_clamped"
            else:
                reasons.append("CAMS median too low for stable ratio calculation")
        else:
            reasons.append("No coincident forecast-observation timestamp pairs found in past 24h")
    else:
        reasons.append("No OpenAQ stations within 25 km with >= 12 hourly readings in last 24h")

    # Apply ratio to future values
    calibrated_series: List[Dict[str, Any]] = []
    ratio_applied = round(ratio, 3)

    for pt in series:
        raw_val = float(pt.get("pm25_raw", pt.get("pm25", 0.0)))
        pt_dt = parse_iso(pt["time"])

        if pt_dt >= now_dt:
            # Future value: calibrate
            cal_val = round(raw_val * ratio_applied, 1)
        else:
            # Past value: keep raw or observed
            cal_val = round(raw_val, 1)

        calibrated_series.append({
            "time": pt["time"],
            "pm25": cal_val,
            "pm25_raw": round(raw_val, 1),
            "temp_c": pt.get("temp_c", 25.0),
            "category": classify_cpcb(cal_val),
        })

    info = {
        "ratio": ratio_applied,
        "method": method,
        "qualifying_stations": len(qualifying_stations),
        "total_active_stations": len(valid_stations_readings),
        "matched_pairs": matched_pairs_count,
        "reasons": reasons,
    }

    return calibrated_series, info
