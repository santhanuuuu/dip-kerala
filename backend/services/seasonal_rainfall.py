"""
seasonal_rainfall.py -- tracks Kerala's SEASON-TO-DATE (June 1 through today) cumulative
monsoon rainfall, and converts it into a flood-conditions probability using the calibration
fitted in Notebook 06 against 118 years (1901-2018) of real IMD rainfall/flood-outcome data.

WHY THIS EXISTS: flood_model_v2/landslide_model_v2 were trained on a single week's rainfall
(the Aug 2018 flood peak) and can't tell "dry" from "the low end of a monsoon week" -- see
inference.py's module docstring. This module answers a genuinely different, better-founded
question: given how much it has actually rained THIS SEASON so far (not just the last 7 days),
how likely is Kerala to be in flood-triggering conditions at all, right now? That seasonal
factor is then used to scale down the terrain-vulnerability models' output when the season
has been dry -- see inference.py's predict_flood/predict_landslide.

SCOPE, STATED HONESTLY:
- STATE-LEVEL, not per-place. This is one number for the whole state on a given day, the same
  regardless of which place is being queried. It answers "is this an unusually wet monsoon
  season" -- the per-place terrain models still answer "which places are vulnerable."
- Approximates "statewide" rainfall with a SINGLE representative coordinate (central Kerala,
  near Kochi) rather than a true multi-station average. Kerala's rainfall does vary
  meaningfully between the coast, midlands, and highlands -- this is a documented
  simplification, not a claim of precision.
- Defined only for the JUNE-SEPTEMBER southwest monsoon window, matching what the 118-year
  calibration was actually trained on. Outside that window (including the Oct-Nov northeast
  monsoon, which can also cause flooding in parts of Kerala), this deliberately returns a low
  factor -- a real gap, not a mistake, and should be revisited if NE-monsoon flood data becomes
  available.
"""
import os
import json
import math
from datetime import date, datetime, timezone

from services.weather import _session, OPEN_METEO_URL, REQUEST_TIMEOUT
import requests

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CALIBRATION_PATH = os.path.join(BASE_DIR, "ml_models", "rainfall_flood_calibration.json")

# Central Kerala, near Kochi -- a single-point proxy for "statewide" monsoon rainfall.
# See module docstring: a true multi-station average would be more accurate but isn't
# implemented here.
REPRESENTATIVE_LAT = 9.9312
REPRESENTATIVE_LON = 76.2673

MONSOON_START_MONTH_DAY = (6, 1)   # June 1
MONSOON_END_MONTH_DAY = (9, 30)    # September 30 -- matches the JJAS window Notebook 06 trained on

_calibration = None  # loaded once, lazily
_season_cache = None  # {"date": date, "jjas_cumulative_mm": float, "factor": float}


def _load_calibration() -> dict:
    global _calibration
    if _calibration is None:
        if not os.path.exists(CALIBRATION_PATH):
            raise RuntimeError(
                f"{CALIBRATION_PATH} not found -- run Notebook 06 "
                "(06_Rainfall_Flood_Risk_Calibration.ipynb) and place its exported "
                "rainfall_flood_calibration.json in backend/ml_models/."
            )
        with open(CALIBRATION_PATH) as f:
            _calibration = json.load(f)
    return _calibration


def _in_monsoon_window(today: date) -> bool:
    start = date(today.year, *MONSOON_START_MONTH_DAY)
    end = date(today.year, *MONSOON_END_MONTH_DAY)
    return start <= today <= end


def _fetch_season_to_date_rainfall(today: date) -> float:
    """Sums daily precipitation from June 1st of the current year through today, at the
    single representative coordinate. Uses the SAME Open-Meteo forecast endpoint weather.py
    already calls (it accepts historical date ranges, not just the last 7 days) -- no new
    API or credentials needed."""
    season_start = date(today.year, *MONSOON_START_MONTH_DAY)
    params = {
        "latitude": REPRESENTATIVE_LAT,
        "longitude": REPRESENTATIVE_LON,
        "start_date": season_start.isoformat(),
        "end_date": today.isoformat(),
        "daily": "precipitation_sum",
        "timezone": "auto",
    }
    response = _session.get(OPEN_METEO_URL, params=params, timeout=REQUEST_TIMEOUT * 2)
    response.raise_for_status()
    data = response.json()
    values = [v for v in data.get("daily", {}).get("precipitation_sum", []) if v is not None]
    return sum(values)


def get_seasonal_flood_factor() -> dict:
    """Returns {"factor": 0..1, "jjas_cumulative_mm": float, "is_in_season": bool, "note": str}.

    "factor" is what predict_flood/predict_landslide multiply their raw model output by.
    Cached once per calendar day (module-level) -- this makes one extra Open-Meteo call per
    day total, not per query, regardless of how many places get searched or scanned.

    NEVER raises -- if the season-to-date fetch or the calibration file is unavailable, falls
    back to factor=1.0 (no adjustment) so a problem here degrades gracefully to "use the raw
    terrain model," matching this app's existing fail-open philosophy for weather (see
    weather.py's _fallback_weather), rather than blocking every risk query.
    """
    global _season_cache
    today = datetime.now(timezone.utc).date()

    if _season_cache is not None and _season_cache["date"] == today:
        return _season_cache["result"]

    if not _in_monsoon_window(today):
        result = {
            "factor": 0.15,  # same floor used elsewhere for "very unlikely but not impossible"
            "jjas_cumulative_mm": None,
            "is_in_season": False,
            "note": (
                "Outside the June-September monsoon window this calibration was trained on -- "
                "flood risk defaulted low. Kerala's Oct-Nov northeast monsoon can still cause "
                "localized flooding that this factor doesn't account for."
            ),
        }
        _season_cache = {"date": today, "result": result}
        return result

    try:
        calibration = _load_calibration()
        jjas_mm = _fetch_season_to_date_rainfall(today)
        logit = calibration["coefficient"] * jjas_mm + calibration["intercept"]
        factor = 1.0 / (1.0 + math.exp(-logit))
        result = {
            "factor": factor,
            "jjas_cumulative_mm": jjas_mm,
            "is_in_season": True,
            "note": (
                f"Season-to-date (Jun 1-{today.isoformat()}) rainfall at a central-Kerala "
                f"reference point: {jjas_mm:.1f}mm. Calibrated against 118 years (1901-2018) "
                "of real statewide rainfall/flood outcomes (Notebook 06)."
            ),
        }
    except (requests.RequestException, RuntimeError, KeyError) as e:
        print(f"Seasonal rainfall factor unavailable, defaulting to no adjustment: {type(e).__name__}: {e}")
        result = {"factor": 1.0, "jjas_cumulative_mm": None, "is_in_season": True,
                   "note": "Seasonal calibration temporarily unavailable -- using uncalibrated model output."}

    _season_cache = {"date": today, "result": result}
    return result