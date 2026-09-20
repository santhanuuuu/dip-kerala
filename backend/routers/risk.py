from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, Integer
import requests

from db.session import get_db
from db.models import Place, RiskQuery, NewsCache
from routers.auth import get_current_user_optional
from services import weather, inference

router = APIRouter(prefix="/api/risk", tags=["risk"])

_ENDPOINT_CACHE_TTL = timedelta(minutes=10)
_alerts_scan_cache: dict[tuple, tuple[datetime, dict]] = {}
_district_ranking_cache: dict[tuple, tuple[datetime, dict]] = {}

KERALA_DISTRICTS = [
    "Thiruvananthapuram", "Kollam", "Pathanamthitta", "Alappuzha", "Kottayam",
    "Idukki", "Ernakulam", "Thrissur", "Palakkad", "Malappuram",
    "Kozhikode", "Wayanad", "Kannur", "Kasaragod",
]


def _get_endpoint_cache(cache: dict, key: tuple) -> dict | None:
    entry = cache.get(key)
    if entry is None:
        return None
    ts, data = entry
    if datetime.now(timezone.utc) - ts >= _ENDPOINT_CACHE_TTL:
        return None
    return data


def _set_endpoint_cache(cache: dict, key: tuple, data: dict) -> None:
    cache[key] = (datetime.now(timezone.utc), data)


def _fetch_weather_for_places(places: list) -> dict:
    """Fetches live weather for a list of place-like objects with ONE batched Open-Meteo
    request instead of one request per place (avoids the 429 rate-limiting that was
    silently degrading every result to a generic seasonal-average rainfall number)."""
    def _get_lat_lon(p):
        if isinstance(p, dict):
            return p["lat"], p["lon"]
        return p.centroid_lat, p.centroid_lon

    coords = [_get_lat_lon(p) for p in places]
    batch_results = weather.fetch_live_weather_batch(coords)
    return {
        i: batch_results[weather._cache_key(lat, lon)]
        for i, (lat, lon) in enumerate(coords)
    }


def _districts_with_recent_disaster_news(db: Session, hours: int = 72) -> set[str]:
    """Real corroboration check: looks at the already-fetched Kerala flood/landslide news
    cache (see services/news.py -- every cached article is already confirmed Kerala-related
    AND genuinely disaster-related, that filtering happens at fetch time) and returns the set
    of districts actually named in a recent article's title or description.

    This is what lets risk stay elevated even when a place's own rainfall reading looks
    moderate but there's real reported evidence of an active event nearby (e.g. upstream dam
    release, delayed sensor data, or hyper-local rain Open-Meteo's grid doesn't fully capture)
    -- and conversely, it's not what suppresses risk. The rainfall-based calibration in
    inference.py handles the "it's not raining, so don't show high risk" direction on its own;
    this only pulls risk back UP when there's actual corroborating news, never down further."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    articles = (
        db.query(NewsCache)
        .filter(NewsCache.published_at.isnot(None), NewsCache.published_at >= cutoff)
        .all()
    )
    found = set()
    for article in articles:
        text = f"{article.title or ''} {article.description or ''}"
        for district in KERALA_DISTRICTS:
            if district.lower() in text.lower():
                found.add(district)
    return found


def _apply_news_corroboration(result: dict, district: str | None, news_districts: set[str], is_flood: bool) -> dict:
    """If this place's district has recent disaster news AND rainfall-based calibration was
    applied (i.e. the raw model said something more severe than what got shown), restores the
    raw/uncalibrated model output -- there's real reported evidence, so the model's original
    read on terrain + rainfall shouldn't be second-guessed by the dry-conditions dampener."""
    if not result.get("rainfall_calibration_applied"):
        return result
    if not district or district not in news_districts:
        return result

    result = dict(result)
    if is_flood:
        result["probability"] = result.pop("raw_model_probability")
        result["risk_level"] = (
            "HIGH" if result["probability"] > inference.FLOOD_RISK_HIGH
            else "MODERATE" if result["probability"] > inference.FLOOD_RISK_MODERATE else "LOW"
        )
    else:
        result["risk_level"] = result.pop("raw_model_risk_level")
    result["rainfall_calibration_applied"] = False
    result["news_corroboration_applied"] = True
    result["calibration_note"] = (
        f"Rainfall alone looked low, but recent news coverage mentions {district} district in "
        "connection with flooding/landslides -- restored to the model's original assessment "
        "rather than trusting the dry-conditions dampener over real reported evidence."
    )
    return result


