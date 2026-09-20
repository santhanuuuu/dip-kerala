from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.session import get_db
from db.models import NewsCache
from services.news import refresh_news_cache

router = APIRouter(prefix="/api/news", tags=["news"])

# How stale the cache can get before a visit triggers a SYNCHRONOUS refresh (the visitor who
# triggers it sees the fresh results on that same load, not just whoever visits next). Kept
# well above zero so normal browsing doesn't burn through NewsAPI's 100-requests/day
# free-tier limit -- 20 minutes caps this at ~3 extra refreshes/hour on top of the existing
# hourly scheduled job, safely within budget even with regular traffic.
STALE_AFTER_MINUTES = 20


@router.get("")
def get_disaster_news(db: Session = Depends(get_db)):
    """Checks the cache's age on every visit. If it's stale (or has never been populated),
    refreshes it SYNCHRONOUSLY before responding -- the person whose visit triggered the
    check sees the fresh results immediately, not just the next visitor. That does mean a
    stale-cache visit takes an extra second or two (a real NewsAPI round-trip) instead of
    being instant, but only once every STALE_AFTER_MINUTES, not on every single page load.

    Every cached article is already Kerala-specific (enforced in services/news.py) -- no
    worldwide fallback."""
    latest = db.query(NewsCache).order_by(NewsCache.fetched_at.desc()).first()
    is_stale = (
        latest is None
        or datetime.now(timezone.utc) - latest.fetched_at.replace(tzinfo=timezone.utc) > timedelta(minutes=STALE_AFTER_MINUTES)
    )
    if is_stale:
        try:
            refresh_news_cache(db)
        except Exception as e:
            # Don't let a NewsAPI hiccup break the whole page load -- fall through and
            # serve whatever's already cached (possibly empty on a brand-new deployment).
            print(f"Visit-triggered news refresh failed, serving existing cache: {e}")

    articles = (
        db.query(NewsCache)
        .filter(NewsCache.is_kerala.is_(True))
        .order_by(NewsCache.published_at.desc())
        .limit(6)
        .all()
    )
    return {
        "results": [
            {
                "title": a.title, "description": a.description, "url": a.url,
                "image_url": a.image_url, "source_name": a.source_name,
                "published_at": a.published_at, "is_kerala": a.is_kerala,
            }
            for a in articles
        ],
        "last_refreshed": articles[0].fetched_at if articles else None,
        "refresh_triggered": is_stale,
    }


@router.post("/refresh")
def trigger_news_refresh(db: Session = Depends(get_db)):
    """Still useful for an external cron ping (e.g. cron-job.org) that also keeps Render's
    free-tier instance from spinning down, independent of the visit-triggered refresh above."""
    refresh_news_cache(db)
    count = db.query(NewsCache).count()
    return {"status": "ok", "articles_cached": count}