from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from db.session import get_db
from db.models import EmergencyContact, Shelter
from routers.auth import get_current_user_required

router = APIRouter(prefix="/api", tags=["helplines"])


@router.get("/helplines")
def get_helplines(district: str = None, db: Session = Depends(get_db)):
    """Returns national numbers (always shown) + district-specific ones where verified.
    See services/helplines.py for why some district numbers may show as 'not yet verified'
    rather than a fabricated placeholder."""
    query = db.query(EmergencyContact)
    if district:
        query = query.filter(
            (EmergencyContact.district == district) | (EmergencyContact.district == "Kerala (State-wide)")
        )
    contacts = query.all()
    return {
        "results": [
            {"district": c.district, "contact_type": c.contact_type, "name": c.name, "phone_number": c.phone_number}
            for c in contacts
            if c.phone_number != "VERIFY_AND_ADD"  # never show an unverified placeholder to a real user
        ]
    }


@router.get("/shelters")
def get_shelters(district: str = None, db: Session = Depends(get_db)):
    """Public listing -- only status='verified' shelters (admin-seeded, or a user submission
    an admin has approved). Pending/unreviewed submissions never appear here -- see
    POST /api/shelters for how they're submitted and routers/admin.py for how they're
    reviewed. Sending someone to an unverified location during an actual emergency is a real
    safety risk, so this is stricter than most of this app's other "show it, disclosed as
    unverified" crowdsourced content (e.g. IncidentReport)."""
    query = db.query(Shelter).filter(Shelter.is_active == True, Shelter.status == "verified")  # noqa: E712
    if district:
        query = query.filter(Shelter.district == district)
    shelters = query.all()
    return {
        "results": [
            {"name": s.name, "district": s.district, "capacity": s.capacity,
             "current_occupancy": s.current_occupancy, "lat": s.lat, "lon": s.lon,
             "updated_at": s.updated_at}
            for s in shelters
        ],
        "note": (
            "Shelter data is manually updated by disaster-management authorities, not "
            "automatically -- no public live shelter-occupancy feed exists for Kerala today. "
            "Every shelter listed here has been reviewed and confirmed by an admin."
        ),
    }


class ShelterSubmissionIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    district: str
    lat: float
    lon: float
    capacity: int | None = None


@router.post("/shelters")
def submit_shelter(payload: ShelterSubmissionIn, db: Session = Depends(get_db), user=Depends(get_current_user_required)):
    """Anyone signed in can suggest a shelter (a school, community hall, or similar building
    that could serve as a relief camp). Requires login (unlike IncidentReport, which allows
    anonymous submission) since this is higher-stakes, actionable data that should be
    traceable to a real account -- always created as status='pending' and NEVER appears in
    the public GET /api/shelters listing until an admin reviews and approves it."""
    if not (7.5 <= payload.lat <= 12.9 and 74.5 <= payload.lon <= 77.5):
        raise HTTPException(status_code=422, detail="Coordinates look like they're outside Kerala.")

    shelter = Shelter(
        name=payload.name.strip(),
        district=payload.district.strip(),
        lat=payload.lat,
        lon=payload.lon,
        capacity=payload.capacity,
        is_active=True,
        submitted_by=user.id,
        status="pending",
    )
    db.add(shelter)
    db.commit()
    db.refresh(shelter)
    return {
        "id": shelter.id,
        "status": "pending",
        "note": "Thank you -- this will appear publicly once an admin has reviewed and confirmed it.",
    }