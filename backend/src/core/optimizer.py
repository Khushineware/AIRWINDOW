"""Optimizer module: slides duration window to find the cleanest outdoor activity time."""
from __future__ import annotations
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
import math

from .exposure import compute_dose_ug, get_profile_weight, MODEL_CONFIG
from .series import parse_iso


class NoFeasibleSlotError(Exception):
    """Raised when no feasible time slot fits within the requested window."""
    code = "NO_FEASIBLE_SLOT"


def round_up_to_15_minutes(dt: datetime) -> datetime:
    """Rounds a datetime up to the nearest 15-minute boundary."""
    mins = dt.minute
    remainder = mins % 15
    if remainder == 0 and dt.second == 0 and dt.microsecond == 0:
        return dt.replace(second=0, microsecond=0)
    minutes_to_add = 15 - remainder
    rounded = dt.replace(second=0, microsecond=0) + timedelta(minutes=minutes_to_add)
    return rounded


def format_slot_label(start_dt: datetime, end_dt: datetime) -> str:
    """Format human-readable slot range (e.g., '1:30 – 2:15 PM')."""
    # Using 12-hour format with AM/PM
    s_hour = start_dt.hour % 12 or 12
    s_min = f"{start_dt.minute:02d}"
    s_ampm = "AM" if start_dt.hour < 12 else "PM"

    e_hour = end_dt.hour % 12 or 12
    e_min = f"{end_dt.minute:02d}"
    e_ampm = "AM" if end_dt.hour < 12 else "PM"

    if s_ampm == e_ampm:
        return f"{s_hour}:{s_min} – {e_hour}:{e_min} {e_ampm}"
    return f"{s_hour}:{s_min} {s_ampm} – {e_hour}:{e_min} {e_ampm}"


