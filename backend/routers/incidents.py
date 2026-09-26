"""
routers/incidents.py -- crowdsourced "seeing this right now" reports. Deliberately simple:
no photo upload (needs real object storage, not implemented), no admin moderation UI yet
(the `status` column exists for that later). Anyone can submit -- logged in or not -- since
requiring login would slow down exactly the moment this is most useful.
"""
import math
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func as sqlfunc
from datetime import datetime, timedelta, timezone
from pydantic import BaseModel, Field

from db.session import get_db
from db.models import IncidentReport, Place
from routers.auth import get_current_user_optional

router = APIRouter(prefix="/api/incidents", tags=["incidents"])

VALID_TYPES = {"flood", "landslide", "road_blocked", "other"}
MAX_DESCRIPTION_LEN = 500


class IncidentIn(BaseModel):
    incident_type: str
    description: str | None = Field(default=None, max_length=MAX_DESCRIPTION_LEN)
    lat: float
    lon: float


def _nearest_place_and_district(db: Session, lat: float, lon: float):
    """Best-effort nearest-place lookup using simple Euclidean distance on lat/lon --
    Kerala's small size (~1.5 degrees of latitude) makes this an adequate approximation
    without needing PostGIS distance functions here. Returns (place_id, district) or
    (None, None) if no places exist yet."""
    places = db.query(Place.id, Place.district, Place.centroid_lat, Place.centroid_lon).filter(
        Place.centroid_lat.isnot(None), Place.centroid_lon.isnot(None)
    ).all()
    if not places:
        return None, None
    best = min(places, key=lambda p: (p.centroid_lat - lat) ** 2 + (p.centroid_lon - lon) ** 2)
    return best.id, best.district


@router.post("")
def submit_incident(payload: IncidentIn, db: Session = Depends(get_db), user=Depends(get_current_user_optional)):
    if payload.incident_type not in VALID_TYPES:
        raise HTTPException(status_code=422, detail=f"incident_type must be one of {sorted(VALID_TYPES)}")
    if not (7.5 <= payload.lat <= 12.9 and 74.5 <= payload.lon <= 77.5):
        # Loose bounding box around Kerala -- catches obviously wrong coordinates (e.g. a
        # browser geolocation failure returning 0,0) without being strict about exact borders.
        raise HTTPException(status_code=422, detail="Coordinates look like they're outside Kerala.")

    place_id, district = _nearest_place_and_district(db, payload.lat, payload.lon)

    report = IncidentReport(
        incident_type=payload.incident_type,
        description=payload.description,
        lat=payload.lat,
        lon=payload.lon,
        place_id=place_id,
        district=district,
        reported_by=user.id if user else None,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return {"id": report.id, "status": report.status, "district": district}


@router.get("")
def list_recent_incidents(hours: int = 48, district: str | None = None, db: Session = Depends(get_db)):
    """Public feed of recent community reports. NEVER exposes reporter identity (email/name)
    here -- unlike the admin submission review, this is a public endpoint, and reporter
    privacy matters more here than admin accountability does there."""
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    query = db.query(IncidentReport).filter(
        IncidentReport.created_at >= since, IncidentReport.status != "dismissed"
    )
    if district:
        query = query.filter(IncidentReport.district == district)
    reports = query.order_by(IncidentReport.created_at.desc()).limit(100).all()

    return {
        "results": [
            {
                "id": r.id, "incident_type": r.incident_type, "description": r.description,
                "lat": r.lat, "lon": r.lon, "district": r.district, "status": r.status,
                "created_at": r.created_at,
                "reported_by_registered_user": r.reported_by is not None,  # yes/no only, never who
            }
            for r in reports
        ],
        "note": (
            "Community-reported and UNVERIFIED -- these are not model predictions or "
            "confirmed events. Cross-check against official alerts and news before acting."
        ),
    }