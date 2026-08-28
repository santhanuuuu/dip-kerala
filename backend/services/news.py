"""
news.py -- fetches Kerala-specific disaster news from NewsAPI, refreshed hourly by a
scheduled job (see main.py's startup scheduler). Results are cached in the `news_cache`
table so the frontend never waits on a live NewsAPI call -- it just reads the cache.

WHERE TO ADD YOUR API KEY: set NEWSAPI_KEY in your .env file (see .env.example).
Get a free key at https://newsapi.org/register -- free tier allows 100 requests/day,
which is more than enough for an hourly refresh (24 requests/day).
"""
import os
import requests
from datetime import datetime, timezone

NEWSAPI_KEY = os.environ.get("NEWSAPI_KEY", "")
NEWSAPI_URL = "https://newsapi.org/v2/everything"

# Kept deliberately narrow to Kerala-specific disaster terms -- a broad "flood" query would
# return global results, defeating the "Kerala only" requirement.
SEARCH_QUERY = (
    '("Kerala flood" OR "Kerala landslide" OR "Kerala rain" OR "Kerala disaster" '
    'OR "Kerala monsoon" OR "KSDMA")'
)


def fetch_kerala_disaster_news(page_size=20) -> list[dict]:
    """Returns a list of news article dicts. Raises requests.RequestException on failure --
    the scheduled job should catch this and just keep the existing cache rather than crash."""
    if not NEWSAPI_KEY:
        raise RuntimeError(
            "NEWSAPI_KEY is not set. Add it to your .env file -- see .env.example. "
            "Get a free key at https://newsapi.org/register"
        )

    params = {
        "q": SEARCH_QUERY,
        "language": "en",
        "sortBy": "publishedAt",
        "pageSize": page_size,
        "apiKey": NEWSAPI_KEY,
    }
    response = requests.get(NEWSAPI_URL, params=params, timeout=15)
    response.raise_for_status()
    data = response.json()

    articles = []
    for item in data.get("articles", []):
        articles.append({
            "title": item.get("title"),
            "description": item.get("description"),
            "url": item.get("url"),
            "image_url": item.get("urlToImage"),
            "source_name": item.get("source", {}).get("name"),
            "published_at": item.get("publishedAt"),
        })
    return articles


def refresh_news_cache(db_session):
    """Called hourly by the scheduler in main.py. Fetches fresh articles and replaces the
    cache -- simplest correct approach given NewsAPI's free tier doesn't support incremental
    'since last check' queries in a way worth the added complexity here."""
    from db.models import NewsCache  # local import to avoid circular import at module load time

    try:
        articles = fetch_kerala_disaster_news()
    except Exception as e:
        print(f"News refresh failed, keeping existing cache: {e}")
        return

    db_session.query(NewsCache).delete()
    for article in articles:
        published_at = None
        if article["published_at"]:
            try:
                published_at = datetime.fromisoformat(article["published_at"].replace("Z", "+00:00"))
            except ValueError:
                pass
        db_session.add(NewsCache(
            title=article["title"],
            description=article["description"],
            url=article["url"],
            image_url=article["image_url"],
            source_name=article["source_name"],
            published_at=published_at,
        ))
    db_session.commit()
    print(f"News cache refreshed: {len(articles)} articles at {datetime.now(timezone.utc).isoformat()}")
