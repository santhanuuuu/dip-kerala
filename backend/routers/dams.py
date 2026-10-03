"""
routers/dams.py -- merges static dam reference data (db/seed_dams.py) with REAL live water
levels, fetched from a community-maintained feed that scrapes KSEB's own Dam Safety
Organisation site (https://dams.kseb.in) and the Kerala Irrigation Department's published
PDFs, daily, via GitHub Actions:
    https://github.com/amith-vp/Kerala-Dam-Water-Levels

HONEST COVERAGE: this feed has genuine live data for roughly 18 major KSEB hydro dams (plus
a separate Irrigation Department feed for others). Most of Kerala's smaller dams and
diversion weirs have NO public live telemetry anywhere -- confirmed by checking KSEB's own
site directly.

LAST-KNOWN FALLBACK: every dam that has EVER had a genuine live reading gets that reading
persisted to db/models.py's Dam.last_known_* columns the moment it's seen. If today's feed
fetch has nothing for a dam (feed hiccup, temporary outage, etc.), the response falls back to
that persisted reading instead of going blank -- clearly marked `is_live_today=False` with its
own real `last_updated` timestamp, never silently dressed up as live. A dam that has NEVER had
a live reading (most of Kerala's smaller dams) keeps current_level_m/storage_percentage/
last_updated all null -- that's the honest "no live data" case, never a fabricated number.

RISK CATEGORY: `risk_category` is "high" (storage >=75% of FRL -- WATCH/DANGER band),
"normal" (storage <75%), or "no_live_data" (no reading, live or last-known, has ever existed
for this dam) -- used by the frontend's three filter tabs.
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

# Same thresholds DamsPage.tsx has always used for its color-coding (>=90% DANGER/red,
# >=75% WATCH/amber, else SAFE/green) -- kept here too so the "High Risk" filter tab groups
# DANGER+WATCH consistently with what the tile's own color already tells you.
HIGH_RISK_THRESHOLD_PCT = 75.0


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


def _risk_category(storage_pct: float | None) -> str:
    if storage_pct is None:
        return "no_live_data"
    return "high" if storage_pct >= HIGH_RISK_THRESHOLD_PCT else "normal"


@router.get("")
def list_dams(db: Session = Depends(get_db)):
    dams = db.query(Dam).order_by(Dam.district, Dam.name).all()
    live_levels = _fetch_live_levels()

    results = []
    dirty = False
    for d in dams:
        live = live_levels.get((d.live_feed_key or "").strip().lower()) if d.live_feed_key else None
        level_raw = live.get("level") if live else None
        pct_raw = live.get("storage_pct") if live else None
        is_live_today = live is not None and pct_raw not in (None, "")

        if is_live_today:
            # Fresh genuine reading -- persist it so a future request still has something
            # honest to fall back to on a day the feed misses this dam.
            new_level = float(level_raw) if level_raw not in (None, "") else None
            new_pct = float(pct_raw)
            new_updated = live.get("updated")
            if (d.last_known_level_m, d.last_known_storage_percentage, d.last_known_updated_at) != (new_level, new_pct, new_updated):
                d.last_known_level_m = new_level
                d.last_known_storage_percentage = new_pct
                d.last_known_updated_at = new_updated
                dirty = True
            current_level_m = new_level
            storage_percentage = new_pct
            last_updated = new_updated
        else:
            # Nothing fresh today -- fall back to whatever was last persisted (None for a dam
            # that has never once had a live reading, which is the honest "no live data" state).
            current_level_m = d.last_known_level_m
            storage_percentage = d.last_known_storage_percentage
            last_updated = d.last_known_updated_at

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
            "has_live_data": is_live_today,
            "is_live_today": is_live_today,
            "current_level_m": current_level_m,
            "storage_percentage": storage_percentage,
            "last_updated": last_updated,
            "risk_category": _risk_category(storage_percentage),
        })

    if dirty:
        db.commit()

    live_count = sum(1 for r in results if r["is_live_today"])
    high_count = sum(1 for r in results if r["risk_category"] == "high")
    no_data_count = sum(1 for r in results if r["risk_category"] == "no_live_data")
    return {
        "results": results,
        "counts": {
            "high": high_count,
            "normal": len(results) - high_count - no_data_count,
            "no_live_data": no_data_count,
        },
        "note": (
            f"{live_count} of {len(results)} dams have live water-level data right now, "
            "sourced from KSEB's Dam Safety Organisation and the Kerala Irrigation "
            "Department (via a community-maintained feed). Dams with no fresh reading today "
            "show their last confirmed reading, clearly marked, if one has ever existed -- "
            "otherwise no water level is shown rather than an invented one."
        ),
    }