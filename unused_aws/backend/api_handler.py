"""API Lambda Handler: implements HTTP API v2 routes for AirWindow."""
from __future__ import annotations
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from ..core.series import build_time_series, classify_cpcb
from ..core.optimizer import optimize_schedule, NoFeasibleSlotError
from ..core.correction import correct
from ..core.confidence import evaluate_confidence
from ..core.exposure import get_breathing_rate, get_mask_factor, MODEL_CONFIG
from ..services.open_meteo import (
    search_locations,
    fetch_aligned_forecast,
    is_within_india,
)
from ..services.openaq import fetch_nearby_stations
from ..services.storage import (
    save_plan,
    get_plan,
    compute_trust_metrics,
    get_all_step_statuses,
    make_location_key,
    get_latest_snapshot,
)
from ..agent.agent import ask_agent

# Configure privacy-preserving logging
logger = logging.getLogger("airwindow.api")
logger.setLevel(logging.INFO)

ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")
MAX_BODY_BYTES = 64 * 1024  # 64 KB limit


def make_cors_headers() -> Dict[str, str]:
    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
    }


def make_response(status_code: int, body_dict: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": make_cors_headers(),
        "body": json.dumps(body_dict),
    }


def make_error_response(code: str, message: str, status_code: int = 400, retryable: bool = False) -> Dict[str, Any]:
    return make_response(status_code, {
        "error": {
            "code": code,
            "message": message,
            "retryable": retryable,
        }
    })


def parse_body(event: Dict[str, Any]) -> Dict[str, Any]:
    raw = event.get("body", "{}")
    if event.get("isBase64Encoded", False):
        import base64
        raw = base64.b64decode(raw).decode("utf-8")
    if len(raw) > MAX_BODY_BYTES:
        raise ValueError("Request body exceeds maximum allowed size.")
    return json.loads(raw or "{}")


