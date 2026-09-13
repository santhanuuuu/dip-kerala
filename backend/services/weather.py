"""
weather.py -- fetches LIVE rainfall from Open-Meteo (free, no API key). Results are cached
in-memory for 10 minutes per ~1km grid cell; terrain features are static and come from the
database instead (seeded once from the GEE-derived feature store).
"""
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from datetime import date, timedelta, datetime, timezone

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
REQUEST_TIMEOUT = 30
CACHE_TTL_SECONDS = 600

_weather_cache: dict[tuple[float, float], tuple[datetime, dict]] = {}

_session = requests.Session()
_retry = Retry(
    total=4,
    backoff_factor=1.0,  # 1s, 2s, 4s, 8s -- gives Open-Meteo's free-tier rate limit time to reset
    status_forcelist=[429, 500, 502, 503, 504],
    allowed_methods=["GET"],
)
_adapter = HTTPAdapter(max_retries=_retry)
_session.mount("https://", _adapter)


def _cache_key(lat: float, lon: float) -> tuple[float, float]:
    return (round(lat, 2), round(lon, 2))


# Rough monthly rainfall climatology for Kerala (mm/week), used only as an absolute last
# resort when Open-Meteo is unreachable AND no cached value exists anywhere yet (e.g. the
# very first query after a deploy, before any cache has been populated). This is a coarse
# statewide seasonal average, not a live measurement -- always returned with
# is_climatological_estimate=True so callers can disclose it honestly rather than
# presenting it as real-time data.
_MONTHLY_CLIMATOLOGY_MM_PER_WEEK = {
    1: 5, 2: 8, 3: 15, 4: 40, 5: 90,
    6: 220, 7: 200, 8: 180, 9: 130,
    10: 90, 11: 40, 12: 15,
}


def _fallback_weather(key: tuple[float, float]) -> dict:
    """Called when a live Open-Meteo fetch fails even after retries. Tries progressively
    less-precise fallbacks so a risk query never hard-fails outright:
    1. The exact cached grid cell, even if past its normal freshness window.
    2. Any other cached location at all (rainfall over a ~1km grid is a reasonable proxy
       across a small state like Kerala for a short outage).
    3. A monthly climatological estimate for the current month, as an absolute last resort.
    """
    exact = _weather_cache.get(key)
    if exact is not None:
        _, result = exact
        return {**result, "is_stale": True}

    if _weather_cache:
        _, (_, nearest_result) = next(iter(_weather_cache.items()))
        return {**nearest_result, "is_stale": True}

    month = datetime.now(timezone.utc).month
    return {
        "rainfall_7day_mm": float(_MONTHLY_CLIMATOLOGY_MM_PER_WEEK[month]),
        "daily_breakdown": {},
        "current_temperature_c": None,
        "current_humidity_pct": None,
        "current_wind_kmh": None,
        "is_stale": True,
        "is_climatological_estimate": True,
    }


def fetch_live_weather(lat: float, lon: float) -> dict:
    """Returns past-7-day rainfall total (matches the training window used in Notebook 00/01/02)
    plus current conditions for display. Raises requests.RequestException on network failure --
    callers should catch this and decide whether to fail the request or degrade gracefully."""
    key = _cache_key(lat, lon)
    now = datetime.now(timezone.utc)
    cached = _weather_cache.get(key)
    if cached is not None:
        ts, result = cached
        if (now - ts).total_seconds() < CACHE_TTL_SECONDS:
            return result

    end_date = date.today()
    start_date = end_date - timedelta(days=6)

    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "daily": "precipitation_sum",
        "current": "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m",
        "timezone": "auto",
    }
    response = _session.get(OPEN_METEO_URL, params=params, timeout=REQUEST_TIMEOUT)
    try:
        response.raise_for_status()
    except requests.RequestException:
        return _fallback_weather(key)
    data = response.json()

    daily = data.get("daily", {})
    values = [v for v in daily.get("precipitation_sum", []) if v is not None]

    result = {
        "rainfall_7day_mm": sum(values) if values else 0.0,
        "daily_breakdown": dict(zip(daily.get("time", []), daily.get("precipitation_sum", []))),
        "current_temperature_c": data.get("current", {}).get("temperature_2m"),
        "current_humidity_pct": data.get("current", {}).get("relative_humidity_2m"),
        "current_wind_kmh": data.get("current", {}).get("wind_speed_10m"),
        "is_stale": False,
    }
    _weather_cache[key] = (now, result)
    return result