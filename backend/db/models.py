"""
db/models.py -- SQLAlchemy models. Run `alembic upgrade head` (or Base.metadata.create_all)
to create these tables, then run db/seed_places.py once to populate `places`.
"""
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, Text, TIMESTAMP, ForeignKey, Date
)
from sqlalchemy.sql import func
from geoalchemy2 import Geometry
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class Place(Base):
    __tablename__ = "places"

    id = Column(Integer, primary_key=True)
    lsgd_id = Column(Integer, unique=True, nullable=True)
    name = Column(String, nullable=False)
    name_malayalam = Column(String)
    place_type = Column(String, nullable=False)  # gram_panchayat | municipality | municipal_corporation | user_submitted
    district = Column(String, nullable=False)
    geom = Column(Geometry("GEOMETRY", srid=4326), nullable=True)
    centroid_lat = Column(Float)
    centroid_lon = Column(Float)

    # Static terrain features -- copied in once from lsgd_feature_store.csv at seed time.
    # These are NOT recomputed by the backend; Google Earth Engine produced them in Notebook 00.
    elevation = Column(Float)
    slope = Column(Float)
    dist_to_water_m = Column(Float)
    vegetation = Column(Float)
    builtup = Column(Float)

    # Added for the v2 flood/landslide models (Notebook 05) -- from lsgd_feature_store_v2.csv.
    # Nullable because places seeded from the older v1 feature store won't have these; the
    # inference service falls back to the v1 models for any place missing them.
    flow_accumulation = Column(Float, nullable=True)
    soil_texture_class = Column(Float, nullable=True)

    is_verified = Column(Boolean, default=True)
    submitted_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now())


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    google_id = Column(String, unique=True, nullable=False)
    email = Column(String, unique=True, nullable=False)
    name = Column(String)
    avatar_url = Column(String)
    created_at = Column(TIMESTAMP, server_default=func.now())


class RiskQuery(Base):
    __tablename__ = "risk_queries"

    id = Column(Integer, primary_key=True)
    place_id = Column(Integer, ForeignKey("places.id"))
    queried_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    flood_probability = Column(Float)
    flood_risk_level = Column(String)
    landslide_risk_level = Column(String)
    landslide_confidence = Column(Float)
    rainfall_7day_mm = Column(Float)
    queried_at = Column(TIMESTAMP, server_default=func.now())


class DamageAssessment(Base):
    __tablename__ = "damage_assessments"

    id = Column(Integer, primary_key=True)
    place_id = Column(Integer, ForeignKey("places.id"))
    submitted_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    pre_image_url = Column(String, nullable=False)
    post_image_url = Column(String, nullable=False)
    damage_class = Column(String)
    confidence = Column(Float)
    event_date = Column(Date)
    created_at = Column(TIMESTAMP, server_default=func.now())


class PlaceSubmission(Base):
    __tablename__ = "place_submissions"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    place_type = Column(String)
    district = Column(String)
    approx_lat = Column(Float)
    approx_lon = Column(Float)
    submitted_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(String, default="pending")  # pending | approved | rejected
    admin_notes = Column(Text)
    created_at = Column(TIMESTAMP, server_default=func.now())


class EmergencyContact(Base):
    """Seeded once from known KSDMA/district emergency numbers -- not auto-updated from any
    live feed, since no public API for this exists. See services/helplines.py for details."""
    __tablename__ = "emergency_contacts"

    id = Column(Integer, primary_key=True)
    district = Column(String, nullable=False)
    contact_type = Column(String, nullable=False)  # police | fire | disaster_management | ambulance | control_room
    name = Column(String)
    phone_number = Column(String, nullable=False)
    updated_at = Column(TIMESTAMP, server_default=func.now())


class Shelter(Base):
    """Relief camp / shelter locations. No public live-updating source exists for this in
    Kerala today -- see services/helplines.py for how this is seeded and refreshed."""
    __tablename__ = "shelters"

    id = Column(Integer, primary_key=True)
    district = Column(String, nullable=False)
    place_id = Column(Integer, ForeignKey("places.id"), nullable=True)
    name = Column(String, nullable=False)
    capacity = Column(Integer)
    current_occupancy = Column(Integer)
    is_active = Column(Boolean, default=True)
    lat = Column(Float)
    lon = Column(Float)
    updated_at = Column(TIMESTAMP, server_default=func.now())


class NewsCache(Base):
    """Cached NewsAPI results, refreshed hourly by a scheduled job -- see services/news.py."""
    __tablename__ = "news_cache"

    id = Column(Integer, primary_key=True)
    title = Column(String, nullable=False)
    description = Column(Text)
    url = Column(String)
    image_url = Column(String)
    source_name = Column(String)
    published_at = Column(TIMESTAMP)
    fetched_at = Column(TIMESTAMP, server_default=func.now())
