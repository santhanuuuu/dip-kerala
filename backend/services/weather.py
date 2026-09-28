"""
weather.py -- fetches LIVE rainfall from Open-Meteo. Results are cached in-memory for 10
minutes per ~1km grid cell; terrain features are static and come from the database instead
(seeded once from the GEE-derived feature store).

API KEY, WHY THIS MATTERS NOW: Open-Meteo's anonymous free tier rate-limits by IP address.
Render's free-tier outbound IPs are SHARED across many unrelated customers' apps -- confirmed
in production logs that even a single, first-of-the-day request now gets a 429, which means
the shared IP's reputation is being exhausted by traffic this app has no control over, not by
our own request volume. Batching/caching alone cannot fix a limit tripped by other tenants on
the same IP. The real fix is a free Open-Meteo API key (https://open-meteo.com/en/pricing --
the "Free" tier, no cost), which gets a DEDICATED per-key quota via their customer-api
subdomain, completely decoupled from the shared-IP problem.

Set OPEN_METEO_API_KEY in the environment once you have one. Until then, this falls back to
the anonymous endpoint exactly as before -- so this change is safe to deploy immediately even
before you've registered a key, and starts working fully the moment the key is added.
"""
import os
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from datetime import date, timedelta, datetime, timezone

OPEN_METEO_API_KEY = os.environ.get("OPEN_METEO_API_KEY", "")
# Same request shape either way -- only the host and an added apikey param differ.
OPEN_METEO_URL = (
    "https://customer-api.open-meteo.com/v1/forecast" if OPEN_METEO_API_KEY
    else "https://api.open-meteo.com/v1/forecast"
)
REQUEST_TIMEOUT = 15
CACHE_TTL_SECONDS = 600

_weather_cache: dict[tuple[float, float], tuple[datetime, dict]] = {}

_session = requests.Session()
_retry = Retry(
    total=2,
    backoff_factor=0.5,
    status_forcelist=[429, 500, 502, 503, 504],
    allowed_methods=["GET"],
)
_adapter = HTTPAdapter(max_retries=_retry)
_session.mount("https://", _adapter)

if OPEN_METEO_API_KEY:
    print("weather.py: using Open-Meteo customer API (dedicated per-key quota)")
else:
    print("weather.py: OPEN_METEO_API_KEY not set -- using anonymous shared-IP endpoint, "
          "which is known to be unreliable on Render's shared free-tier IPs. Register a free "
          "key at https://open-meteo.com/en/pricing and set OPEN_METEO_API_KEY to fix this properly.")


def _with_api_key(params: dict) -> dict:
    if OPEN_METEO_API_KEY:
        return {**params, "apikey": OPEN_METEO_API_KEY}
    return params


def _cache_key(lat: float, lon: float) -> tuple[float, float]:
    return (round(lat, 2), round(lon, 2))


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


def _parse_entry(entry: dict) -> dict:
    daily = entry.get("daily", {})
    values = [v for v in daily.get("precipitation_sum", []) if v is not None]
    return {
        "rainfall_7day_mm": sum(values) if values else 0.0,
        "daily_breakdown": dict(zip(daily.get("time", []), daily.get("precipitation_sum", []))),
        "current_temperature_c": entry.get("current", {}).get("temperature_2m"),
        "current_humidity_pct": entry.get("current", {}).get("relative_humidity_2m"),
        "current_wind_kmh": entry.get("current", {}).get("wind_speed_10m"),
        "is_stale": False,
    }


def fetch_live_weather(lat: float, lon: float) -> dict:
    """Single-location fetch, used by the individual place-search endpoint."""
    key = _cache_key(lat, lon)
    now = datetime.now(timezone.utc)
    cached = _weather_cache.get(key)
    if cached is not None:
        ts, result = cached
        if (now - ts).total_seconds() < CACHE_TTL_SECONDS:
            return result

    end_date = date.today()
    start_date = end_date - timedelta(days=6)
    params = _with_api_key({
        "latitude": lat,
        "longitude": lon,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "daily": "precipitation_sum",
        "current": "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m",
        "timezone": "auto",
    })

    try:
        response = _session.get(OPEN_METEO_URL, params=params, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
    except requests.RequestException as e:
        print(f"Open-Meteo fetch failed for ({lat}, {lon}): {type(e).__name__}: {e}")
        return _fallback_weather(key)

    result = _parse_entry(response.json())
    _weather_cache[key] = (now, result)
    return result


def fetch_live_weather_batch(coords: list[tuple[float, float]]) -> dict[tuple[float, float], dict]:
    """Fetches weather for MANY locations in ONE Open-Meteo request, using Open-Meteo's own
    support for comma-separated latitude/longitude lists, instead of one request per place.
    Returns a dict keyed by the SAME rounded (lat, lon) tuples _cache_key() would produce."""
    if not coords:
        return {}

    now = datetime.now(timezone.utc)
    results: dict[tuple[float, float], dict] = {}
    to_fetch: list[tuple[float, float]] = []
    for lat, lon in coords:
        key = _cache_key(lat, lon)
        cached = _weather_cache.get(key)
        if cached is not None:
            ts, result = cached
            if (now - ts).total_seconds() < CACHE_TTL_SECONDS:
                results[key] = result
                continue
        to_fetch.append((lat, lon))

    unique_to_fetch = list(dict.fromkeys(to_fetch))

    if unique_to_fetch:
        end_date = date.today()
        start_date = end_date - timedelta(days=6)
        params = _with_api_key({
            "latitude": ",".join(str(lat) for lat, lon in unique_to_fetch),
            "longitude": ",".join(str(lon) for lat, lon in unique_to_fetch),
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "daily": "precipitation_sum",
            "current": "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m",
            "timezone": "auto",
        })
        try:
            response = _session.get(OPEN_METEO_URL, params=params, timeout=REQUEST_TIMEOUT * 2)
            response.raise_for_status()
            data = response.json()
            entries = data if isinstance(data, list) else [data]
            for (lat, lon), entry in zip(unique_to_fetch, entries):
                key = _cache_key(lat, lon)
                result = _parse_entry(entry)
                _weather_cache[key] = (now, result)
                results[key] = result
        except requests.RequestException as e:
            print(f"Open-Meteo BATCH fetch failed for {len(unique_to_fetch)} locations: {type(e).__name__}: {e}")
            for lat, lon in unique_to_fetch:
                key = _cache_key(lat, lon)
                if key not in results:
                    results[key] = _fallback_weather(key)

    for lat, lon in coords:
        key = _cache_key(lat, lon)
        if key not in results:
            results[key] = _fallback_weather(key)

    return results