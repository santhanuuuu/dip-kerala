from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.session import get_db
from db.models import NewsCache
from services.news import refresh_news_cache

router = APIRouter(prefix="/api/news", tags=["news"])


@router.get("")
def get_kerala_disaster_news(db: Session = Depends(get_db)):
    """Always reads from the cache (refreshed hourly by the scheduler in main.py) -- never
    calls NewsAPI directly on a page load, so this endpoint is always fast."""
    articles = db.query(NewsCache).order_by(NewsCache.published_at.desc()).limit(20).all()
    return {
        "results": [
            {
                "title": a.title, "description": a.description, "url": a.url,
                "image_url": a.image_url, "source_name": a.source_name,
                "published_at": a.published_at,
            }
            for a in articles
        ],
        "last_refreshed": articles[0].fetched_at if articles else None,
    }


@router.post("/refresh")
def trigger_news_refresh(db: Session = Depends(get_db)):
    """Manually triggers a news cache refresh -- meant to be hit by an external cron
    service (e.g. cron-job.org or a GitHub Actions scheduled workflow) every hour.

    This exists because Render's free tier spins the backend down after ~15 minutes of
    no incoming traffic, which also pauses the in-process APScheduler job in main.py.
    An external hourly ping to this endpoint guarantees the refresh happens on schedule
    AND keeps the backend awake, rather than relying on someone happening to visit the
    site right as the internal hourly timer would have fired.

    No auth required -- this only refreshes a public news cache, there's nothing to
    protect, and requiring auth would complicate the cron setup for no real benefit.
    """
    refresh_news_cache(db)
    count = db.query(NewsCache).count()
    return {"status": "ok", "articles_cached": count}