def optimize_schedule(
    series: List[Dict[str, Any]],
    activity: str,
    duration_min: int,
    window_start: str,
    window_end: str,
    profile: Optional[str] = "adult",
    usual_time: Optional[str] = None,
    mask: bool = False,
    now_iso: Optional[str] = None,
) -> Dict[str, Any]:
    """Finds the optimal time slot to minimize particulate dose and heat stress.
    
    Args:
        series: 15-minute step series [{time, pm25, temp_c, category, ...}]
        activity: activity name ('running', 'walking', 'cycling', 'sports')
        duration_min: activity duration (15 to 120 minutes)
        window_start: ISO timestamp or time string for search window start
        window_end: ISO timestamp or time string for search window end
        profile: user profile ('adult', 'child', 'sensitive')
        usual_time: optional user usual start time
        mask: whether wearing a mask
        now_iso: optional reference current time
    
    Returns:
        Dict with best, baseline, alternatives, candidates
    """
    if duration_min < 15 or duration_min > 120:
        raise ValueError("duration_min must be between 15 and 120 minutes")
    
    num_steps = max(1, duration_min // 15)
    heat_thresh = float(MODEL_CONFIG.get("heat_threshold_c", 35.0))
    heat_penalty_rate = float(MODEL_CONFIG.get("heat_penalty_per_c", 0.02))
    p_weight = get_profile_weight(profile)

    # Determine window datetimes
    w_start_dt = parse_iso(window_start)
    w_end_dt = parse_iso(window_end)

    if now_iso:
        cur_now = parse_iso(now_iso)
        earliest_start = round_up_to_15_minutes(cur_now)
        if w_start_dt < earliest_start:
            w_start_dt = earliest_start

    if w_start_dt >= w_end_dt:
        raise NoFeasibleSlotError("Search window start must precede window end after clipping to current time.")

    # Convert series times to datetimes for slicing
    series_points = []
    for pt in series:
        series_points.append({
            "dt": parse_iso(pt["time"]),
            "raw": pt,
        })

    # Find candidates
    candidates: List[Dict[str, Any]] = []
    n = len(series_points)

    for i in range(n - num_steps + 1):
        slot_start_dt = series_points[i]["dt"]
        slot_end_dt = slot_start_dt + timedelta(minutes=duration_min)

        if slot_start_dt < w_start_dt:
            continue
        if slot_end_dt > w_end_dt:
            continue

        slot_pts = series_points[i : i + num_steps]
        pm25_vals = [p["raw"]["pm25"] for p in slot_pts]
        temp_vals = [p["raw"]["temp_c"] for p in slot_pts]

        dose_ug = compute_dose_ug(pm25_vals, activity=activity, mask=mask)
        max_temp = max(temp_vals) if temp_vals else 25.0
        heat_penalty = max(0.0, max_temp - heat_thresh) * heat_penalty_rate
        rank_metric = dose_ug * (1.0 + heat_penalty)

        candidates.append({
            "index": i,
            "start_dt": slot_start_dt,
            "end_dt": slot_end_dt,
            "start": slot_start_dt.isoformat(),
            "end": slot_end_dt.isoformat(),
            "label": format_slot_label(slot_start_dt, slot_end_dt),
            "dose_ug": dose_ug,
            "temp_c": round(max_temp, 1),
            "heat_penalty": round(heat_penalty, 3),
            "rank_metric": rank_metric,
            "avg_pm25": round(sum(pm25_vals) / len(pm25_vals), 1) if pm25_vals else 0.0,
        })

    if not candidates:
        raise NoFeasibleSlotError("No feasible slot found in the requested window.")

    # Calculate exposure score relative to max candidate dose
    max_cand_dose = max(c["dose_ug"] for c in candidates)
    if max_cand_dose <= 0.0:
        max_cand_dose = 1.0

    for c in candidates:
        # Profile weight adjusts susceptibility scaling for exposure_score
        c["exposure_score"] = min(100, max(1, round(100.0 * (c["dose_ug"] * p_weight) / (max_cand_dose * p_weight))))

    # Best slot is lowest rank_metric
    sorted_by_rank = sorted(candidates, key=lambda x: (x["rank_metric"], x["dose_ug"]))
    best = sorted_by_rank[0]

    # Baseline determination
    baseline_cand = None
    baseline_kind = "typical"
    baseline_label = "a typical time in your window"

    if usual_time:
        # Check if usual_time matches any candidate start
        u_clean = usual_time.strip()
        for c in candidates:
            c_iso = c["start"]
            c_label = c["label"]
            # Match ISO, HH:MM, or time portion
            if u_clean in c_iso or u_clean in c_label:
                baseline_cand = c
                baseline_kind = "usual"
                baseline_label = "your usual time"
                break

    if baseline_cand is None:
        # Median dose slot
        sorted_by_dose = sorted(candidates, key=lambda x: x["dose_ug"])
        mid_idx = len(sorted_by_dose) // 2
        baseline_cand = sorted_by_dose[mid_idx]
        baseline_kind = "median"
        baseline_label = "a typical time in your window"

    b_dose = max(0.1, baseline_cand["dose_ug"])
    best_dose = best["dose_ug"]
    raw_red = round(100.0 * (b_dose - best_dose) / b_dose)
    reduction_pct = max(0, int(raw_red))

    # Top 2 non-overlapping alternatives
    alternatives: List[Dict[str, Any]] = []
    best_start = best["start_dt"]
    best_end = best["end_dt"]

    for c in sorted_by_rank:
        if c == best:
            continue
        c_start, c_end = c["start_dt"], c["end_dt"]
        # Non-overlapping with best
        if not (c_end <= best_start or c_start >= best_end):
            continue
        # Non-overlapping with existing chosen alternatives
        overlaps_existing = False
        for alt in alternatives:
            alt_s, alt_e = alt["start_dt"], alt["end_dt"]
            if not (c_end <= alt_s or c_start >= alt_e):
                overlaps_existing = True
                break
        if not overlaps_existing:
            alternatives.append(c)
            if len(alternatives) == 2:
                break

    # Strip datetime objects from return dictionary
    def clean_slot(s: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "start": s["start"],
            "end": s["end"],
            "label": s["label"],
            "dose_ug": s["dose_ug"],
            "exposure_score": s["exposure_score"],
            "temp_c": s["temp_c"],
            "reduction_pct": reduction_pct if s == best else max(0, int(round(100.0 * (b_dose - s["dose_ug"]) / b_dose))),
        }

    return {
        "best": clean_slot(best),
        "baseline": {
            "start": baseline_cand["start"],
            "end": baseline_cand["end"],
            "label": baseline_label,
            "dose_ug": baseline_cand["dose_ug"],
            "exposure_score": baseline_cand["exposure_score"],
            "temp_c": baseline_cand["temp_c"],
            "kind": baseline_kind,
        },
        "alternatives": [clean_slot(a) for a in alternatives],
        "candidates_count": len(candidates),
    }
