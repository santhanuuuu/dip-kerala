"""
seed_places.py -- one-time script. Reads the boundary geojson + feature store CSV (both just
files produced by Notebook 00, no ML involved here) and bulk-inserts all 1,034 Kerala LSGD
units into the `places` table with their static terrain features already attached.

Run once after the database is created:
    python db/seed_places.py
"""
import os
import sys
from dotenv import load_dotenv

load_dotenv()  # reads backend/.env -- without this, DATABASE_URL below always falls back to localhost
import geopandas as gpd
import pandas as pd
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from geoalchemy2.shape import from_shape

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db.models import Base, Place  # noqa: E402

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEOJSON_PATH = os.path.join(BASE_DIR, "data", "kerala_lsgd_boundaries.geojson")
# Prefer the v2 feature store (adds flow_accumulation + soil_texture_class for the improved
# flood/landslide models from Notebook 05) -- fall back to v1 if it hasn't been added yet.
FEATURE_STORE_V2_PATH = os.path.join(BASE_DIR, "data", "lsgd_feature_store_v2.csv")
FEATURE_STORE_V1_PATH = os.path.join(BASE_DIR, "data", "lsgd_feature_store.csv")
FEATURE_STORE_PATH = FEATURE_STORE_V2_PATH if os.path.exists(FEATURE_STORE_V2_PATH) else FEATURE_STORE_V1_PATH
USING_V2 = FEATURE_STORE_PATH == FEATURE_STORE_V2_PATH

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://localhost/dip_kerala")


def main():
    if not os.path.exists(GEOJSON_PATH):
        print(f"ERROR: {GEOJSON_PATH} not found. Copy kerala_lsgd_boundaries.geojson into backend/data/ first.")
        sys.exit(1)
    if not os.path.exists(FEATURE_STORE_PATH):
        print(f"ERROR: {FEATURE_STORE_PATH} not found. Copy lsgd_feature_store.csv into backend/data/ first.")
        sys.exit(1)

    print("Loading boundaries...")
    gdf = gpd.read_file(GEOJSON_PATH)

    # Raw OSM export column names -> our standard names (same rename used throughout the notebooks)
    rename_map = {"local_auth": "place_type", "name": "name", "name_ml": "name_malayalam", "District": "district"}
    gdf = gdf.rename(columns={k: v for k, v in rename_map.items() if k in gdf.columns})
    if "lsgd_id" not in gdf.columns:
        gdf["lsgd_id"] = range(1, len(gdf) + 1)

    gdf_wgs84 = gdf.to_crs(epsg=4326)
    # Project to UTM zone 43N (covers Kerala) for an accurate centroid, then convert back to
    # lat/lon -- computing centroid directly in WGS84 (degrees) distorts for irregularly
    # shaped polygons; this avoids that.
    gdf_utm = gdf_wgs84.to_crs(epsg=32643)
    centroids_utm = gdf_utm.geometry.centroid
    centroids_wgs84 = gpd.GeoSeries(centroids_utm, crs=32643).to_crs(epsg=4326)
    gdf_wgs84["centroid_lat"] = centroids_wgs84.y
    gdf_wgs84["centroid_lon"] = centroids_wgs84.x

    print(f"Loaded {len(gdf_wgs84)} boundary polygons")

    print("Loading feature store (terrain features)...")
    features_df = pd.read_csv(FEATURE_STORE_PATH)
    base_cols = ["lsgd_id", "elevation", "slope", "dist_to_water_m", "vegetation", "builtup"]
    extra_cols = ["flow_accumulation", "soil_texture_class"] if USING_V2 else []
    features_df = features_df[base_cols + extra_cols].drop_duplicates(subset="lsgd_id")
    print(f"Using {'v2' if USING_V2 else 'v1'} feature store: {FEATURE_STORE_PATH}")

    merged = gdf_wgs84.merge(features_df, on="lsgd_id", how="left")
    missing_features = merged["elevation"].isna().sum()
    if missing_features > 0:
        print(f"WARNING: {missing_features} places have no matching terrain features (elevation is NULL)")

    print("Connecting to database...")
    engine = create_engine(DATABASE_URL)
    Base.metadata.create_all(engine)  # creates tables if they don't exist yet
    Session = sessionmaker(bind=engine)
    session = Session()

    existing_count = session.query(Place).count()
    if existing_count > 0:
        print(f"WARNING: places table already has {existing_count} rows. Skipping to avoid duplicates.")
        print("If you want to re-seed, truncate the table first: DELETE FROM places;")
        return

    print("Inserting places...")
    inserted = 0
    for _, row in merged.iterrows():
        place = Place(
            lsgd_id=int(row["lsgd_id"]),
            name=row["name"],
            name_malayalam=row.get("name_malayalam"),
            place_type=row["place_type"],
            district=row["district"],
            geom=from_shape(row.geometry, srid=4326) if row.geometry else None,
            centroid_lat=float(row["centroid_lat"]),
            centroid_lon=float(row["centroid_lon"]),
            elevation=float(row["elevation"]) if pd.notna(row["elevation"]) else None,
            slope=float(row["slope"]) if pd.notna(row["slope"]) else None,
            dist_to_water_m=float(row["dist_to_water_m"]) if pd.notna(row["dist_to_water_m"]) else None,
            vegetation=float(row["vegetation"]) if pd.notna(row["vegetation"]) else None,
            builtup=float(row["builtup"]) if pd.notna(row["builtup"]) else None,
            flow_accumulation=float(row["flow_accumulation"]) if USING_V2 and pd.notna(row.get("flow_accumulation")) else None,
            soil_texture_class=float(row["soil_texture_class"]) if USING_V2 and pd.notna(row.get("soil_texture_class")) else None,
            is_verified=True,
        )
        session.add(place)
        inserted += 1

    session.commit()
    print(f"Done. Inserted {inserted} places.")


if __name__ == "__main__":
    main()