@router.get("/{place_name}")
def get_area_risk(place_name: str, db: Session = Depends(get_db), user=Depends(get_current_user_optional)):
    """The core endpoint. Directly mirrors Notebook 04's get_area_risk() function:
    static terrain features come from the database (GEE-derived, precomputed);
    rainfall is fetched live from Open-Meteo right now."""

    place = db.query(Place).filter(func.lower(Place.name) == place_name.lower()).first()
    if not place:
        place = db.query(Place).filter(Place.name.ilike(f"%{place_name}%")).first()
    if not place:
        raise HTTPException(
            status_code=404,
            detail=f"'{place_name}' not found among Kerala's registered places. "
                   f"Use POST /api/places/submit to add it (requires login).",
        )
    if place.elevation is None:
        raise HTTPException(status_code=422, detail=f"'{place.name}' has no terrain data yet (likely a pending user submission).")

    try:
        live_weather = weather.fetch_live_weather(place.centroid_lat, place.centroid_lon)
    except requests.RequestException:
        raise HTTPException(
            status_code=503,
            detail="The live weather service is temporarily busy. Please try again in a minute.",
        )

    flood_result = inference.predict_flood(
        elevation=place.elevation, slope=place.slope,
        rainfall_7day_mm=live_weather["rainfall_7day_mm"],
        dist_to_water_m=place.dist_to_water_m,
        vegetation=place.vegetation, builtup=place.builtup,
        flow_accumulation=place.flow_accumulation,
    )
    landslide_result = inference.predict_landslide(
        elevation=place.elevation, slope=place.slope,
        rainfall_7day_mm=live_weather["rainfall_7day_mm"],
        vegetation=place.vegetation, dist_to_water_m=place.dist_to_water_m,
        soil_texture_class=place.soil_texture_class,
    )

    news_districts = _districts_with_recent_disaster_news(db)
    flood_result = _apply_news_corroboration(flood_result, place.district, news_districts, is_flood=True)
    landslide_result = _apply_news_corroboration(landslide_result, place.district, news_districts, is_flood=False)

    accuracy = inference.get_accuracy_summary()

    db.add(RiskQuery(
        place_id=place.id,
        queried_by=user.id if user else None,
        flood_probability=flood_result["probability"],
        flood_risk_level=flood_result["risk_level"],
        landslide_risk_level=landslide_result["risk_level"],
        landslide_confidence=landslide_result["confidence"],
        rainfall_7day_mm=live_weather["rainfall_7day_mm"],
    ))
    db.commit()

    return {
        "place": {"name": place.name, "type": place.place_type, "district": place.district,
                   "lat": place.centroid_lat, "lon": place.centroid_lon},
        "weather": {
            "temperature_c": live_weather["current_temperature_c"],
            "humidity_pct": live_weather["current_humidity_pct"],
            "wind_kmh": live_weather["current_wind_kmh"],
            "rainfall_7day_mm": live_weather["rainfall_7day_mm"],
            "daily_breakdown": live_weather["daily_breakdown"],
            "is_stale": live_weather.get("is_stale", False),
            "is_climatological_estimate": live_weather.get("is_climatological_estimate", False),
        },
        "flood": {
            **flood_result,
            "model_honest_accuracy": accuracy["flood"]["honest_grouped_accuracy_mean"] if accuracy["flood"] else None,
        },
        "landslide": {
            **landslide_result,
            "model_honest_accuracy": accuracy["landslide"]["honest_grouped_accuracy_mean"] if accuracy["landslide"] else None,
        },
        "note": (
            "Flood/landslide models are calibrated at district level (14 districts), not "
            "true per-place ground truth. Terrain and live rainfall are place-specific, but "
            "treat the base risk category as a district-level estimate, not a certainty for "
            "this exact location."
        ),
    }


@router.get("/scan/alerts")
def scan_high_risk_areas(threshold: float = 0.7, limit: int = 50, db: Session = Depends(get_db)):
    """Scans places for high flood risk. Weather for ALL places is fetched in ONE batched
    Open-Meteo request; risk that gets dampened by low rainfall is restored where there's
    real corroborating disaster news for that district."""
    cache_key = (threshold, limit)
    cached = _get_endpoint_cache(_alerts_scan_cache, cache_key)
    if cached is not None:
        return cached

    places = db.query(Place).filter(Place.elevation.isnot(None)).limit(limit).all()
    weather_by_idx = _fetch_weather_for_places(places)
    news_districts = _districts_with_recent_disaster_news(db)

    alerts = []
    for i, place in enumerate(places):
        live_weather = weather_by_idx[i]
        flood_result = inference.predict_flood(
            elevation=place.elevation, slope=place.slope,
            rainfall_7day_mm=live_weather["rainfall_7day_mm"],
            dist_to_water_m=place.dist_to_water_m,
            vegetation=place.vegetation, builtup=place.builtup,
            flow_accumulation=place.flow_accumulation,
        )
        flood_result = _apply_news_corroboration(flood_result, place.district, news_districts, is_flood=True)
        if flood_result["probability"] > threshold:
            alerts.append({
                "place": place.name, "district": place.district,
                "rainfall_7day_mm": live_weather["rainfall_7day_mm"],
                "is_climatological_estimate": live_weather.get("is_climatological_estimate", False),
                **flood_result,
            })
    result = {"scanned": len(places), "alerts": alerts}
    _set_endpoint_cache(_alerts_scan_cache, cache_key, result)
    return result


