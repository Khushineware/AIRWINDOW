"""Open-Meteo client: fetches air quality (CAMS), weather forecasts, and geocoded locations."""
from __future__ import annotations
import urllib.parse
import urllib.request
import json
import logging
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# Bounding box for India: Lat 6 to 37 N, Lon 68 to 98 E
INDIA_BBOX = {
    "min_lat": 6.0,
    "max_lat": 37.0,
    "min_lon": 68.0,
    "max_lon": 98.0,
}


def is_within_india(lat: float, lon: float) -> bool:
    """Verify coordinate falls strictly within Indian territorial bounding box."""
    return (
        INDIA_BBOX["min_lat"] <= lat <= INDIA_BBOX["max_lat"]
        and INDIA_BBOX["min_lon"] <= lon <= INDIA_BBOX["max_lon"]
    )


def _http_get_json(url: str, timeout_sec: float = 8.0) -> Dict[str, Any]:
    """Execute HTTP GET with standard urllib (no third-party dependencies required)."""
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "AirWindow/1.0 (India Clean Activity Planner; contact@airwindow.in)"},
    )
    with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
        if resp.status != 200:
            raise RuntimeError(f"HTTP error {resp.status} fetching {url}")
        body = resp.read().decode("utf-8")
        return json.loads(body)


def search_locations(query: str, limit: int = 8) -> List[Dict[str, Any]]:
    """Search Indian locations using Open-Meteo Geocoding API."""
    if not query or len(query.strip()) < 2:
        return []

    # VERIFY parameter names against official Open-Meteo docs:
    # endpoint: https://geocoding-api.open-meteo.com/v1/search
    params = {
        "name": query.strip(),
        "count": limit,
        "language": "en",
        "format": "json",
    }
    url = f"https://geocoding-api.open-meteo.com/v1/search?{urllib.parse.urlencode(params)}"
    data = _http_get_json(url)

    results: List[Dict[str, Any]] = []
    for item in data.get("results", []):
        lat = float(item.get("latitude", 0.0))
        lon = float(item.get("longitude", 0.0))
        country_code = item.get("country_code", "").upper()

        # Filter strictly for India
        if country_code == "IN" or is_within_india(lat, lon):
            results.append({
                "name": item.get("name"),
                "admin": item.get("admin1") or item.get("admin2") or item.get("country", "India"),
                "lat": round(lat, 4),
                "lon": round(lon, 4),
            })
    return results


def fetch_cams_pm25(lat: float, lon: float) -> Dict[str, Any]:
    """Fetch hourly PM2.5 CAMS atmospheric model data from Open-Meteo Air Quality API."""
    if not is_within_india(lat, lon):
        raise ValueError(f"Coordinates ({lat}, {lon}) outside India coverage")

    # VERIFY: CAMS PM2.5 parameters: hourly=pm2_5, timezone=Asia/Kolkata, past_days=2, forecast_days=2
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": "pm2_5",
        "timezone": "Asia/Kolkata",
        "past_days": 2,
        "forecast_days": 2,
    }
    url = f"https://air-quality-api.open-meteo.com/v1/air-quality?{urllib.parse.urlencode(params)}"
    return _http_get_json(url)


def fetch_weather_forecast(lat: float, lon: float) -> Dict[str, Any]:
    """Fetch hourly temperature from Open-Meteo Forecast API."""
    if not is_within_india(lat, lon):
        raise ValueError(f"Coordinates ({lat}, {lon}) outside India coverage")

    # VERIFY: temperature_2m, timezone=Asia/Kolkata, past_days=2, forecast_days=2
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": "temperature_2m",
        "timezone": "Asia/Kolkata",
        "past_days": 2,
        "forecast_days": 2,
    }
    url = f"https://api.open-meteo.com/v1/forecast?{urllib.parse.urlencode(params)}"
    return _http_get_json(url)


def fetch_aligned_forecast(lat: float, lon: float) -> Tuple[List[str], List[float], List[float]]:
    """Fetch and align CAMS PM2.5 and temperature hourly arrays.
    
    Returns:
        (hourly_times, hourly_pm25, hourly_temp)
    """
    aq_data = fetch_cams_pm25(lat, lon)
    wx_data = fetch_weather_forecast(lat, lon)

    aq_hourly = aq_data.get("hourly", {})
    wx_hourly = wx_data.get("hourly", {})

    aq_times: List[str] = aq_hourly.get("time", [])
    aq_pm25: List[float] = aq_hourly.get("pm2_5", [])

    wx_times: List[str] = wx_hourly.get("time", [])
    wx_temps: List[float] = wx_hourly.get("temperature_2m", [])

    # Map temperature by timestamp
    temp_lookup = {t: tmp for t, tmp in zip(wx_times, wx_temps) if tmp is not None}

    aligned_times: List[str] = []
    aligned_pm25: List[float] = []
    aligned_temp: List[float] = []

    for t, p in zip(aq_times, aq_pm25):
        if p is None:
            continue
        temp_val = temp_lookup.get(t, 25.0)
        aligned_times.append(t)
        aligned_pm25.append(float(p))
        aligned_temp.append(float(temp_val))

    return aligned_times, aligned_pm25, aligned_temp
