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


scheduler = BackgroundScheduler()
scheduler.add_job(scheduled_news_refresh, "interval", hours=1, id="news_refresh")


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