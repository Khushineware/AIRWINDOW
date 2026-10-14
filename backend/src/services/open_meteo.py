"""Open-Meteo client: fetches air quality (CAMS), weather forecasts, and geocoded locations."""
from __future__ import annotations
import os
import urllib.parse
import urllib.request
import urllib.error
import json
import logging
import time
import random
import threading
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# Bounding box for India: Lat 6 to 37 N, Lon 68 to 98 E
INDIA_BBOX = {
    "min_lat": 6.0,
    "max_lat": 37.0,
    "min_lon": 68.0,
    "max_lon": 98.0,
}

_CACHE_LOCK = threading.Lock()
# Thread-safe in-memory cache keyed by full URL -> {"timestamp": float, "data": Dict[str, Any]}
_HTTP_CACHE: Dict[str, Dict[str, Any]] = {}
_CACHE_TTL_SEC = 30 * 60  # 30 minutes
_MAX_STALE_SEC = 6 * 3600  # 6 hours

# In-flight request coalescing state
class _InFlightRequest:
    def __init__(self):
        self.event = threading.Event()
        self.data: Optional[Dict[str, Any]] = None
        self.exception: Optional[Exception] = None

_IN_FLIGHT_LOCK = threading.Lock()
_IN_FLIGHT: Dict[str, _InFlightRequest] = {}


def is_within_india(lat: float, lon: float) -> bool:
    """Verify coordinate falls strictly within Indian territorial bounding box."""
    return (
        INDIA_BBOX["min_lat"] <= lat <= INDIA_BBOX["max_lat"]
        and INDIA_BBOX["min_lon"] <= lon <= INDIA_BBOX["max_lon"]
    )


def _extract_url_target(url: str) -> str:
    """Extract location name or coordinates from URL for clear logging in Render logs."""
    try:
        parsed = urllib.parse.urlparse(url)
        qs = urllib.parse.parse_qs(parsed.query)
        if "latitude" in qs and "longitude" in qs:
            return f"coords ({qs['latitude'][0]}, {qs['longitude'][0]})"
        if "name" in qs:
            return f"query '{qs['name'][0]}'"
    except Exception:
        pass
    return url


