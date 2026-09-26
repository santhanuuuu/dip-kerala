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

    elevation = Column(Float)
    slope = Column(Float)
    dist_to_water_m = Column(Float)
    vegetation = Column(Float)
    builtup = Column(Float)

    flow_accumulation = Column(Float, nullable=True)
    soil_texture_class = Column(Float, nullable=True)
    terrain_is_estimated = Column(Boolean, default=False)

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
    local_body = Column(String, nullable=True)
    approx_lat = Column(Float)
    approx_lon = Column(Float)
    submitted_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(String, default="pending")
    admin_notes = Column(Text)
    created_at = Column(TIMESTAMP, server_default=func.now())


class EmergencyContact(Base):
    __tablename__ = "emergency_contacts"

    id = Column(Integer, primary_key=True)
    district = Column(String, nullable=False)
    contact_type = Column(String, nullable=False)
    name = Column(String)
    phone_number = Column(String, nullable=False)
    updated_at = Column(TIMESTAMP, server_default=func.now())


class Shelter(Base):
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
    __tablename__ = "news_cache"

    id = Column(Integer, primary_key=True)
    title = Column(String, nullable=False)
    description = Column(Text)
    url = Column(String)
    image_url = Column(String)
    source_name = Column(String)
    published_at = Column(TIMESTAMP)
    is_kerala = Column(Boolean, default=False)
    fetched_at = Column(TIMESTAMP, server_default=func.now())


class IncidentReport(Base):
    """Crowdsourced 'I'm seeing this right now' reports -- distinct from PlaceSubmission
    (proposes a new PLACE to add) and DamageAssessment (admin-triggered ML classification).
    This is the fastest, lowest-friction path for anyone on the ground to flag something
    happening in real time.

    DELIBERATELY UNVERIFIED BY DEFAULT: official data (rainfall, terrain-based models) lags
    reality; people nearby often know first. `status` supports future admin moderation, but
    v1 shows everything as-submitted, clearly labeled "community-reported, unverified"
    wherever displayed -- never presented with the same authority as a model prediction.

    No photo upload in v1 -- same TODO pattern as DamageAssessment's images: needs real
    object storage (S3/Cloud Storage), which is a deployment decision, not something to fake
    with local disk storage that won't survive Render's ephemeral filesystem across restarts."""
    __tablename__ = "incident_reports"

    id = Column(Integer, primary_key=True)
    incident_type = Column(String, nullable=False)  # flood | landslide | road_blocked | other
    description = Column(Text, nullable=True)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    place_id = Column(Integer, ForeignKey("places.id"), nullable=True)
    district = Column(String, nullable=True)
    reported_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(String, default="unverified")  # unverified | verified | dismissed
    created_at = Column(TIMESTAMP, server_default=func.now())


class Dam(Base):
    """Static reference data for Kerala's dams -- NOT live water levels (those are fetched
    live at request time from KSEB/Irrigation Dept feeds and merged in by routers/dams.py,
    matched against `name` -- never stored here, since storing a live number would just go
    stale). See db/seed_dams.py and dams_reference.csv for how this table is populated.

    COVERAGE, STATED HONESTLY: only ~18 major KSEB hydro dams have a genuine live water-level
    feed (confirmed via https://github.com/amith-vp/Kerala-Dam-Water-Levels, itself scraping
    KSEB's own Dam Safety Organisation site) plus a further set from the Irrigation
    Department's feed. Every other dam in Kerala -- including most of the small diversion
    weirs -- has NO public live telemetry anywhere I could find. Those rows exist here for
    reference (location, owner, river) with has_live_data=False, never a fabricated number."""
    __tablename__ = "dams"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False, unique=True)
    district = Column(String, nullable=False)
    river = Column(String, nullable=True)
    owner = Column(String, nullable=True)  # e.g. "KSEB" | "Irrigation Department" | "Tamil Nadu PWD" (Mullaperiyar)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    reservoir_name = Column(String, nullable=True)
    dam_type = Column(String, nullable=True)  # e.g. "Gravity", "Arch", "Earthen", "Rockfill"
    capacity_mcm = Column(Float, nullable=True)  # gross/live storage capacity, million cubic metres
    frl_m = Column(Float, nullable=True)  # Full Reservoir Level, metres
    # Matches this dam's entry in the live KSEB/Irrigation feeds -- kept separate from `name`
    # (the display name) since the feeds use inconsistent official naming (e.g. this app's
    # "Mattupetty" vs the feed's "MADUPETTY").
    live_feed_key = Column(String, nullable=True)