from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional

from db.session import get_db
from db.models import Place, PlaceSubmission
from routers.auth import get_current_user_optional, get_current_user_required

router = APIRouter(prefix="/api/places", tags=["places"])


@router.get("")
def list_all_places(db: Session = Depends(get_db)):
    """Returns all ~1,034 places with their static terrain features in one payload.
    Frontend fetches this once at startup and filters/searches it client-side for instant
    results, rather than round-tripping to the server on every keystroke."""
    places = db.query(Place).filter(Place.is_verified == True).all()  # noqa: E712
    return {
        "results": [
            {
                "id": p.id,
                "name": p.name,
                "nameMalayalam": p.name_malayalam,
                "district": p.district,
                "type": p.place_type,
                "lat": p.centroid_lat,
                "lon": p.centroid_lon,
                "elevation": p.elevation,
                "slope": p.slope,
                "distToWaterM": p.dist_to_water_m,
                "vegetationPct": (p.vegetation or 0) * 100 if p.vegetation is not None and p.vegetation <= 1 else p.vegetation,
                "builtupPct": (p.builtup or 0) * 100 if p.builtup is not None and p.builtup <= 1 else p.builtup,
            }
            for p in places
        ]
    }


@router.get("/search")
def search_places(q: str, db: Session = Depends(get_db)):
    """Fuzzy name search across all 1,034 official places (plus any approved submissions)."""
    if not q or len(q) < 2:
        return {"results": []}

    exact = db.query(Place).filter(func.lower(Place.name) == q.lower()).all()
    if exact:
        matches = exact
    else:
        matches = db.query(Place).filter(Place.name.ilike(f"%{q}%")).limit(10).all()

    return {
        "results": [
            {"id": p.id, "name": p.name, "place_type": p.place_type, "district": p.district}
            for p in matches
        ]
    }


@router.get("/{place_id}")
def get_place(place_id: int, db: Session = Depends(get_db)):
    place = db.query(Place).filter(Place.id == place_id).first()
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")
    return {
        "id": place.id, "name": place.name, "name_malayalam": place.name_malayalam,
        "place_type": place.place_type, "district": place.district,
        "centroid_lat": place.centroid_lat, "centroid_lon": place.centroid_lon,
    }


class PlaceSubmissionRequest(BaseModel):
    name: str
    place_type: Optional[str] = None
    district: Optional[str] = None
    approx_lat: Optional[float] = None
    approx_lon: Optional[float] = None


@router.post("/submit")
def submit_place(
    submission: PlaceSubmissionRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user_required),
):
    """Requires login. Creates a PENDING submission -- does not go live until an admin
    approves it via POST /api/admin/submissions/{id}/approve."""
    record = PlaceSubmission(
        name=submission.name,
        place_type=submission.place_type,
        district=submission.district,
        approx_lat=submission.approx_lat,
        approx_lon=submission.approx_lon,
        submitted_by=user.id,
        status="pending",
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return {"id": record.id, "status": "pending", "message": "Submitted for review."}
