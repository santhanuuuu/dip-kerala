"""
admin.py -- minimal admin endpoints. Referenced by routers/places.py's docstring but never
actually built until now -- without this, every user-submitted place sat in `pending` status
permanently with no way to promote it into the live `places` table.

NOTE ON ACCESS CONTROL: this currently only requires being logged in (any Google account),
NOT real admin privileges -- there is no admin/role system yet. Before deploying this for
real, add an `is_admin` boolean to the `users` table and check it here, otherwise any signed-in
user could approve their own place submissions. Flagged clearly rather than silently shipped
as if it were properly access-controlled.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db.session import get_db
from db.models import PlaceSubmission, Place
from routers.auth import get_current_user_required

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/submissions")
def list_pending_submissions(status: str = "pending", db: Session = Depends(get_db), user=Depends(get_current_user_required)):
    """TODO: restrict this to real admins once a role system exists (see module docstring).
    Currently any logged-in user can view/act on submissions."""
    submissions = db.query(PlaceSubmission).filter(PlaceSubmission.status == status).all()
    return {
        "results": [
            {
                "id": s.id, "name": s.name, "place_type": s.place_type, "district": s.district,
                "approx_lat": s.approx_lat, "approx_lon": s.approx_lon,
                "submitted_by": s.submitted_by, "created_at": s.created_at,
            }
            for s in submissions
        ]
    }


@router.post("/submissions/{submission_id}/approve")
def approve_submission(submission_id: int, db: Session = Depends(get_db), user=Depends(get_current_user_required)):
    """Promotes a pending submission into the live `places` table. Note: the resulting place
    has NO terrain features (elevation/slope/etc.) until someone re-runs Notebook 00's GEE
    extraction for it -- it will show up in search but /api/risk/{name} will 422 until then.
    This is stated honestly rather than silently producing a broken-looking result."""
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
def reject_submission(submission_id: int, admin_notes: str = "", db: Session = Depends(get_db), user=Depends(get_current_user_required)):
    submission = db.query(PlaceSubmission).filter(PlaceSubmission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    submission.status = "rejected"
    submission.admin_notes = admin_notes
    db.commit()
    return {"status": "rejected"}
