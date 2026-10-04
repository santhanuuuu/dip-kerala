from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv
from sqlalchemy import text
import os

load_dotenv()  # reads backend/.env into os.environ -- must happen before any os.environ.get() calls below

from db.session import SessionLocal, engine
from db.models import Base
from services.news import refresh_news_cache
from db.seed_dams import run_seed_dams
from db.seed_shelters import run_seed_shelters
from routers import places, risk, damage, auth, news, helplines, admin, incidents, dams

# Create tables if they don't exist yet. IMPORTANT LIMITATION: this only creates tables that
# are completely missing -- it does NOT add new columns to a table that already exists. That
# gap caused a real production outage (shelters.submitted_by/status were added to the model
# but never applied to the already-existing table, breaking every shelter query with
# UndefinedColumn). The block below fixes that specific case and is written to be safely
# re-run on every single startup -- ADD COLUMN IF NOT EXISTS is a no-op once already applied.
Base.metadata.create_all(bind=engine)

with engine.connect() as conn:
    conn.execute(text("ALTER TABLE shelters ADD COLUMN IF NOT EXISTS submitted_by INTEGER REFERENCES users(id)"))
    conn.execute(text("ALTER TABLE shelters ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'verified'"))
    conn.execute(text("UPDATE shelters SET status = 'verified' WHERE status IS NULL"))
    # Dam redesign (filter tabs + persisted "last known" reading so a dam never goes blank
    # just because today's live-feed fetch missed it) -- same safely-rerunnable pattern.
    conn.execute(text("ALTER TABLE dams ADD COLUMN IF NOT EXISTS last_known_level_m FLOAT"))
    conn.execute(text("ALTER TABLE dams ADD COLUMN IF NOT EXISTS last_known_storage_percentage FLOAT"))
    conn.execute(text("ALTER TABLE dams ADD COLUMN IF NOT EXISTS last_known_updated_at VARCHAR"))
    conn.commit()

app = FastAPI(title="Disaster Intelligence Platform (DIP) API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:5173")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(places.router)
app.include_router(risk.router)
app.include_router(damage.router)
app.include_router(auth.router)
app.include_router(news.router)
app.include_router(helplines.router)
app.include_router(admin.router)
app.include_router(incidents.router)
app.include_router(dams.router)


def scheduled_news_refresh():
    db = SessionLocal()
    try:
        refresh_news_cache(db)
    finally:
        db.close()


def scheduled_dam_sync():
    """Pulls the KSEB/Irrigation Dept live feeds and writes any fresh reading straight into
    this database (which IS Supabase's Postgres -- there's no separate place to sync to).
    Runs on a timer so dam data updates even when nobody has visited the site, not only as a
    side effect of someone loading the Dams page. force_refetch=True bypasses dams.py's own
    30-minute cache so a job that only fires every 2 hours always checks the real feeds."""
    from routers.dams import sync_dam_levels
    db = SessionLocal()
    try:
        summary = sync_dam_levels(db, force_refetch=True)
        print(f"Scheduled dam sync: {summary['live_today']} of {summary['checked']} dams live right now.")
    except Exception as e:
        print(f"Scheduled dam sync failed (non-fatal, will retry next interval): {type(e).__name__}: {e}")
    finally:
        db.close()


scheduler = BackgroundScheduler()
scheduler.add_job(scheduled_news_refresh, "interval", hours=1, id="news_refresh")
# The underlying feeds only update once a day (KSEB) or daily (Irrigation Dept), so every 2
# hours is plenty fresh without hammering GitHub -- it just means nobody ever sees data more
# than ~2 hours stale relative to whatever the source itself has published.
scheduler.add_job(scheduled_dam_sync, "interval", hours=2, id="dam_sync")


@app.on_event("startup")
def startup():
    scheduler.start()
    scheduled_news_refresh()  # run once immediately so the news feed isn't empty for the first hour

    # Auto-seed dams and shelters reference data every startup -- previously this required
    # manually running seed_dams.py/seed_shelters.py against the production database, which
    # is exactly the kind of easy-to-forget manual step that left the Dams page looking
    # "broken" (empty) when it was actually just never populated. Both functions are
    # idempotent (upsert-by-name / skip-if-exists), so running them on every boot is safe and
    # cheap -- no risk of duplicating data.
    db = SessionLocal()
    try:
        dam_inserted, dam_updated = run_seed_dams(db)
        shelter_inserted = run_seed_shelters(db)
        print(f"Startup seed: dams +{dam_inserted}/{dam_updated} updated, shelters +{shelter_inserted}")
    except Exception as e:
        print(f"Startup seeding failed (non-fatal, app will still start): {type(e).__name__}: {e}")
    finally:
        db.close()

    scheduled_dam_sync()  # run once immediately so dam levels are fresh from the moment the app boots


@app.on_event("shutdown")
def shutdown():
    scheduler.shutdown()


@app.get("/")
def health_check():
    from services.inference import registry
    return {
        "status": "ok",
        "flood_model_loaded": registry.flood_model is not None,
        "landslide_model_loaded": registry.landslide_model is not None,
        "damage_model_loaded": registry.damage_model_available,
    }