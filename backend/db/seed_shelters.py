"""
seed_shelters.py -- reads shelters_reference.csv (admin-verified shelter locations you've
manually compiled/sourced) and inserts them with status='verified'. Refactored so the same
logic runs BOTH as a standalone script AND automatically from main.py's startup (see
run_seed_shelters() -- cheap, safe to re-run, skips names already present).

shelters_reference.csv SHIPS EMPTY (just a header row) -- deliberately. No standing public
dataset of "every shelter in Kerala" exists (see db/models.py's Shelter docstring). Two ways
this table grows: (1) you add rows here yourself from a real source and redeploy; (2) the
public "Suggest a Shelter" feature on the Shelters page, which requires admin approval before
appearing publicly (see routers/admin.py).
"""
import os
import sys
import csv

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(BASE_DIR, "db", "shelters_reference.csv")


def run_seed_shelters(db) -> int:
    """Takes an open SQLAlchemy session. Returns count of newly-inserted shelters. Safe to
    call on every app startup -- skips any (name, district) pair already present."""
    from db.models import Shelter  # local import avoids a circular import with main.py

    if not os.path.exists(CSV_PATH):
        print(f"seed_shelters: {CSV_PATH} not found, skipping.")
        return 0

    inserted = 0
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name = (row.get("name") or "").strip()
            if not name:
                continue
            existing = db.query(Shelter).filter(
                Shelter.name == name, Shelter.district == row["district"].strip()
            ).first()
            if existing:
                continue
            db.add(Shelter(
                name=name,
                district=row["district"].strip(),
                lat=float(row["lat"]),
                lon=float(row["lon"]),
                capacity=int(row["capacity"]) if row.get("capacity", "").strip() else None,
                is_active=True,
                status="verified",
            ))
            inserted += 1

    db.commit()
    return inserted


def main():
    """Standalone CLI entrypoint -- `python db/seed_shelters.py`."""
    from dotenv import load_dotenv
    load_dotenv()
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    sys.path.insert(0, BASE_DIR)
    from db.models import Base, Shelter

    DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://localhost/dip_kerala")
    engine = create_engine(DATABASE_URL)
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    db = Session()

    inserted = run_seed_shelters(db)
    total = db.query(Shelter).filter(Shelter.status == "verified").count()
    print(f"Seeded {inserted} new shelters. {total} verified shelters now in the table.")
    if total == 0:
        print("shelters_reference.csv is empty -- add rows to it (name,district,lat,lon,capacity) "
              "from a real source, or rely on the public 'Suggest a Shelter' submission feature instead.")
    db.close()


if __name__ == "__main__":
    main()