def handler(event: Dict[str, Any], context: Any = None) -> Dict[str, Any]:
    """Main HTTP API Gateway v2 routing entry point."""
    method = event.get("requestContext", {}).get("http", {}).get("method", "GET").upper()
    path = event.get("rawPath", event.get("requestContext", {}).get("http", {}).get("path", "/"))
    query_params = event.get("queryStringParameters") or {}

    # Handle CORS preflight
    if method == "OPTIONS":
        return {
            "statusCode": 204,
            "headers": make_cors_headers(),
            "body": "",
        }

    try:
        # Route 1: GET /health
        if path == "/health" and method == "GET":
            return make_response(200, {"status": "healthy", "service": "AirWindow API"})

        # Route 2: GET /locations?q=
        if path == "/locations" and method == "GET":
            q = query_params.get("q", "").strip()
            if not q or len(q) < 2:
                return make_response(200, [])
            results = search_locations(q)
            return make_response(200, results)

        # Route 3: GET /now?lat&lon
        if path == "/now" and method == "GET":
            try:
                lat = float(query_params.get("lat", ""))
                lon = float(query_params.get("lon", ""))
            except ValueError:
                return make_error_response("INVALID_INPUT", "Query parameters lat and lon must be valid floats.")

            if not is_within_india(lat, lon):
                return make_error_response("OUTSIDE_COVERAGE", "Coordinates are outside India territorial coverage (Lat 6-37, Lon 68-98).")

            logger.info(f"Checking /now for lat={round(lat, 2)}, lon={round(lon, 2)}")

            # Fetch forecast and nearby stations
            times, pm25s, _ = fetch_aligned_forecast(lat, lon)
            if not pm25s:
                return make_error_response("UPSTREAM_UNAVAILABLE", "Failed to retrieve current atmospheric forecast.", 502, True)

            stations, _ = fetch_nearby_stations(lat, lon)
            current_pm25 = pm25s[0]

            return make_response(200, {
                "pm25": current_pm25,
                "category": classify_cpcb(current_pm25),
                "updated_minutes_ago": 15,
                "stations_used": len(stations),
            })

        # Route 4: POST /plan
        if path == "/plan" and method == "POST":
            payload = parse_body(event)
            loc = payload.get("location")
            if not loc or "lat" not in loc or "lon" not in loc:
                return make_error_response("INVALID_INPUT", "Payload must contain location with lat and lon.")

            lat = float(loc["lat"])
            lon = float(loc["lon"])
            if not is_within_india(lat, lon):
                return make_error_response("OUTSIDE_COVERAGE", "Selected location is outside India.")

            activity = str(payload.get("activity", "running")).lower()
            if activity not in ["running", "walking", "cycling", "sports"]:
                return make_error_response("INVALID_INPUT", f"Activity '{activity}' is not supported.")

            duration_min = int(payload.get("duration_min", 45))
            if duration_min < 15 or duration_min > 120:
                return make_error_response("INVALID_INPUT", "duration_min must be between 15 and 120 minutes.")

            window_start = payload.get("window_start")
            window_end = payload.get("window_end")
            profile = payload.get("profile", "adult")
            usual_time = payload.get("usual_time")
            mask = bool(payload.get("mask", False))

            data_notes: List[str] = []

            # Privacy-preserving logging
            logger.info(f"Generating plan for {round(lat, 2)}, {round(lon, 2)} act={activity} dur={duration_min}")

            # Fetch upstream data with S3 snapshot fallback
            times, pm25s_raw, temps = [], [], []
            try:
                times, pm25s_raw, temps = fetch_aligned_forecast(lat, lon)
            except Exception as e:
                logger.warning(f"Upstream Open-Meteo failure: {e}. Checking S3 fallback snapshot...")
                loc_key = make_location_key(lat, lon)
                snapshot = get_latest_snapshot(loc_key, max_age_hours=6.0)
                if snapshot:
                    times = snapshot.get("times", [])
                    pm25s_raw = snapshot.get("pm25s_raw", [])
                    temps = snapshot.get("temps", [])
                    data_notes.append("Using cached model snapshot due to temporary upstream delay.")
                else:
                    return make_error_response("UPSTREAM_UNAVAILABLE", "Atmospheric model service unavailable and no cached snapshot exists.", 503, True)

            # Ground observations from OpenAQ
            station_summaries, observations = fetch_nearby_stations(lat, lon)

            # Build initial 15-minute time series
            raw_series = build_time_series(times, pm25s_raw, temps, hourly_pm25_raw=pm25s_raw)

            # Apply ground observation calibration
            calibrated_series, corr_info = correct(raw_series, observations)
            corr_applied = corr_info.get("method") != "uncalibrated_cams"

            # Evaluate confidence
            conf = evaluate_confidence(station_summaries, correction_applied=corr_applied)

            # Fallback window_start and window_end if not supplied
            if not window_start or not window_end:
                now_utc = datetime.now(timezone.utc)
                window_start = now_utc.strftime("%Y-%m-%dT05:00:00")
                window_end = now_utc.strftime("%Y-%m-%dT21:00:00")

            # Run optimizer
            try:
                opt_result = optimize_schedule(
                    series=calibrated_series,
                    activity=activity,
                    duration_min=duration_min,
                    window_start=window_start,
                    window_end=window_end,
                    profile=profile,
                    usual_time=usual_time,
                    mask=mask,
                )
            except NoFeasibleSlotError as e:
                return make_error_response("NO_FEASIBLE_SLOT", str(e), 422)

            plan_id = str(uuid.uuid4())
            current_pm25 = calibrated_series[0]["pm25"] if calibrated_series else 50.0

            plan_output = {
                "plan_id": plan_id,
                "location": {
                    "name": loc.get("name", "Selected Location"),
                    "lat": round(lat, 4),
                    "lon": round(lon, 4),
                    "admin": loc.get("admin", "India"),
                },
                "inputs": {
                    "activity": activity,
                    "duration_min": duration_min,
                    "window_start": window_start,
                    "window_end": window_end,
                    "profile": profile,
                    "usual_time": usual_time,
                    "mask": mask,
                },
                "best": opt_result["best"],
                "baseline": opt_result["baseline"],
                "alternatives": opt_result["alternatives"],
                "series": calibrated_series,
                "confidence": conf,
                "assumptions": {
                    "breathing_rate_lpm": get_breathing_rate(activity),
                    "mask_factor": get_mask_factor(),
                },
                "current": {
                    "pm25": current_pm25,
                    "category": classify_cpcb(current_pm25),
                    "updated_minutes_ago": 15,
                    "stations_used": conf["live_stations_count"],
                },
                "data_notes": data_notes,
            }

            # Persist plan to DynamoDB with 7-day TTL and write TRACK item
            try:
                save_plan(plan_output)
            except Exception as e:
                # TODO / VERIFY: DynamoDB connection in local without AWS credentials
                logger.info(f"DynamoDB save skipped or local mock ({e})")

            return make_response(200, plan_output)

        # Route 5: GET /plan/{id}
        if path.startswith("/plan/") and method == "GET" and not path.endswith("/why") and not path.endswith("/change"):
            plan_id = path.split("/")[2]
            plan_obj = get_plan(plan_id)
            if not plan_obj:
                return make_error_response("NOT_FOUND", f"Plan '{plan_id}' not found.", 404)
            return make_response(200, plan_obj)

        # Route 6: POST /whatif
        if path == "/whatif" and method == "POST":
            payload = parse_body(event)
            plan_id = payload.get("plan_id")
            changes = payload.get("changes") or {}
            
            existing = get_plan(plan_id)
            if not existing:
                return make_error_response("NOT_FOUND", f"Original plan '{plan_id}' not found.", 404)

            # Re-optimize with modified inputs
            inputs = dict(existing["inputs"])
            if "duration_min" in changes:
                inputs["duration_min"] = int(changes["duration_min"])
            if "activity" in changes:
                inputs["activity"] = str(changes["activity"]).lower()
            if "mask" in changes:
                inputs["mask"] = bool(changes["mask"])

            series = existing["series"]
            try:
                opt = optimize_schedule(
                    series=series,
                    activity=inputs["activity"],
                    duration_min=inputs["duration_min"],
                    window_start=inputs["window_start"],
                    window_end=inputs["window_end"],
                    profile=inputs.get("profile"),
                    usual_time=inputs.get("usual_time"),
                    mask=inputs.get("mask", False),
                )
            except NoFeasibleSlotError as e:
                return make_error_response("NO_FEASIBLE_SLOT", str(e), 422)

            before_dose = existing["best"]["dose_ug"]
            after_dose = opt["best"]["dose_ug"]
            delta_pct = 0
            if before_dose > 0:
                delta_pct = max(0, int(round(100.0 * (before_dose - after_dose) / before_dose)))

            # Save new plan
            new_plan_id = str(uuid.uuid4())
            new_plan = dict(existing)
            new_plan["plan_id"] = new_plan_id
            new_plan["inputs"] = inputs
            new_plan["best"] = opt["best"]
            new_plan["baseline"] = opt["baseline"]
            new_plan["alternatives"] = opt["alternatives"]
            new_plan["assumptions"]["breathing_rate_lpm"] = get_breathing_rate(inputs["activity"])

            try:
                save_plan(new_plan)
            except Exception:
                pass

            return make_response(200, {
                "before": {"dose_ug": before_dose},
                "after": {"dose_ug": after_dose},
                "delta_pct": delta_pct,
                "plan_id": new_plan_id,
                "best": opt["best"],
            })

        # Route 7: POST /agent/ask
        if path == "/agent/ask" and method == "POST":
            payload = parse_body(event)
            plan_id = payload.get("plan_id")
            question = payload.get("question", "Why this time?")

            plan_obj = get_plan(plan_id)
            if not plan_obj:
                return make_error_response("NOT_FOUND", f"Plan '{plan_id}' not found.", 404)

            agent_res = ask_agent(plan_obj, question)
            return make_response(200, agent_res)

        # Route 8: GET /trust?lat&lon
        if path == "/trust" and method == "GET":
            try:
                lat = float(query_params.get("lat", "28.70"))
                lon = float(query_params.get("lon", "77.10"))
            except ValueError:
                return make_error_response("INVALID_INPUT", "Query parameters lat and lon must be valid floats.")

            stations, _ = fetch_nearby_stations(lat, lon)
            # Evaluate station statuses
            conf = evaluate_confidence(stations, correction_applied=True)
            trust_metrics = compute_trust_metrics(lat, lon)

            return make_response(200, {
                "stations": conf["stations"],
                "mae_raw": trust_metrics.get("mae_raw"),
                "mae_corrected": trust_metrics.get("mae_corrected"),
                "pairs": trust_metrics.get("pairs", 0),
                "since": trust_metrics.get("since"),
            })

        # Route 9: GET /status
        if path == "/status" and method == "GET":
            steps = get_all_step_statuses()
            return make_response(200, {"steps": steps})

        # Route not matched
        return make_error_response("NOT_FOUND", f"Endpoint {method} {path} not found.", 404)

    except Exception as e:
        logger.exception(f"Unhandled error handling {method} {path}: {e}")
        return make_error_response("INTERNAL", "An internal error occurred processing your request.", 500, True)
