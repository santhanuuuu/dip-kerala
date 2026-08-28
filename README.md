# DIP Kerala — Final Handoff

## What I did (all automatic, already live)

**Supabase (Dip_Kerala project):**
1. Project was paused (free-tier auto-pause) — restored to ACTIVE_HEALTHY.
2. Schema was never applied — created all 8 tables via migration.
3. Enabled Row Level Security on every table: public read-only access on places/
   emergency_contacts/shelters/news_cache, and no public access at all on
   users/risk_queries/damage_assessments/place_submissions (only your backend's direct
   connection can touch those, which bypasses RLS by design).
4. Added `flow_accumulation` and `soil_texture_class` columns to the `places` table
   for the improved models.

**Models (the actual accuracy improvement):**
5. Built and ran `notebooks/05_Real_Ground_Truth_and_Retrain.ipynb` — replaced the
   district-copy-paste flood/landslide labels with real per-unit ground truth
   (Sentinel-1 SAR flood extent + the published 2018 landslide inventory you gave me).
6. Retrained both models. Honest accuracy improved substantially — but read the
   caveat below before treating that number alone as the full story:

   | Model | Old honest accuracy | New honest accuracy | New honest macro-F1 | "Always guess majority" baseline |
   |---|---|---|---|---|
   | Flood | 0.5084 | 0.8730 | ~0.75 (varies by run) | ~0.79 |
   | Landslide | 0.1773 | 0.8525 | ~0.44 (varies by run) | ~0.83 |

   **Important:** the real ground truth turned out far more imbalanced than the old
   district-copied labels (most places genuinely didn't flood/landslide in 2018).
   That means a lot of the accuracy jump is the label imbalance itself, not pure model
   skill — compare the macro-F1 column, not just accuracy, when you write this up.
   The landslide model in particular has near-zero recall on the "High" risk tier —
   state this honestly in your report, same standard you've applied everywhere else
   in this project.
7. Pulled the actual trained `_v2.pkl` files straight from your Drive into
   `backend/ml_models/` (verified byte-for-byte against Drive).
8. Wired the backend to use them: `backend/services/inference.py` now loads the v2
   models automatically if present (falls back to v1 otherwise), and
   `backend/routers/risk.py` passes the two new features through at all three call
   sites that use the models.
9. Updated `backend/db/seed_places.py` to seed from the v2 feature store (which I
   also pulled from your Drive into `backend/data/lsgd_feature_store_v2.csv`) so the
   two new columns get populated automatically when you seed.
10. `backend/main.py` now calls `Base.metadata.create_all()` on startup, so the
    database schema can never silently stay empty again.

## What you need to do manually

1. **Run `backend/db/seed_places.py` and `backend/db/seed_helplines.py` once** —
   against the now-live Supabase DB. Tables exist and are correctly structured, but
   are empty (0 rows) until you run these.
2. **Double-check `backend/.env`** isn't committed anywhere public before handing
   this project to anyone else (Grok included) — it has live credentials.
3. **Read the accuracy caveat above** before writing up the "improved" model numbers
   in your report — macro-F1, not just accuracy, is the honest headline number here.
4. **One thing I could not fix**: `spatial_ref_sys` (a PostGIS system table, not your
   data — just a reference list of coordinate systems) can't have Row Level Security
   enabled because Supabase doesn't grant table-owner rights on it. This is a known,
   low-risk limitation, not something you did wrong.
5. If you later add more flood/landslide event-years of real ground truth (the
   notebook is built to be reusable for other years), re-run Notebook 05's retraining
   cells — the more independent events you have real labels for, the more the honest
   accuracy will reflect genuine signal rather than the current single 2018 baseline.
