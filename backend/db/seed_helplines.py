"""
seed_helplines.py -- one-time script. Inserts the SAFE, verified contacts from
services/helplines.py's get_seed_contacts() into the emergency_contacts table.

This was previously defined but never called anywhere -- the /api/helplines endpoint would
return an empty list forever without this script being run.

Run once after the database is created (can run before or after seed_places.py):
    python db/seed_helplines.py

Does NOT seed the `shelters` table -- there is no safe default data for that (see
services/helplines.py for why). Shelters need either manual entry via an admin endpoint or
a real data feed once one exists.
"""
import os
import sys
from dotenv import load_dotenv

load_dotenv()  # reads backend/.env -- without this, DATABASE_URL below always falls back to localhost

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db.models import Base, EmergencyContact  # noqa: E402
from services.helplines import get_seed_contacts  # noqa: E402
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://localhost/dip_kerala")


def main():
    engine = create_engine(DATABASE_URL)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    existing = session.query(EmergencyContact).count()
    if existing > 0:
        print(f"WARNING: emergency_contacts already has {existing} rows. Skipping to avoid duplicates.")
        print("To re-seed: DELETE FROM emergency_contacts; then run this again.")
        return

    contacts = get_seed_contacts()
    for c in contacts:
        session.add(EmergencyContact(
            district=c.get("district", "Kerala (State-wide)"),
            contact_type=c["contact_type"],
            name=c["name"],
            phone_number=c["phone_number"],
        ))
    session.commit()
    print(f"Done. Inserted {len(contacts)} verified emergency contacts.")
    print("Reminder: district-specific control room numbers still need to be sourced and")
    print("added manually -- see services/helplines.py's DISTRICT_CONTROL_ROOMS_TEMPLATE.")


if __name__ == "__main__":
    main()
