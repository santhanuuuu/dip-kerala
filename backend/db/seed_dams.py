"""
seed_dams.py -- one-time script. Reads dams_reference.csv (static reference info: location,
owner, river, capacity) and bulk-inserts/updates the `dams` table. This is STATIC data only --
live water levels are fetched at request time by routers/dams.py, never stored here.

Run once after the database is created, and again any time dams_reference.csv is updated
with more dams or corrected details:
    python db/seed_dams.py

COVERAGE: dams_reference.csv ships with real, sourced data for the ~18 KSEB dams confirmed to
have a genuine live water-level feed (see routers/dams.py's docstring for the source), plus
every dam name/district from Kerala's known dam list. Most rows for smaller dams have empty
river/owner/lat/lon/capacity/FRL fields -- deliberately left blank rather than guessed. Fill
those in from KSEB (https://dams.kseb.in), the Kerala Irrigation Department, or CWC's
India-WRIS portal as you're able to verify them, then re-run this script to update.
"""
import os
import sys
import csv
from dotenv import load_dotenv

load_dotenv()
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db.models import Base, Dam  # noqa: E402

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(BASE_DIR, "db", "dams_reference.csv")
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://localhost/dip_kerala")


def _float_or_none(v):
    v = (v or "").strip()
    return float(v) if v else None


def main():
    if not os.path.exists(CSV_PATH):
        print(f"ERROR: {CSV_PATH} not found.")
        sys.exit(1)

    engine = create_engine(DATABASE_URL)
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    db = Session()

    inserted, updated = 0, 0
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name = row["name"].strip()
            if not name:
                continue
            existing = db.query(Dam).filter(Dam.name == name).first()
            fields = dict(
                district=row["district"].strip(),
                river=row.get("river", "").strip() or None,
                owner=row.get("owner", "").strip() or None,
                latitude=_float_or_none(row.get("latitude")),
                longitude=_float_or_none(row.get("longitude")),
                reservoir_name=row.get("reservoir_name", "").strip() or None,
                dam_type=row.get("dam_type", "").strip() or None,
                capacity_mcm=_float_or_none(row.get("capacity_mcm")),
                frl_m=_float_or_none(row.get("frl_m")),
                live_feed_key=row.get("live_feed_key", "").strip() or None,
            )
            if existing:
                for k, v in fields.items():
                    setattr(existing, k, v)
                updated += 1
            else:
                db.add(Dam(name=name, **fields))
                inserted += 1

    db.commit()
    total = db.query(Dam).count()
    with_live_key = db.query(Dam).filter(Dam.live_feed_key.isnot(None)).count()
    print(f"Seeded dams: {inserted} inserted, {updated} updated, {total} total in table.")
    print(f"{with_live_key} of {total} dams have a live_feed_key set (will show live data); "
          f"the remaining {total - with_live_key} will show static reference info only.")
    db.close()


if __name__ == "__main__":
    main()