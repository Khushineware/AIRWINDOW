"""OpenAQ client: queries nearby continuous monitoring stations for PM2.5 ground observations."""
from __future__ import annotations
import math
import os
import urllib.parse
import urllib.request
import json
import logging
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate great-circle distance between two geographic coordinates in kilometers."""
    r = 6371.0  # Earth radius in kilometers
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2.0) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


def fetch_nearby_stations(
    lat: float,
    lon: float,
    radius_km: float = 25.0,
    api_key: Optional[str] = None,
    timeout_sec: float = 6.0,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Fetch nearby PM2.5 ground stations and their observations.
    
    Returns:
        (station_summaries, observations)
        station_summaries: [{name, distance_km, last_reading, status}]
        observations: [{station_id, distance_km, time, pm25}]
    """
    key = api_key or os.environ.get("OPENAQ_API_KEY", "").strip()
    
    # VERIFY parameter names against official OpenAQ API v3/v2 documentation
    # For OpenAQ v2/v3 query:
    headers = {
        "User-Agent": "AirWindow/1.0 (Air Quality Calibration; contact@airwindow.in)",
    }
    if key:
        headers["X-API-Key"] = key

    # Radius in meters for OpenAQ locations endpoint
    radius_meters = int(radius_km * 1000)
    params = {
        "coordinates": f"{lat},{lon}",
        "radius": radius_meters,
        "parameter": "pm25",
        "limit": 10,
    }
    url = f"https://api.openaq.org/v2/locations?{urllib.parse.urlencode(params)}"

    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
            if resp.status != 200:
                logger.warning(f"OpenAQ returned status {resp.status}")
                return [], []
            body = resp.read().decode("utf-8")
            data = json.loads(body)
    except Exception as e:
        # TODO / VERIFY: Upstream OpenAQ service failure or rate limiting handling
        logger.info(f"OpenAQ request skipped or failed: {e}")
        return [], []

    results = data.get("results", [])
    station_summaries: List[Dict[str, Any]] = []
    observations: List[Dict[str, Any]] = []

    for item in results:
        coords = item.get("coordinates", {})
        st_lat = coords.get("latitude")
        st_lon = coords.get("longitude")
        if st_lat is None or st_lon is None:
            continue

        dist = haversine_distance_km(lat, lon, float(st_lat), float(st_lon))
        if dist > radius_km:
            continue

        st_id = str(item.get("id", item.get("name", "station")))
        st_name = item.get("name") or f"Station {st_id}"
        
        # Check parameters
        last_updated = None
        latest_val = None
        for param in item.get("parameters", []):
            if param.get("parameter") == "pm25":
                last_updated = param.get("lastUpdated")
                latest_val = param.get("lastValue")
                break

        station_summaries.append({
            "id": st_id,
            "name": st_name,
            "distance_km": round(dist, 1),
            "last_reading": last_updated,
            "latest_pm25": latest_val,
        })

        if last_updated and latest_val is not None:
            observations.append({
                "station_id": st_id,
                "distance_km": round(dist, 1),
                "time": last_updated,
                "pm25": float(latest_val),
            })

    return station_summaries, observations