@router.get("/districts/ranking")
def district_risk_ranking(limit_per_district: int = 3, db: Session = Depends(get_db)):
    """REAL computed ranking, not sample/mock numbers -- scans a handful of places per
    district live, averages flood probability and landslide risk."""
    cache_key = (limit_per_district,)
    cached = _get_endpoint_cache(_district_ranking_cache, cache_key)
    if cached is not None:
        return cached

    districts = [row[0] for row in db.query(Place.district).distinct().all()]
    landslide_score_map = {"Low": 25, "Moderate": 50, "High": 75, "Critical": 100}
    news_districts = _districts_with_recent_disaster_news(db)

    district_places = {}
    for district in districts:
        places = (
            db.query(Place)
            .filter(Place.district == district, Place.elevation.isnot(None))
            .limit(limit_per_district)
            .all()
        )
        if places:
            district_places[district] = [
                {
                    "lat": p.centroid_lat, "lon": p.centroid_lon,
                    "elevation": p.elevation, "slope": p.slope,
                    "dist_to_water_m": p.dist_to_water_m,
                    "vegetation": p.vegetation, "builtup": p.builtup,
                    "flow_accumulation": p.flow_accumulation,
                    "soil_texture_class": p.soil_texture_class,
                }
                for p in places
            ]
    db.close()

    flat_places = [p for places in district_places.values() for p in places]
    weather_by_idx = _fetch_weather_for_places(flat_places)

    rankings = []
    idx = 0
    for district, places in district_places.items():
        flood_scores, landslide_scores = [], []
        for place in places:
            live_weather = weather_by_idx[idx]
            idx += 1
            flood_result = inference.predict_flood(
                elevation=place["elevation"], slope=place["slope"],
                rainfall_7day_mm=live_weather["rainfall_7day_mm"],
                dist_to_water_m=place["dist_to_water_m"],
                vegetation=place["vegetation"], builtup=place["builtup"],
                flow_accumulation=place["flow_accumulation"],
            )
            flood_result = _apply_news_corroboration(flood_result, district, news_districts, is_flood=True)
            landslide_result = inference.predict_landslide(
                elevation=place["elevation"], slope=place["slope"],
                rainfall_7day_mm=live_weather["rainfall_7day_mm"],
                vegetation=place["vegetation"], dist_to_water_m=place["dist_to_water_m"],
                soil_texture_class=place["soil_texture_class"],
            )
            landslide_result = _apply_news_corroboration(landslide_result, district, news_districts, is_flood=False)
            flood_scores.append(flood_result["probability"] * 100)
            landslide_scores.append(landslide_score_map.get(landslide_result["risk_level"], 50))
        if not flood_scores:
            continue
        flood_avg = sum(flood_scores) / len(flood_scores)
        landslide_avg = sum(landslide_scores) / len(landslide_scores)
        rankings.append({
            "district": district,
            "floodRisk": round(flood_avg),
            "landslideRisk": round(landslide_avg),
            "combined": round((flood_avg + landslide_avg) / 2),
            "sampledPlaces": len(flood_scores),
        })

    rankings.sort(key=lambda r: r["combined"], reverse=True)
    result = {
        "results": rankings,
        "note": (
            f"Computed live from {limit_per_district} sampled places per district, not the "
            "full 1,034 -- a fast approximation, not an exhaustive scan. Re-run for updated numbers."
        ),
    }
    _set_endpoint_cache(_district_ranking_cache, cache_key, result)
    return result


@router.get("/history/daily")
def daily_query_history(days: int = 7, db: Session = Depends(get_db)):
    from sqlalchemy import func as sqlfunc
    from datetime import datetime, timedelta

    since = datetime.utcnow() - timedelta(days=days)
    rows = (
        db.query(
            sqlfunc.date(RiskQuery.queried_at).label("date"),
            sqlfunc.count(RiskQuery.id).label("total_queries"),
            sqlfunc.sum(sqlfunc.cast(RiskQuery.flood_risk_level == "HIGH", Integer)).label("high_count"),
            sqlfunc.sum(sqlfunc.cast(RiskQuery.landslide_risk_level == "Critical", Integer)).label("critical_count"),
        )
        .filter(RiskQuery.queried_at >= since)
        .group_by(sqlfunc.date(RiskQuery.queried_at))
        .order_by(sqlfunc.date(RiskQuery.queried_at))
        .all()
    )
    total_all_time = db.query(sqlfunc.count(RiskQuery.id)).scalar() or 0
    return {
        "results": [
            {
                "date": str(r.date),
                "totalQueries": r.total_queries or 0,
                "highRiskCount": r.high_count or 0,
                "criticalCount": r.critical_count or 0,
            }
            for r in rows
        ],
        "totalAllTime": total_all_time,
        "note": "Real query history from this deployment's own usage -- empty or sparse until real traffic accumulates.",
    }