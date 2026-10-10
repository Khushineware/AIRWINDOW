"""Confidence module: evaluates reliability based on station freshness and model snapshots."""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from .series import parse_iso


def evaluate_station_status(latest_reading_iso: Optional[str], now_dt: Optional[datetime] = None) -> Tuple[str, Optional[float]]:
    """Determine station status: LIVE (<3h old), STALE (>=3h old), MISSING (none)."""
    if not latest_reading_iso:
        return "MISSING", None

    ref_now = now_dt or datetime.now(timezone.utc)
    try:
        read_dt = parse_iso(latest_reading_iso)
        # Ensure UTC comparison if needed
        if read_dt.tzinfo is None and ref_now.tzinfo is not None:
            read_dt = read_dt.replace(tzinfo=timezone.utc)
        elif read_dt.tzinfo is not None and ref_now.tzinfo is None:
            ref_now = ref_now.replace(tzinfo=timezone.utc)

        diff_hours = (ref_now - read_dt).total_seconds() / 3600.0
        if diff_hours < 0:
            diff_hours = 0.0

        if diff_hours <= 3.0:
            return "LIVE", round(diff_hours, 1)
        return "STALE", round(diff_hours, 1)
    except Exception:
        return "MISSING", None


def evaluate_confidence(
    station_summaries: List[Dict[str, Any]],
    correction_applied: bool,
    snapshot_age_hours: Optional[float] = 0.5,
    reference_time_iso: Optional[str] = None,
) -> Dict[str, Any]:
    """Evaluates forecast confidence score, level, and human-readable reasons.
    
    Levels:
      - high: >= 2 LIVE stations and correction applied
      - medium: 1 LIVE station, or stations stale, or only model data from a fresh snapshot (<=3h)
      - low: no stations or snapshot older than 3h
    """
    now_dt = parse_iso(reference_time_iso) if reference_time_iso else datetime.now(timezone.utc)

    live_count = 0
    stale_count = 0
    missing_count = 0
    evaluated_stations = []

    for s in station_summaries:
        status, age_h = evaluate_station_status(s.get("last_reading"), now_dt)
        if status == "LIVE":
            live_count += 1
        elif status == "STALE":
            stale_count += 1
        else:
            missing_count += 1

        evaluated_stations.append({
            "name": s.get("name", "Unknown Station"),
            "distance_km": round(float(s.get("distance_km", 0.0)), 1),
            "last_reading": s.get("last_reading"),
            "status": status,
            "age_hours": age_h,
        })

    reasons: List[str] = []
    level = "medium"

    snap_age = snapshot_age_hours if snapshot_age_hours is not None else 0.5

    # Check conditions
    if snap_age > 3.0:
        level = "low"
        reasons.append(f"Model snapshot is {round(snap_age, 1)} hours old (> 3 hours)")
    elif live_count >= 2 and correction_applied:
        level = "high"
        reasons.append(f"{live_count} nearby ground stations live with CAMS calibration applied")
    elif live_count == 1:
        level = "medium"
        reasons.append("1 live ground station calibrating forecast")
    elif stale_count > 0:
        level = "medium"
        reasons.append(f"{stale_count} nearby stations have stale readings (> 3h old)")
    elif live_count == 0 and stale_count == 0:
        if snap_age <= 3.0:
            level = "medium"
            reasons.append("No active ground stations nearby; relying on fresh CAMS atmospheric model")
        else:
            level = "low"
            reasons.append("No ground stations and model snapshot is stale")

    # Add detail notes if stations are stale
    if stale_count > 0 and live_count > 0:
        reasons.append(f"{stale_count} of {len(station_summaries)} stations stale")

    return {
        "level": level,
        "reasons": reasons,
        "live_stations_count": live_count,
        "stale_stations_count": stale_count,
        "total_stations": len(station_summaries),
        "stations": evaluated_stations,
        "snapshot_age_hours": round(snap_age, 1),
    }
