"""
news.py -- fetches disaster news from NewsAPI, refreshed hourly by a scheduled job (see
main.py's startup scheduler). Results are cached in the `news_cache` table so the frontend
never waits on a live NewsAPI call -- it just reads the cache.

WHERE TO ADD YOUR API KEY: set NEWSAPI_KEY in your .env file (see .env.example).
Get a free key at https://newsapi.org/register -- free tier allows 100 requests/day,
which is more than enough for an hourly refresh (24 requests/day).

SCOPE: Kerala-only, genuine flood/landslide/natural-disaster news -- nothing worldwide,
nothing tangential. Two earlier bugs let unrelated articles through: (1) the query was
worldwide with Kerala-tagged articles merely sorted first, so non-Kerala disaster stories
filled empty slots, and (2) a couple of relevance keywords were ambiguous English words
("drought", "hurricane") that also match sports headlines ("title drought", the Carolina
Hurricanes hockey team) with zero connection to actual weather events. Fixed by requiring
BOTH a genuine disaster keyword AND a Kerala-location keyword in the same article before
it's allowed into the cache -- a hockey or tennis story is never going to mention Kerala,
so this closes both holes at once.
"""
import os
import requests
from datetime import datetime, timezone

NEWSAPI_KEY = os.environ.get("NEWSAPI_KEY", "")
NEWSAPI_URL = "https://newsapi.org/v2/everything"

# Genuine disaster-event terms only -- deliberately excludes vague words like "crisis",
# "emergency", "management", or "disaster" alone, since those match all kinds of unrelated
# news (political crises, financial news, corporate "crisis management" pieces, etc.).
DISASTER_QUERY = (
    '"flood" OR "flooding" OR "landslide" OR "landslides" OR "cyclone" OR "heavy rainfall" '
    'OR "torrential rain" OR "monsoon flooding" OR "mudslide" OR "flash flood" OR '
    '"landslip" OR "drought" OR "earthquake" OR "tsunami"'
)

# Query sent to NewsAPI: Kerala AND a disaster term, so NewsAPI itself is already narrowed
# to Kerala-relevant results rather than relying solely on the post-fetch filter below.
NEWS_QUERY = f'"Kerala" AND ({DISASTER_QUERY})'

# The same disaster terms, used again as a strict post-fetch filter -- NewsAPI's own query
# matching is loose enough that articles missing these can still slip through.
RELEVANCE_KEYWORDS = (
    "flood", "flooding", "landslide", "landslides", "cyclone", "heavy rainfall",
    "torrential rain", "monsoon flood", "mudslide", "flash flood", "landslip",
    "drought", "earthquake", "tsunami", "storm surge",
)

KERALA_KEYWORDS = ("kerala", "ksdma", "malayalam", "thiruvananthapuram", "kochi", "kozhikode",
                    "ernakulam", "kottayam", "alappuzha", "thrissur", "idukki", "wayanad")


def _is_relevant(title: str | None, description: str | None) -> bool:
    # Requires the keyword in the TITLE specifically, not just the description -- a much
    # stricter bar. Matching on description alone let through articles that only mentioned
    # a disaster in passing (e.g. a crime or politics story that references "the recent
    # floods" once in its summary). Dropped "evacuat"/"disaster relief" from the keyword
    # list entirely -- both matched too many unrelated contexts (building evacuations,
    # unrelated charity/political news).
    text = (title or "").lower()
    return any(kw in text for kw in RELEVANCE_KEYWORDS)


def _is_kerala_related(title: str | None, description: str | None) -> bool:
    text = f"{title or ''} {description or ''}".lower()
    return any(kw in text for kw in KERALA_KEYWORDS)


def fetch_disaster_news(page_size=60) -> list[dict]:
    """Returns a list of Kerala flood/landslide/natural-disaster news article dicts.
    An article is only included if it's BOTH a genuine disaster story AND Kerala-related --
    that combination is what eliminates worldwide disaster news and ambiguous-keyword false
    positives (sports "drought"/"Hurricanes" headlines) in one pass. Raises
    requests.RequestException on failure -- the scheduled job should catch this and just
    keep the existing cache rather than crash."""
    if not NEWSAPI_KEY:
        raise RuntimeError(
            "NEWSAPI_KEY is not set. Add it to your .env file -- see .env.example. "
            "Get a free key at https://newsapi.org/register"
        )

    params = {
        "q": NEWS_QUERY,
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
        title, description = item.get("title"), item.get("description")
        if not _is_relevant(title, description):
            continue  # not a genuine disaster story
        if not _is_kerala_related(title, description):
            continue  # not Kerala-related -- this is a Kerala-only feed now
        seen_urls.add(url)
        articles.append({
            "title": title,
            "description": description,
            "url": url,
            "image_url": item.get("urlToImage"),
            "source_name": item.get("source", {}).get("name"),
            "published_at": item.get("publishedAt"),
            "is_kerala": True,
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
    print(f"News cache refreshed: {len(articles)} Kerala flood/landslide/disaster articles "
          f"at {datetime.now(timezone.utc).isoformat()}")