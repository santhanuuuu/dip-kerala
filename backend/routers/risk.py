from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, Integer
import requests

from db.session import get_db
from db.models import Place, RiskQuery
from routers.auth import get_current_user_optional
from services import weather, inference

router = APIRouter(prefix="/api/risk", tags=["risk"])

_ENDPOINT_CACHE_TTL = timedelta(minutes=10)
_alerts_scan_cache: dict[tuple, tuple[datetime, dict]] = {}
_district_ranking_cache: dict[tuple, tuple[datetime, dict]] = {}


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
    except requests.RequestException as e:
        raise HTTPException(status_code=503, detail=f"Weather service temporarily unavailable: {e}")

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
    """Scans places for high flood risk. Intended to be called by a scheduled job (see
    main.py), not on every page load -- exposed here so it can also be triggered manually
    or tested directly."""
    cache_key = (threshold, limit)
    cached = _get_endpoint_cache(_alerts_scan_cache, cache_key)
    if cached is not None:
        return cached

    places = db.query(Place).filter(Place.elevation.isnot(None)).limit(limit).all()
    alerts = []
    for place in places:
        try:
            live_weather = weather.fetch_live_weather(place.centroid_lat, place.centroid_lon)
        except requests.RequestException:
            continue
        flood_result = inference.predict_flood(
            elevation=place.elevation, slope=place.slope,
            rainfall_7day_mm=live_weather["rainfall_7day_mm"],
            dist_to_water_m=place.dist_to_water_m,
            vegetation=place.vegetation, builtup=place.builtup,
            flow_accumulation=place.flow_accumulation,
        )
        if flood_result["probability"] > threshold:
            alerts.append({"place": place.name, "district": place.district, **flood_result})
    result = {"scanned": len(places), "alerts": alerts}
    _set_endpoint_cache(_alerts_scan_cache, cache_key, result)
    return result


@router.get("/districts/ranking")
def district_risk_ranking(limit_per_district: int = 5, db: Session = Depends(get_db)):
    """REAL computed ranking, not sample/mock numbers -- scans a handful of places per
    district live, averages flood probability and landslide risk. Full responses are cached
    for 10 minutes; every number is genuinely computed from the trained models."""
    cache_key = (limit_per_district,)
    cached = _get_endpoint_cache(_district_ranking_cache, cache_key)
    if cached is not None:
        return cached

    from sqlalchemy import func as sqlfunc
    districts = [row[0] for row in db.query(Place.district).distinct().all()]
    landslide_score_map = {"Low": 25, "Moderate": 50, "High": 75, "Critical": 100}

    rankings = []
    for district in districts:
        places = (
            db.query(Place)
            .filter(Place.district == district, Place.elevation.isnot(None))
            .limit(limit_per_district)
            .all()
        )
        if not places:
            continue
        flood_scores, landslide_scores = [], []
        for place in places:
            try:
                live_weather = weather.fetch_live_weather(place.centroid_lat, place.centroid_lon)
            except requests.RequestException:
                continue
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
    """Real aggregation from the risk_queries table -- NOT fabricated sample data. Will be
    sparse or empty on a freshly-seeded database; that's the honest state of a system with
    no usage history yet, not a bug to hide with invented numbers."""
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
