"""
admin.py -- admin-only endpoints for reviewing user-submitted places. Protected by
get_current_admin_required (see routers/auth.py) -- requires the separate admin login,
not just any signed-in Google account.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

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


@router.post("/submissions/{submission_id}/approve")
def approve_submission(submission_id: int, db: Session = Depends(get_db), _admin=Depends(get_current_admin_required)):
    """Admin-only. Promotes a pending submission into the live `places` table. Note: the
    resulting place has NO terrain features (elevation/slope/etc.) until someone re-runs
    Notebook 00's GEE extraction for it -- it will show up in search but /api/risk/{name}
    will 422 until then. This is stated honestly rather than silently producing a
    broken-looking result."""
    submission = db.query(PlaceSubmission).filter(PlaceSubmission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    if submission.status != "pending":
        raise HTTPException(status_code=400, detail=f"Submission already {submission.status}")

    new_place = Place(
        name=submission.name,
        place_type=submission.place_type or "user_submitted",
        district=submission.district or "Unknown",
        centroid_lat=submission.approx_lat,
        centroid_lon=submission.approx_lon,
        is_verified=True,
        submitted_by=submission.submitted_by,
        # elevation/slope/dist_to_water_m/vegetation/builtup intentionally left NULL --
        # see docstring above.
    )
    db.add(new_place)
    submission.status = "approved"
    db.commit()
    db.refresh(new_place)

    return {
        "place_id": new_place.id,
        "status": "approved",
        "warning": (
            "This place has no terrain data yet, so flood/landslide risk queries will fail "
            "(422) until Notebook 00's GEE extraction is re-run to include it."
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