def _fetch_direct_or_proxy(url: str, timeout_sec: float) -> Dict[str, Any]:
    """Execute outside HTTP request with retries, exponential backoff, jitter, and proxy fallback."""
    target_info = _extract_url_target(url)
    max_attempts = 4
    last_exc: Optional[Exception] = None

    for attempt in range(max_attempts):
        attempt_num = attempt + 1
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "AirWindow/1.0 (hackathon project)",
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
                if resp.status != 200:
                    if resp.status == 429 or 500 <= resp.status < 600:
                        raise urllib.error.HTTPError(
                            url, resp.status, f"HTTP {resp.status}", resp.headers, None
                        )
                    raise RuntimeError(f"HTTP error {resp.status} fetching {url}")

                body = resp.read().decode("utf-8")
                data = json.loads(body)
                return data

        except urllib.error.HTTPError as e:
            last_exc = e
            logger.warning(
                f"[AirWindow Open-Meteo] HTTP {e.code} for {target_info} (attempt {attempt_num}/{max_attempts})"
            )
            print(
                f"[AirWindow Open-Meteo] HTTP {e.code} for {target_info} (attempt {attempt_num}/{max_attempts})"
            )

            # Retry on 429 and 5xx
            if e.code == 429 or 500 <= e.code < 600:
                if attempt < max_attempts - 1:
                    wait_sec = None
                    if e.headers:
                        retry_after = e.headers.get("Retry-After")
                        if retry_after:
                            try:
                                wait_sec = float(retry_after)
                            except (ValueError, TypeError):
                                wait_sec = None

                    if wait_sec is None:
                        base = 1.0 * (2 ** attempt)
                        jitter = random.uniform(0.1, 0.5)
                        wait_sec = base + jitter

                    # Max 8 seconds wait per attempt
                    wait_sec = min(8.0, max(0.5, wait_sec))
                    logger.warning(
                        f"[AirWindow Open-Meteo] Retrying {target_info} in {wait_sec:.2f}s..."
                    )
                    time.sleep(wait_sec)
                    continue
            else:
                break

        except (urllib.error.URLError, TimeoutError, OSError) as e:
            last_exc = e
            logger.warning(
                f"[AirWindow Open-Meteo] Network error for {target_info} (attempt {attempt_num}/{max_attempts}): {e}"
            )
            print(
                f"[AirWindow Open-Meteo] Network error for {target_info} (attempt {attempt_num}/{max_attempts}): {e}"
            )
            if attempt < max_attempts - 1:
                base = 1.0 * (2 ** attempt)
                wait_sec = min(8.0, base + random.uniform(0.1, 0.5))
                time.sleep(wait_sec)
                continue

    # Secondary route: if direct requests still fail with 429 or 5xx, try OPEN_METEO_PROXY if set
    proxy_base = os.environ.get("OPEN_METEO_PROXY", "").strip()
    if proxy_base and isinstance(last_exc, urllib.error.HTTPError) and (last_exc.code == 429 or 500 <= last_exc.code < 600):
        try:
            proxy_url = f"{proxy_base.rstrip('/')}?u={urllib.parse.quote(url, safe='')}"
            logger.info(f"[AirWindow Open-Meteo] Attempting proxy fallback via OPEN_METEO_PROXY for {target_info}")
            print(f"[AirWindow Open-Meteo] Attempting proxy fallback via OPEN_METEO_PROXY for {target_info}")
            proxy_req = urllib.request.Request(
                proxy_url,
                headers={
                    "User-Agent": "AirWindow/1.0 (hackathon project)",
                    "Accept": "application/json",
                },
            )
            with urllib.request.urlopen(proxy_req, timeout=timeout_sec) as resp:
                if resp.status == 200:
                    body = resp.read().decode("utf-8")
                    data = json.loads(body)
                    return data
        except Exception as proxy_err:
            logger.warning(f"[AirWindow Open-Meteo] Proxy attempt failed for {target_info}: {proxy_err}")
            print(f"[AirWindow Open-Meteo] Proxy attempt failed for {target_info}: {proxy_err}")

    # Stale-if-error: if all attempts fail but cached value exists (any age up to 6 hours), return it
    with _CACHE_LOCK:
        if url in _HTTP_CACHE:
            entry = _HTTP_CACHE[url]
            age_sec = time.time() - entry["timestamp"]
            if age_sec <= _MAX_STALE_SEC:
                logger.warning(
                    f"[AirWindow Open-Meteo] All attempts failed for {target_info} ({last_exc}). "
                    f"Returning stale cached data (age: {age_sec / 60:.1f}m)."
                )
                print(
                    f"[AirWindow Open-Meteo] Returning stale cached data for {target_info} (age: {age_sec / 60:.1f}m)."
                )
                return entry["data"]

    if last_exc:
        raise last_exc
    raise RuntimeError(f"Failed to fetch {url} after {max_attempts} attempts.")


def _http_get_json(url: str, timeout_sec: float = 20.0) -> Dict[str, Any]:
    """Execute HTTP GET with standard urllib, thread-safe cache, coalescing, retries, and stale fallback."""
    now = time.time()
    with _CACHE_LOCK:
        if url in _HTTP_CACHE:
            entry = _HTTP_CACHE[url]
            if now - entry["timestamp"] < _CACHE_TTL_SEC:
                logger.debug(f"Cache hit for {url}")
                return entry["data"]

    # In-flight request coalescing
    with _IN_FLIGHT_LOCK:
        if url in _IN_FLIGHT:
            req = _IN_FLIGHT[url]
            is_leader = False
        else:
            req = _InFlightRequest()
            _IN_FLIGHT[url] = req
            is_leader = True

    if not is_leader:
        # Follower waits for the leader request to complete
        req.event.wait(timeout=timeout_sec + 35.0)
        if req.exception is not None:
            raise req.exception
        if req.data is not None:
            return req.data

        # Fallback in case of unexpected state: check cache
        with _CACHE_LOCK:
            if url in _HTTP_CACHE:
                return _HTTP_CACHE[url]["data"]
        raise RuntimeError(f"In-flight request timed out for {url}")

    # Leader executes outside call
    try:
        data = _fetch_direct_or_proxy(url, timeout_sec)
        req.data = data
        with _CACHE_LOCK:
            _HTTP_CACHE[url] = {"timestamp": time.time(), "data": data}
        return data
    except Exception as exc:
        req.exception = exc
        raise
    finally:
        with _IN_FLIGHT_LOCK:
            _IN_FLIGHT.pop(url, None)
        req.event.set()


def search_locations(query: str, limit: int = 8) -> List[Dict[str, Any]]:
    """Search Indian locations using Open-Meteo Geocoding API."""
    if not query or len(query.strip()) < 2:
        return []

    # Endpoint: https://geocoding-api.open-meteo.com/v1/search
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

    params = {
        "latitude": round(lat, 4),
        "longitude": round(lon, 4),
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

    params = {
        "latitude": round(lat, 4),
        "longitude": round(lon, 4),
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
