from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.session import get_db
from db.models import NewsCache

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
