"""
admin.py -- admin-only endpoints for reviewing user-submitted places. Protected by
get_current_admin_required (see routers/auth.py) -- requires the separate admin login,
not just any signed-in Google account.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func as sqlfunc

from db.session import get_db
from db.models import PlaceSubmission, Place
from routers.auth import get_current_admin_required

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/submissions")
def list_pending_submissions(status: str = "pending", db: Session = Depends(get_db), _admin=Depends(get_current_admin_required)):
    """Admin-only: list submissions pending (or in any given status) review."""
    submissions = db.query(PlaceSubmission).filter(PlaceSubmission.status == status).all()
    return {
        "results": [
            {
                "id": s.id, "name": s.name, "place_type": s.place_type, "district": s.district,
                "local_body": s.local_body,
                "approx_lat": s.approx_lat, "approx_lon": s.approx_lon,
                "submitted_by": s.submitted_by, "created_at": s.created_at,
            }
            for s in submissions
        ]
    }


def _district_average_terrain(db: Session, district: str):
    """Averages terrain features across every verified place already known in this
    district. Used to backfill newly-approved submissions immediately, since running the
    full GEE extraction (Notebook 00) for a single new point isn't practical to do
    on-demand. This is a real estimate, not site-specific data -- callers must mark the
    result with terrain_is_estimated=True and the frontend must disclose it honestly."""
    row = (
        db.query(
            sqlfunc.avg(Place.elevation), sqlfunc.avg(Place.slope),
            sqlfunc.avg(Place.dist_to_water_m), sqlfunc.avg(Place.vegetation),
            sqlfunc.avg(Place.builtup), sqlfunc.avg(Place.flow_accumulation),
            sqlfunc.avg(Place.soil_texture_class),
        )
        .filter(Place.district == district, Place.elevation.isnot(None))
        .first()
    )
    if not row or row[0] is None:
        return None  # no reference places in this district at all -- can't estimate
    return {
        "elevation": row[0], "slope": row[1], "dist_to_water_m": row[2],
        "vegetation": row[3], "builtup": row[4],
        "flow_accumulation": row[5], "soil_texture_class": row[6],
    }


@router.post("/submissions/{submission_id}/approve")
def approve_submission(submission_id: int, db: Session = Depends(get_db), _admin=Depends(get_current_admin_required)):
    """Admin-only. Promotes a pending submission into the live `places` table, and
    immediately backfills terrain features from the district average so it works right
    away in risk queries -- rather than leaving it NULL and broken until someone manually
    re-runs the offline GEE extraction pipeline for it."""
    submission = db.query(PlaceSubmission).filter(PlaceSubmission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    if submission.status != "pending":
        raise HTTPException(status_code=400, detail=f"Submission already {submission.status}")

    district = submission.district or "Unknown"
    terrain = _district_average_terrain(db, district)

    new_place = Place(
        name=submission.name,
        place_type=submission.place_type or "user_submitted",
        district=district,
        centroid_lat=submission.approx_lat,
        centroid_lon=submission.approx_lon,
        is_verified=True,
        submitted_by=submission.submitted_by,
        terrain_is_estimated=terrain is not None,
        **(terrain or {}),
    )
    db.add(new_place)
    submission.status = "approved"
    db.commit()
    db.refresh(new_place)

    return {
        "place_id": new_place.id,
        "status": "approved",
        "note": (
            f"Terrain features estimated from the {district} district average -- this is "
            "an approximation, not a site-specific measurement, and is disclosed as such "
            "wherever this place's risk is shown."
        ) if terrain else (
            f"No reference places exist yet for '{district}' district, so terrain "
            "features could not be estimated. Risk queries for this place will fail "
            "until terrain data is added manually."
        ),
    }


@router.post("/submissions/{submission_id}/reject")
def reject_submission(submission_id: int, admin_notes: str = "", db: Session = Depends(get_db), _admin=Depends(get_current_admin_required)):
    submission = db.query(PlaceSubmission).filter(PlaceSubmission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    submission.status = "rejected"
    submission.admin_notes = admin_notes
    db.commit()
    return {"status": "rejected"}