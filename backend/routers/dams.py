"""
routers/dams.py -- merges static dam reference data (db/seed_dams.py) with REAL live water
levels, fetched from a community-maintained feed that scrapes KSEB's own Dam Safety
Organisation site (https://dams.kseb.in) and the Kerala Irrigation Department's published
PDFs, daily, via GitHub Actions:
    https://github.com/amith-vp/Kerala-Dam-Water-Levels

HONEST COVERAGE: as of the last mapping pass, 38 of Kerala's ~70 known dams have a genuine
live water-level feed (18 from KSEB's own hydro dams, 20 more from the Irrigation
Department's feed) -- see db/dams_reference.csv's `live_feed_key` column. The rest have NO
public live telemetry anywhere confirmed by checking KSEB's own site directly.

LAST-KNOWN FALLBACK: every dam that has EVER had a genuine live reading gets that reading
persisted to db/models.py's Dam.last_known_* columns the moment it's seen. If a feed fetch has
nothing for a dam (feed hiccup, temporary outage, etc.), the response falls back to that
persisted reading instead of going blank -- clearly marked `is_live_today=False` with its own
real `last_updated` timestamp, never silently dressed up as live. A dam that has NEVER had a
live reading keeps current_level_m/storage_percentage/last_updated all null -- that's the
honest "no live data" case, never a fabricated number.

AUTOMATIC SYNC TO THE DATABASE: `sync_dam_levels()` below is the single piece of logic that
actually fetches the feeds and writes last_known_* -- it's called from THREE places, all
converging on the one Postgres (Supabase) database everything else reads from:
  1. main.py's startup event (once, so the DB is fresh the moment the app boots)
  2. main.py's APScheduler job, every 2 hours (so data updates even with zero site visitors --
     see main.py's `scheduled_dam_sync`)
  3. this router's own GET /api/dams, as a belt-and-suspenders refresh on page load (cheap,
     since _fetch_live_levels() below is itself cached for 30 min)
There's no separate "Supabase sync" to wire up -- the backend already talks to Supabase's
Postgres directly via SQLAlchemy (see db/session.py), so "write it to Supabase automatically"
*is* "run this function on a schedule", which is exactly what main.py now does.

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


def _fetch_live_levels(force: bool = False) -> dict[str, dict]:
    """Returns {dam_name_from_feed: {level, storage_pct, updated}}. Never raises -- a failed
    fetch just means every dam falls back to has_live_data=False for this call, same as a dam
    with no live source at all. Merges both KSEB and Irrigation feeds into one lookup.

    `force=True` (used by the scheduled sync job) bypasses the 30-minute cache so a job that
    only runs every 2 hours always re-checks the real feeds rather than possibly replaying a
    stale in-memory result from right before the previous run."""
    global _cache, _cache_ts
    now = datetime.now(timezone.utc)
    if not force and _cache is not None and _cache_ts is not None and now - _cache_ts < _CACHE_TTL:
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


def _to_float(v) -> float | None:
    """The feeds occasionally publish "-" (or "") instead of a number -- seen on barrages
    like Bhoothathankettu and Moolathara, which don't have a meaningful storage percentage.
    `float("-")` raises ValueError; letting that escape here previously crashed this entire
    endpoint (GET /api/dams returned 500, which is why the frontend showed "No dams in the
    database yet" -- that empty state actually meant "the request failed", not "truly
    empty"). Treat anything that doesn't parse as genuinely missing, same as None -- never
    crash, never guess a number."""
    if v in (None, ""):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _apply_live_reading(d: Dam, live: dict | None) -> dict:
    """Given one Dam row and (maybe) its matching entry from _fetch_live_levels(), updates
    the row's last_known_* columns IN PLACE when there's a genuinely fresh reading, and
    returns the dict this dam should contribute to the API response. Caller is responsible
    for db.commit()."""
    level_raw = live.get("level") if live else None
    pct_raw = live.get("storage_pct") if live else None
    new_level = _to_float(level_raw)
    new_pct = _to_float(pct_raw)
    # A barrage/regulator (e.g. Bhoothathankettu, Moolathara) genuinely has a water level but
    # no meaningful "% of reservoir full" -- the feed reports that as "-" rather than a
    # number. Treat a parsed LEVEL as enough to count as live, same as a parsed percentage;
    # only requiring one, not both, is what used to crash this whole endpoint (float("-")
    # raised ValueError, which took down GET /api/dams entirely -- see _to_float below).
    is_live_today = live is not None and (new_level is not None or new_pct is not None)

    if is_live_today:
        new_updated = live.get("updated")
        if (d.last_known_level_m, d.last_known_storage_percentage, d.last_known_updated_at) != (new_level, new_pct, new_updated):
            d.last_known_level_m = new_level
            d.last_known_storage_percentage = new_pct
            d.last_known_updated_at = new_updated
        current_level_m, storage_percentage, last_updated = new_level, new_pct, new_updated
    else:
        # Nothing fresh right now -- fall back to whatever was last persisted (None for a dam
        # that has never once had a live reading, the honest "no live data" state).
        current_level_m = d.last_known_level_m
        storage_percentage = d.last_known_storage_percentage
        last_updated = d.last_known_updated_at

    return {
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
    }


def sync_dam_levels(db: Session, force_refetch: bool = True) -> dict:
    """The one function that actually writes fresh dam readings into Postgres (Supabase).
    Called from main.py on startup AND on a recurring schedule, so the database stays current
    even with nobody visiting the site -- not just opportunistically on page load. Also used
    by GET /api/dams itself. Returns a small summary dict for logging."""
    dams = db.query(Dam).order_by(Dam.district, Dam.name).all()
    live_levels = _fetch_live_levels(force=force_refetch)

    results = []
    for d in dams:
        live = live_levels.get((d.live_feed_key or "").strip().lower()) if d.live_feed_key else None
        results.append(_apply_live_reading(d, live))

    db.commit()

    live_count = sum(1 for r in results if r["is_live_today"])
    return {"checked": len(results), "live_today": live_count, "results": results}


@router.get("")
def list_dams(db: Session = Depends(get_db)):
    sync = sync_dam_levels(db, force_refetch=False)  # uses the 30-min cache -- a page load
                                                      # shouldn't force a fresh GitHub fetch if
                                                      # the scheduled job just did one.
    results = sync["results"]

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
            f"{sync['live_today']} of {len(results)} dams have live water-level data right "
            "now, sourced from KSEB's Dam Safety Organisation and the Kerala Irrigation "
            "Department (via a community-maintained feed, synced to this database every 2 "
            "hours). Dams with no fresh reading today show their last confirmed reading, "
            "clearly marked, if one has ever existed -- otherwise no water level is shown "
            "rather than an invented one."
        ),
    }


@router.post("/sync")
def trigger_dam_sync(db: Session = Depends(get_db)):
    """Same purpose as POST /api/news/refresh -- an external cron ping (GitHub Actions, see
    .github/workflows/sync-dams.yml) that guarantees the dam sync actually runs on schedule
    AND wakes Render's free-tier instance back up, independent of main.py's in-process
    APScheduler job. That in-process job only fires while the dyno happens to be awake
    (Render's free tier spins down after ~15 min idle, which pauses it too) -- this endpoint
    is the belt-and-suspenders fix, same pattern as news."""
    summary = sync_dam_levels(db, force_refetch=True)
    return {"status": "ok", "checked": summary["checked"], "live_today": summary["live_today"]}