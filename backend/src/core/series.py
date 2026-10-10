"""Series module: builds hourly and 15-minute interpolated air quality series."""
from __future__ import annotations
from datetime import datetime, timedelta
from typing import Any, Dict, List, Tuple


CPCB_BREAKPOINTS = [
    (0.0, 30.0, "Good"),
    (30.0001, 60.0, "Satisfactory"),
    (60.0001, 90.0, "Moderate"),
    (90.0001, 120.0, "Poor"),
    (120.0001, 250.0, "Very Poor"),
    (250.0001, 10000.0, "Severe"),
]


def classify_cpcb(pm25_val: float) -> str:
    """Assign Indian Central Pollution Control Board (CPCB) category based on PM2.5 (ug/m3)."""
    val = round(pm25_val, 1)
    if val <= 30.0:
        return "Good"
    if val <= 60.0:
        return "Satisfactory"
    if val <= 90.0:
        return "Moderate"
    if val <= 120.0:
        return "Poor"
    if val <= 250.0:
        return "Very Poor"
    return "Severe"


def parse_iso(ts_str: str) -> datetime:
    """Parse ISO timestamp, normalizing Z to UTC if present."""
    clean = ts_str.replace("Z", "+00:00")
    return datetime.fromisoformat(clean)


def build_time_series(
    hourly_times: List[str],
    hourly_pm25: List[float],
    hourly_temp: List[float],
    hourly_pm25_raw: List[float] | None = None,
) -> List[Dict[str, Any]]:
    """Builds a continuous 15-minute step time series via linear interpolation.
    
    Args:
        hourly_times: ISO 8601 timestamps for each hourly forecast point.
        hourly_pm25: Corrected (or base) PM2.5 values in ug/m3.
        hourly_temp: Temperature in degrees Celsius.
        hourly_pm25_raw: Optional uncalibrated PM2.5 values.
    
    Returns:
        List of 15-minute step points:
        [{time, pm25, pm25_raw, temp_c, category}]
    """
    if not hourly_times or len(hourly_times) != len(hourly_pm25) or len(hourly_times) != len(hourly_temp):
        raise ValueError("Mismatched hourly lengths for time, pm25, and temp")

    if hourly_pm25_raw is None:
        hourly_pm25_raw = list(hourly_pm25)

    n = len(hourly_times)
    if n == 0:
        return []

    datetimes = [parse_iso(t) for t in hourly_times]
    result: List[Dict[str, Any]] = []

    for i in range(n - 1):
        t0 = datetimes[i]
        t1 = datetimes[i + 1]
        dt_seconds = (t1 - t0).total_seconds()
        if dt_seconds <= 0:
            continue

        p0, p1 = hourly_pm25[i], hourly_pm25[i + 1]
        r0, r1 = hourly_pm25_raw[i], hourly_pm25_raw[i + 1]
        tmp0, tmp1 = hourly_temp[i], hourly_temp[i + 1]

        # Interpolate 4 points per hour (0, 15, 30, 45 minutes)
        num_steps = 4
        for step in range(num_steps):
            frac = step / float(num_steps)
            cur_time = t0 + timedelta(seconds=dt_seconds * frac)
            interp_pm25 = round(p0 + (p1 - p0) * frac, 1)
            interp_raw = round(r0 + (r1 - r0) * frac, 1)
            interp_temp = round(tmp0 + (tmp1 - tmp0) * frac, 1)
            cat = classify_cpcb(interp_pm25)

            result.append({
                "time": cur_time.isoformat(),
                "pm25": interp_pm25,
                "pm25_raw": interp_raw,
                "temp_c": interp_temp,
                "category": cat,
            })

    # Include final endpoint
    last_t = datetimes[-1]
    last_pm25 = round(hourly_pm25[-1], 1)
    last_raw = round(hourly_pm25_raw[-1], 1)
    last_temp = round(hourly_temp[-1], 1)
    result.append({
        "time": last_t.isoformat(),
        "pm25": last_pm25,
        "pm25_raw": last_raw,
        "temp_c": last_temp,
        "category": classify_cpcb(last_pm25),
    })

    return result
