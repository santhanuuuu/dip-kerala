"""
seed_shelters.py -- one-time/repeatable script. Reads shelters_reference.csv (admin-verified
shelter locations you've manually compiled/sourced -- e.g. from a KSDMA district office, a
known Multi-Purpose Cyclone Shelter, or a confirmed relief camp) and inserts them with
status='verified' directly (bypassing the pending-review queue, since YOU are the source of
truth here, not an anonymous public submission).

shelters_reference.csv SHIPS EMPTY (just a header row) -- deliberately. No standing public
dataset of "every shelter in Kerala" exists (see db/models.py's Shelter docstring), so there
is nothing honest to pre-fill here. Two ways this table gets populated in practice:
  1. You add rows to this CSV yourself (from KSDMA, a district collectorate, or local
     knowledge) and run this script.
  2. The public "Suggest a Shelter" feature on the Shelters page (POST /api/shelters) lets
     any signed-in user propose one, which then needs admin approval (see routers/admin.py
     and AdminReviewPage.tsx) before it appears publicly -- that's the primary way this
     table should realistically grow over time.

Run:
    python db/seed_shelters.py
"""
import os
import sys
import csv
from dotenv import load_dotenv

load_dotenv()
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db.models import Base, Shelter  # noqa: E402

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(BASE_DIR, "db", "shelters_reference.csv")
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://localhost/dip_kerala")


def main():
    if not os.path.exists(CSV_PATH):
        print(f"ERROR: {CSV_PATH} not found.")
        sys.exit(1)

    engine = create_engine(DATABASE_URL)
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    db = Session()

    inserted = 0
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name = (row.get("name") or "").strip()
            if not name:
                continue
            existing = db.query(Shelter).filter(Shelter.name == name, Shelter.district == row["district"].strip()).first()
            if existing:
                continue  # don't duplicate on re-run
            db.add(Shelter(
                name=name,
                district=row["district"].strip(),
                lat=float(row["lat"]),
                lon=float(row["lon"]),
                capacity=int(row["capacity"]) if row.get("capacity", "").strip() else None,
                is_active=True,
                status="verified",  # admin-sourced -- trusted directly, not queued for review
            ))
            inserted += 1

    db.commit()
    total = db.query(Shelter).filter(Shelter.status == "verified").count()
    print(f"Seeded {inserted} new shelters. {total} verified shelters now in the table.")
    if total == 0:
        print("shelters_reference.csv is empty -- add rows to it (name,district,lat,lon,capacity) "
              "from a real source, or rely on the public 'Suggest a Shelter' submission feature instead.")
    db.close()


if __name__ == "__main__":
    main()