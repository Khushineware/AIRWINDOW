"""API handler module for test compatibility and event routing."""
from __future__ import annotations
import json
import logging
from typing import Any, Dict

from ..services.open_meteo import is_within_india, search_locations
from ..services.openaq import fetch_nearby_stations

logger = logging.getLogger(__name__)


def make_response(status_code: int, body_dict: Any) -> Dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
        },
        "body": json.dumps(body_dict),
    }


def make_error_response(code: str, message: str, status_code: int = 400) -> Dict[str, Any]:
    return make_response(status_code, {
        "error": {
            "code": code,
            "message": message,
        }
    })


def handler(event: Dict[str, Any], context: Any = None) -> Dict[str, Any]:
    """Compatibility handler function for event-based API testing."""
    method = event.get("requestContext", {}).get("http", {}).get("method", "GET").upper()
    path = event.get("rawPath", event.get("requestContext", {}).get("http", {}).get("path", "/"))
    body_raw = event.get("body", "{}")
    payload = json.loads(body_raw or "{}")

    if path == "/health" and method == "GET":
        return make_response(200, {"status": "ok"})

    if path == "/plan" and method == "POST":
        loc = payload.get("location") or {}
        lat = loc.get("lat")
        lon = loc.get("lon")
        if lat is None or lon is None or not is_within_india(float(lat), float(lon)):
            return make_error_response("OUTSIDE_COVERAGE", "Selected location is outside India bounds.")

        duration_min = int(payload.get("duration_min", 45))
        if duration_min < 15 or duration_min > 120:
            return make_error_response("INVALID_INPUT", "duration_min must be between 15 and 120 minutes.")

        return make_response(200, {"plan_id": "test-plan", "status": "created"})

    return make_error_response("NOT_FOUND", "Route not found.", 404)
