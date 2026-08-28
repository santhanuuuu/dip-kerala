from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv
import os

load_dotenv()  # reads backend/.env into os.environ -- must happen before any os.environ.get() calls below

from db.session import SessionLocal, engine
from db.models import Base
from services.news import refresh_news_cache
from routers import places, risk, damage, auth, news, helplines, admin

# Create tables if they don't exist yet. Safe to call on every startup -- it's a no-op
# for tables that already exist. For production, prefer real Alembic migrations instead,
# but this guarantees the app never boots against a genuinely empty schema again.
Base.metadata.create_all(bind=engine)

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
    # Run once immediately at startup so the news feed isn't empty for the first hour
    scheduled_news_refresh()


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
