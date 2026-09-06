"""
news.py -- fetches disaster news from NewsAPI, refreshed hourly by a scheduled job (see
main.py's startup scheduler). Results are cached in the `news_cache` table so the frontend
never waits on a live NewsAPI call -- it just reads the cache.

WHERE TO ADD YOUR API KEY: set NEWSAPI_KEY in your .env file (see .env.example).
Get a free key at https://newsapi.org/register -- free tier allows 100 requests/day,
which is more than enough for an hourly refresh (24 requests/day).

SCOPE: a Kerala-only search query returned too few results to feel like a real news feed
(NewsAPI's free tier searches a limited set of sources, and Kerala-specific disaster
coverage in English-language sources is sparse on any given day). This instead pulls
broader India-wide disaster news, and separately tags/prioritizes anything that also
mentions Kerala, so Kerala news surfaces first without starving the feed the rest of
the time.
"""
import os
import requests
from datetime import datetime, timezone

NEWSAPI_KEY = os.environ.get("NEWSAPI_KEY", "")
NEWSAPI_URL = "https://newsapi.org/v2/everything"

INDIA_DISASTER_QUERY = (
    '(flood OR landslide OR cyclone OR "heavy rain" OR monsoon OR earthquake OR '
    '"disaster management") AND India'
)
KERALA_KEYWORDS = ("kerala", "ksdma", "malayalam", "thiruvananthapuram", "kochi", "kozhikode")


def _is_kerala_related(title: str | None, description: str | None) -> bool:
    text = f"{title or ''} {description or ''}".lower()
    return any(kw in text for kw in KERALA_KEYWORDS)


def fetch_disaster_news(page_size=40) -> list[dict]:
    """Returns a list of news article dicts, each tagged with is_kerala. Raises
    requests.RequestException on failure -- the scheduled job should catch this and just
    keep the existing cache rather than crash."""
    if not NEWSAPI_KEY:
        raise RuntimeError(
            "NEWSAPI_KEY is not set. Add it to your .env file -- see .env.example. "
            "Get a free key at https://newsapi.org/register"
        )

    params = {
        "q": INDIA_DISASTER_QUERY,
        "language": "en",
        "sortBy": "publishedAt",
        "pageSize": page_size,
        "apiKey": NEWSAPI_KEY,
    }
    response = requests.get(NEWSAPI_URL, params=params, timeout=15)
    response.raise_for_status()
    data = response.json()

    articles = []
    seen_urls = set()
    for item in data.get("articles", []):
        url = item.get("url")
        if not url or url in seen_urls:
            continue
        seen_urls.add(url)
        title, description = item.get("title"), item.get("description")
        articles.append({
            "title": title,
            "description": description,
            "url": url,
            "image_url": item.get("urlToImage"),
            "source_name": item.get("source", {}).get("name"),
            "published_at": item.get("publishedAt"),
            "is_kerala": _is_kerala_related(title, description),
        })
    return articles


def refresh_news_cache(db_session):
    """Called hourly by the scheduler in main.py. Fetches fresh articles and replaces the
    cache -- simplest correct approach given NewsAPI's free tier doesn't support incremental
    'since last check' queries in a way worth the added complexity here."""
    from db.models import NewsCache  # local import to avoid circular import at module load time

    try:
        articles = fetch_disaster_news()
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
            is_kerala=article["is_kerala"],
        ))
    db_session.commit()
    kerala_count = sum(1 for a in articles if a["is_kerala"])
    print(f"News cache refreshed: {len(articles)} articles ({kerala_count} Kerala-related) at {datetime.now(timezone.utc).isoformat()}")
