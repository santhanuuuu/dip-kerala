from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.session import get_db
from db.models import EmergencyContact, Shelter

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
    query = db.query(Shelter).filter(Shelter.is_active == True)  # noqa: E712
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
            "automatically -- no public live shelter-occupancy feed exists for Kerala today."
        ),
    }
