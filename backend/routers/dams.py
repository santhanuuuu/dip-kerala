"""
routers/dams.py -- merges static dam reference data (db/seed_dams.py) with REAL live water
levels, fetched from a community-maintained feed that scrapes KSEB's own Dam Safety
Organisation site (https://dams.kseb.in) and the Kerala Irrigation Department's published
PDFs, daily, via GitHub Actions:
    https://github.com/amith-vp/Kerala-Dam-Water-Levels

HONEST COVERAGE: this feed has genuine live data for roughly 18 major KSEB hydro dams (plus
a separate Irrigation Department feed for others). Most of Kerala's smaller dams and
diversion weirs have NO public live telemetry anywhere -- confirmed by checking KSEB's own
site directly. Every dam without a live_feed_key match returns has_live_data=False and
current_level_m=None -- NEVER a fabricated or estimated water level.
"""
from datetime import datetime, timezone, timedelta

import requests
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.session import get_db
from db.models import Dam

router = APIRouter(prefix="/api/dams", tags=["dams"])

KSEB_LIVE_URL = "https://raw.githubusercontent.com/amith-vp/Kerala-Dam-Water-Levels/main/live.json"
IRRIGATION_LIVE_URL = "https://raw.githubusercontent.com/amith-vp/Kerala-Dam-Water-Levels/main/irrigation_live.json"
FETCH_TIMEOUT = 10

_CACHE_TTL = timedelta(minutes=30)  # this feed itself only updates once a day -- no need to
                                    # refetch more often than this, and it keeps every page
                                    # load fast rather than waiting on two GitHub fetches.
_cache: dict | None = None
_cache_ts: datetime | None = None


def _fetch_live_levels() -> dict[str, dict]:
    """Returns {dam_name_from_feed: {level, storage_pct, updated}}. Never raises -- a failed
    fetch just means every dam falls back to has_live_data=False for this request, same as a
    dam with no live source at all. Merges both KSEB and Irrigation feeds into one lookup."""
    global _cache, _cache_ts
    now = datetime.now(timezone.utc)
    if _cache is not None and _cache_ts is not None and now - _cache_ts < _CACHE_TTL:
        return _cache

    levels: dict[str, dict] = {}
    for url in (KSEB_LIVE_URL, IRRIGATION_LIVE_URL):
        try:
            resp = requests.get(url, timeout=FETCH_TIMEOUT)
            resp.raise_for_status()
            payload = resp.json()
            for dam in payload.get("dams", []):
                data_points = dam.get("data") or []
                if not data_points:
                    continue
                latest = data_points[-1]
                key = (dam.get("name") or "").strip().lower()
                if not key:
                    continue
                levels[key] = {
                    "level": latest.get("waterLevel"),
                    "storage_pct": latest.get("storagePercentage"),
                    "updated": payload.get("lastUpdate"),
                }
        except (requests.RequestException, ValueError) as e:
            print(f"Dam live-feed fetch failed for {url}: {type(e).__name__}: {e}")
            # Continue to the other feed rather than aborting entirely on one failure.

    _cache, _cache_ts = levels, now
    return levels


@router.get("")
def list_dams(db: Session = Depends(get_db)):
    dams = db.query(Dam).order_by(Dam.district, Dam.name).all()
    live_levels = _fetch_live_levels()

    results = []
    for d in dams:
        live = live_levels.get((d.live_feed_key or "").strip().lower()) if d.live_feed_key else None
        level_raw = live.get("level") if live else None
        pct_raw = live.get("storage_pct") if live else None
        results.append({
            "name": d.name,
            "district": d.district,
            "river": d.river,
            "owner": d.owner,
            "latitude": d.latitude,
            "longitude": d.longitude,
            "reservoir_name": d.reservoir_name,
            "dam_type": d.dam_type,
            "capacity_mcm": d.capacity_mcm,
            "frl_m": d.frl_m,
            "has_live_data": live is not None,
            "current_level_m": float(level_raw) if level_raw not in (None, "") else None,
            "storage_percentage": float(pct_raw) if pct_raw not in (None, "") else None,
            "last_updated": live.get("updated") if live else None,
        })

    live_count = sum(1 for r in results if r["has_live_data"])
    return {
        "results": results,
        "note": (
            f"{live_count} of {len(results)} dams have genuine live water-level data, "
            "sourced daily from KSEB's Dam Safety Organisation and the Kerala Irrigation "
            "Department (via a community-maintained feed). The rest show reference details "
            "only -- no public live telemetry exists for them, so no water level is shown "
            "rather than an invented one."
        ),
    }