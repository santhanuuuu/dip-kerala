"""
weather.py -- fetches LIVE rainfall + current conditions from WeatherAPI.com. Results are
cached in-memory for 10 minutes per ~1km grid cell; terrain features are static and come from
the database instead (seeded once from the GEE-derived feature store).

WHY WEATHERAPI.COM, NOT OPEN-METEO: Open-Meteo's free tier is IP-based, not key-based --
confirmed directly from Open-Meteo's own docs/terms that a free API KEY does not exist, only a
paid commercial one. Render's free-tier outbound IPs are SHARED across many unrelated
customers' apps, so even a single first-of-the-day request gets a 429 -- confirmed repeatedly
in production logs (`RetryError ... too many 429 error responses`), and this is NOT fixable by
reducing our own request volume, since the limit is being tripped by other tenants on the same
shared IP. WeatherAPI.com's free tier is genuinely key-based (no credit card required), so it
gets its own dedicated quota completely decoupled from whatever else is sharing Render's IP
pool.

SETUP: sign up free at https://www.weatherapi.com/signup.aspx, copy the API key from your
dashboard, and set WEATHERAPI_KEY in Render's environment variables (or backend/.env locally).
Until that's set, every call falls back to the climatological estimate below -- the app still
runs, it just can't show real live weather.
"""
import os
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from datetime import date, timedelta, datetime, timezone

WEATHERAPI_KEY = os.environ.get("WEATHERAPI_KEY", "")
WEATHERAPI_HISTORY_URL = "https://api.weatherapi.com/v1/history.json"
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

if WEATHERAPI_KEY:
    print("weather.py: using WeatherAPI.com (key-based, dedicated per-account quota)")
else:
    print("weather.py: WEATHERAPI_KEY not set -- every call will fall back to the "
          "climatological estimate until this is set. Sign up free at "
          "https://www.weatherapi.com/signup.aspx and set WEATHERAPI_KEY.")


def _cache_key(lat: float, lon: float) -> tuple[float, float]:
    return (round(lat, 2), round(lon, 2))


_MONTHLY_CLIMATOLOGY_MM_PER_WEEK = {
    1: 5, 2: 8, 3: 15, 4: 40, 5: 90,
    6: 220, 7: 200, 8: 180, 9: 130,
    10: 90, 11: 40, 12: 15,
}


def _fallback_weather(key: tuple[float, float]) -> dict:
    """Called when a live WeatherAPI.com fetch fails (no key set, or a genuine outage). Tries
    progressively less-precise fallbacks so a risk query never hard-fails outright:
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


def _parse_history_response(data: dict) -> dict:
    """Sums each returned day's totalprecip_mm for the 7-day rainfall total, and reads the
    LATEST hour across all returned days for current temp/humidity/wind -- avoids a second
    API call just to get "right now" conditions."""
    forecast_days = data.get("forecast", {}).get("forecastday", [])
    total_rain = 0.0
    daily_breakdown: dict[str, float] = {}
    latest_hour = None
    latest_hour_time = None

    for day_entry in forecast_days:
        day_date = day_entry.get("date")
        day_data = day_entry.get("day", {})
        precip = day_data.get("totalprecip_mm")
        if precip is not None:
            total_rain += precip
            daily_breakdown[day_date] = precip

        for hour_entry in day_entry.get("hour", []):
            hour_time = hour_entry.get("time")
            if hour_time and (latest_hour_time is None or hour_time > latest_hour_time):
                latest_hour_time = hour_time
                latest_hour = hour_entry

    return {
        "rainfall_7day_mm": total_rain,
        "daily_breakdown": daily_breakdown,
        "current_temperature_c": latest_hour.get("temp_c") if latest_hour else None,
        "current_humidity_pct": latest_hour.get("humidity") if latest_hour else None,
        "current_wind_kmh": latest_hour.get("wind_kph") if latest_hour else None,
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

    if not WEATHERAPI_KEY:
        return _fallback_weather(key)

    end_date = date.today()
    start_date = end_date - timedelta(days=6)
    params = {
        "key": WEATHERAPI_KEY,
        "q": f"{lat},{lon}",
        "dt": start_date.isoformat(),
        "end_dt": end_date.isoformat(),
    }

    try:
        response = _session.get(WEATHERAPI_HISTORY_URL, params=params, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
    except requests.RequestException as e:
        print(f"WeatherAPI.com fetch failed for ({lat}, {lon}): {type(e).__name__}: {e}")
        return _fallback_weather(key)

    result = _parse_history_response(response.json())
    _weather_cache[key] = (now, result)
    return result


def fetch_live_weather_batch(coords: list[tuple[float, float]]) -> dict[tuple[float, float], dict]:
    """WeatherAPI.com's history endpoint doesn't support multiple locations in one call (no
    comma-separated lat/lon list the way Open-Meteo did), so this loops per-UNCACHED location,
    one request each -- but one request per location per CACHE_TTL_SECONDS window (10 min), not
    one per place per page load, and the date-range history call still gets 7 days of rainfall
    in that single request. Returns a dict keyed by the SAME rounded (lat, lon) tuples
    _cache_key() would produce, matching the interface routers/risk.py already depends on."""
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

    if not WEATHERAPI_KEY:
        for lat, lon in unique_to_fetch:
            key = _cache_key(lat, lon)
            results[key] = _fallback_weather(key)
    else:
        end_date = date.today()
        start_date = end_date - timedelta(days=6)
        for lat, lon in unique_to_fetch:
            key = _cache_key(lat, lon)
            params = {
                "key": WEATHERAPI_KEY,
                "q": f"{lat},{lon}",
                "dt": start_date.isoformat(),
                "end_dt": end_date.isoformat(),
            }
            try:
                response = _session.get(WEATHERAPI_HISTORY_URL, params=params, timeout=REQUEST_TIMEOUT)
                response.raise_for_status()
                result = _parse_history_response(response.json())
                _weather_cache[key] = (now, result)
                results[key] = result
            except requests.RequestException as e:
                print(f"WeatherAPI.com fetch failed for ({lat}, {lon}): {type(e).__name__}: {e}")
                results[key] = _fallback_weather(key)

    for lat, lon in coords:
        key = _cache_key(lat, lon)
        if key not in results:
            results[key] = _fallback_weather(key)

    return results