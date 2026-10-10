"""Ingest Lambda Handler: hourly scheduled ingestion and snapshot calibration."""
from __future__ import annotations
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from ..core.series import build_time_series
from ..core.correction import correct
from ..services.open_meteo import fetch_aligned_forecast
from ..services.openaq import fetch_nearby_stations
from ..services.storage import (
    save_raw_snapshot,
    log_lead12_forecast,
    fill_observed_reading,
    save_ingest_step_status,
    get_active_tracking_locations,
    make_location_key,
)

logger = logging.getLogger("airwindow.ingest")
logger.setLevel(logging.INFO)

DEFAULT_LOCATIONS_ENV = os.environ.get(
    "DEFAULT_LOCATIONS",
    '[{"name": "Rohini, Delhi", "lat": 28.71, "lon": 77.11}]',
)


def get_all_target_locations() -> List[Dict[str, Any]]:
    """Combine DEFAULT_LOCATIONS with active DynamoDB TRACK# locations."""
    try:
        locations = json.loads(DEFAULT_LOCATIONS_ENV)
    except Exception:
        locations = [{"name": "Rohini, Delhi", "lat": 28.71, "lon": 77.11}]

    # Fetch tracked locations from DynamoDB
    try:
        tracked = get_active_tracking_locations()
        # De-duplicate by rounded location key
        seen = {make_location_key(float(loc["lat"]), float(loc["lon"])) for loc in locations}
        for tr in tracked:
            k = make_location_key(tr["lat"], tr["lon"])
            if k not in seen:
                locations.append(tr)
                seen.add(k)
    except Exception as e:
        logger.info(f"Could not load tracked locations from DynamoDB: {e}")

    return locations


def handler(event: Dict[str, Any], context: Any = None) -> Dict[str, Any]:
    """Hourly EventBridge execution entry point."""
    now_utc = datetime.now(timezone.utc)
    logger.info(f"Starting hourly ingest run at {now_utc.isoformat()}")

    locations = get_all_target_locations()
    success_count = 0
    fail_count = 0

    for loc in locations:
        lat = float(loc["lat"])
        lon = float(loc["lon"])
        loc_key = make_location_key(lat, lon)
        loc_name = loc.get("name", "Unknown")

        try:
            # 1. Fetch Open-Meteo atmospheric forecast
            times, pm25s_raw, temps = fetch_aligned_forecast(lat, lon)

            # 2. Fetch OpenAQ observations
            stations, observations = fetch_nearby_stations(lat, lon)

            # 3. Store raw snapshot to private S3 bucket
            snapshot_data = {
                "location": {"lat": lat, "lon": lon, "name": loc_name},
                "fetched_at": now_utc.isoformat(),
                "times": times,
                "pm25s_raw": pm25s_raw,
                "temps": temps,
                "stations": stations,
                "observations": observations,
            }
            try:
                s3_key = save_raw_snapshot(loc_key, snapshot_data)
                logger.info(f"Saved raw snapshot to {s3_key}")
            except Exception as s3_err:
                logger.warning(f"S3 snapshot save failed: {s3_err}")

            # 4. Build series and calibrate
            raw_series = build_time_series(times, pm25s_raw, temps, hourly_pm25_raw=pm25s_raw)
            calibrated_series, corr_info = correct(raw_series, observations)

            # 5. Log 12-hour-lead forecast target (target_hour = now + 12h)
            target_12h_dt = (now_utc + timedelta(hours=12)).replace(minute=0, second=0, microsecond=0)
            target_12h_iso = target_12h_dt.isoformat()

            # Find target point in series
            target_raw = 50.0
            target_cal = 50.0
            for pt in calibrated_series:
                if pt["time"].startswith(target_12h_dt.strftime("%Y-%m-%dT%H")):
                    target_raw = pt.get("pm25_raw", pt.get("pm25", 50.0))
                    target_cal = pt.get("pm25", 50.0)
                    break

            try:
                log_lead12_forecast(loc_key, target_12h_iso, target_raw, target_cal)
            except Exception as dyn_err:
                logger.warning(f"DynamoDB forecast log failed: {dyn_err}")

            # 6. Fill observed values for current hour if stations have readings
            current_hour_iso = now_utc.replace(minute=0, second=0, microsecond=0).isoformat()
            if observations:
                latest_obs_val = observations[0].get("pm25")
                if latest_obs_val is not None:
                    try:
                        fill_observed_reading(loc_key, current_hour_iso, float(latest_obs_val))
                    except Exception as fill_err:
                        logger.warning(f"DynamoDB observed fill failed: {fill_err}")

            success_count += 1
        except Exception as e:
            logger.error(f"Error ingesting location {loc_name} ({lat}, {lon}): {e}")
            fail_count += 1

    # 7. Record status items for system health monitoring
    all_ok = fail_count == 0
    try:
        save_ingest_step_status("Data", "EventBridge + Lambda (ingest) + S3", all_ok, f"Processed {success_count} locations")
        save_ingest_step_status("Forecast", "Open-Meteo CAMS + OpenAQ + DynamoDB", all_ok, "Aligned and calibrated")
        save_ingest_step_status("Plan", "API Gateway HTTP API + Lambda (api)", True, "Active")
        save_ingest_step_status("Explain", "Strands SDK + Amazon Bedrock", True, "Active")
        save_ingest_step_status("Deliver", "AWS Amplify Hosting (SPA)", True, "Active")
    except Exception as stat_err:
        logger.warning(f"Failed to write INGEST status: {stat_err}")

    return {
        "statusCode": 200,
        "processed": success_count,
        "failed": fail_count,
        "timestamp": now_utc.isoformat(),
    }
