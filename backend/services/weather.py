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

    IMPORTANT CAVEAT: this climatological number is a coarse SEASONAL AVERAGE (e.g. "a typical
    September week sees ~130mm across Kerala"), not today's actual rainfall. If the live fetch
    keeps failing (see fetch_live_weather_batch, which is what the alerts scan uses to avoid
    this in the first place), every place silently falls back to this same generic number
    regardless of whether it's actually raining right now -- which can make flood risk look
    uniformly elevated even during a genuinely dry spell. is_climatological_estimate=True
    flags exactly this so callers/UI can disclose it honestly.
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
    """Single-location fetch, used by the individual place-search endpoint (infrequent,
    one request at a time -- not the source of the 429 rate-limiting)."""
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

    THIS IS THE ACTUAL FIX for the alerts scan showing inflated/wrong flood risk: scanning
    up to 50 places used to fire up to 50 separate requests (even spread across a small
    thread pool), and Open-Meteo's free tier rate-limits that hard -- confirmed in Render's
    logs as repeated "429 Too Many Requests" errors. Every one of those failures silently
    fell back to a generic seasonal-average rainfall number (see _fallback_weather), which
    is why places showed "high flood risk" even during an actual dry spell: the model was
    reacting correctly to its rainfall input, but that input was a fake monsoon-average
    figure, not today's real rainfall. Collapsing 50 requests into 1 avoids the rate limit
    entirely instead of just retrying around it.

    Returns a dict keyed by the SAME rounded (lat, lon) tuples _cache_key() would produce,
    so callers look up results with _cache_key(lat, lon).
    """
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

    # De-duplicate identical rounded coordinates so the batch request (and Open-Meteo's
    # per-request location limit) isn't wasted re-fetching the same grid cell twice.
    unique_to_fetch = list(dict.fromkeys(to_fetch))

    if unique_to_fetch:
        end_date = date.today()
        start_date = end_date - timedelta(days=6)
        params = {
            "latitude": ",".join(str(lat) for lat, lon in unique_to_fetch),
            "longitude": ",".join(str(lon) for lat, lon in unique_to_fetch),
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "daily": "precipitation_sum",
            "current": "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m",
            "timezone": "auto",
        }
        try:
            response = _session.get(OPEN_METEO_URL, params=params, timeout=REQUEST_TIMEOUT * 2)
            response.raise_for_status()
            data = response.json()
            # Open-Meteo returns a LIST when multiple coordinates are requested, a plain
            # dict when there's only one -- normalize to a list either way.
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

    # Ensure every originally-requested coordinate has an entry, even duplicates.
    for lat, lon in coords:
        key = _cache_key(lat, lon)
        if key not in results:
            results[key] = _fallback_weather(key)

    return results