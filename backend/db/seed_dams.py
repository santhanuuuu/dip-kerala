"""
seed_dams.py -- reads dams_reference.csv (static reference info) and upserts the `dams`
table. Refactored so the same logic runs BOTH as a standalone script (for manual use/local
testing) AND automatically from main.py's startup (see run_seed_dams(), which main.py calls
every boot -- cheap and safe to re-run since it upserts by name rather than duplicating).

COVERAGE: dams_reference.csv ships with real, sourced data for the ~18 KSEB dams confirmed to
have a genuine live water-level feed, plus every dam name/district from Kerala's known dam
list. Most rows for smaller dams have empty river/owner/lat/lon/capacity/FRL fields --
deliberately left blank rather than guessed. Fill those in from KSEB (https://dams.kseb.in),
the Kerala Irrigation Department, or CWC's India-WRIS portal as you're able to verify them.
"""
import os
import sys
import csv

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(BASE_DIR, "db", "dams_reference.csv")


def _float_or_none(v):
    v = (v or "").strip()
    return float(v) if v else None


def run_seed_dams(db) -> tuple[int, int]:
    """Takes an open SQLAlchemy session. Returns (inserted, updated) counts. Safe to call on
    every app startup -- upserts by dam name, never duplicates."""
    from db.models import Dam  # local import avoids a circular import with main.py

    if not os.path.exists(CSV_PATH):
        print(f"seed_dams: {CSV_PATH} not found, skipping.")
        return (0, 0)

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
    return (inserted, updated)


def main():
    """Standalone CLI entrypoint -- `python db/seed_dams.py`. Still works exactly as before
    for manual/local use; main.py's automatic startup call uses run_seed_dams() directly."""
    from dotenv import load_dotenv
    load_dotenv()
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    sys.path.insert(0, BASE_DIR)
    from db.models import Base, Dam

    DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://localhost/dip_kerala")
    engine = create_engine(DATABASE_URL)
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    db = Session()

    inserted, updated = run_seed_dams(db)
    total = db.query(Dam).count()
    with_live_key = db.query(Dam).filter(Dam.live_feed_key.isnot(None)).count()
    print(f"Seeded dams: {inserted} inserted, {updated} updated, {total} total in table.")
    print(f"{with_live_key} of {total} dams have a live_feed_key set (will show live data); "
          f"the remaining {total - with_live_key} will show static reference info only.")
    db.close()


if __name__ == "__main__":
    main()