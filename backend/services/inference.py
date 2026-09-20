"""
inference.py -- loads the already-trained model files ONCE at startup and exposes simple
predict functions. This file does NOT train, fit, or modify any model -- it only calls
.predict()/.predict_proba() on objects that were trained externally in Google Colab.
"""
import os
import json
import joblib
import pandas as pd
# torch is imported lazily inside the damage-assessment functions only -- flood and landslide
# inference (the two most-used endpoints) don't need PyTorch at all, so we don't force every
# environment running this backend to have it installed just to serve flood/landslide requests.

from services import seasonal_rainfall

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ML_MODELS_DIR = os.path.join(BASE_DIR, "ml_models")
DATA_DIR = os.path.join(BASE_DIR, "data")

# v1 defaults -- overridden per-registry-instance if a v2 model + its accuracy JSON (which
# records the exact feature order used at training time) are both found. Never hardcode the
# v2 feature list here: reading it from the JSON means this can't silently drift out of sync
# with what Notebook 05 actually trained on.
FLOOD_FEATURE_COLS = ["elevation", "slope", "rainfall_7day_mm", "dist_to_water_m", "vegetation", "builtup"]
LANDSLIDE_FEATURE_COLS = ["elevation", "slope", "rainfall_7day_mm", "vegetation", "dist_to_water_m"]

# --- Rainfall calibration -------------------------------------------------------------
# flood_model_v2 and landslide_model_v2 (see Notebook 00, cell "FEATURE STORE SUMMARY") were
# trained ENTIRELY on rainfall_7day_mm values from the single most extreme week of the August
# 2018 Kerala floods (13-19 Aug 2018) -- the printed training output confirms the actual range
# seen was 132.8mm to 1041.5mm. The model has NEVER seen a rainfall value below 132.8mm, so it
# can't distinguish "completely dry" from "the low end of a monsoon week" -- it falls back on
# terrain alone for any live rainfall below that floor.
#
# THE FIX (see seasonal_rainfall.py + Notebook 06): rather than a hand-tuned guess about how
# much to dampen, this now uses a genuinely DATA-DRIVEN seasonal factor -- a logistic
# regression fitted on 118 years (1901-2018) of real statewide rainfall/flood outcomes,
# applied to Kerala's actual SEASON-TO-DATE (Jun 1-today) cumulative rainfall. When the season
# has been dry, that factor is near 0 and scales terrain-driven risk down accordingly; when
# the season is genuinely wet, the factor approaches 1 and the raw terrain model's output
# passes through mostly unchanged. This is a disclosed CALIBRATION layered on top of the
# terrain models, not a retrain -- every adjusted prediction reports both the raw and
# calibrated numbers so nothing is silently hidden.
FLOOD_RISK_HIGH = 0.7
FLOOD_RISK_MODERATE = 0.4


class ModelRegistry:
    """Loads every model file once at server startup. Nothing in here trains anything --
    it's purely loading pre-trained objects and calling their existing predict methods.

    Prefers the v2 flood/landslide models (real per-unit ground truth, see Notebook 05)
    when their files are present in ml_models/, and falls back to the original v1 models
    otherwise -- so dropping this backend into an environment that hasn't been given the
    v2 files yet still works exactly as before, just with the older, less accurate models."""

    def __init__(self):
        self.flood_model = None
        self.flood_scaler = None
        self.flood_accuracy = None
        self.flood_feature_cols = FLOOD_FEATURE_COLS
        self.flood_uses_v2 = False

        self.landslide_model = None
        self.landslide_scaler = None
        self.landslide_label_encoder = None
        self.landslide_accuracy = None
        self.landslide_feature_cols = LANDSLIDE_FEATURE_COLS
        self.landslide_uses_v2 = False

        self.damage_model = None
        self.damage_accuracy = None
        self.damage_model_available = False

        self._load_all()

    def _load_json(self, filename):
        path = os.path.join(ML_MODELS_DIR, filename)
        if not os.path.exists(path):
            return None
        with open(path) as f:
            return json.load(f)

    def _load_all(self):
        # --- Flood model: prefer v2 ---
        flood_v2_paths = [os.path.join(ML_MODELS_DIR, f) for f in ("flood_model_v2.pkl", "flood_scaler_v2.pkl")]
        if all(os.path.exists(p) for p in flood_v2_paths):
            self.flood_model = joblib.load(flood_v2_paths[0])
            self.flood_scaler = joblib.load(flood_v2_paths[1])
            self.flood_accuracy = self._load_json("flood_accuracy_v2.json")
            self.flood_feature_cols = (self.flood_accuracy or {}).get("features", FLOOD_FEATURE_COLS)
            self.flood_uses_v2 = True
            print(f"Loaded flood_model_v2.pkl (features: {self.flood_feature_cols})")
        else:
            flood_model_path = os.path.join(ML_MODELS_DIR, "flood_model.pkl")
            flood_scaler_path = os.path.join(ML_MODELS_DIR, "flood_scaler.pkl")
            if os.path.exists(flood_model_path) and os.path.exists(flood_scaler_path):
                self.flood_model = joblib.load(flood_model_path)
                self.flood_scaler = joblib.load(flood_scaler_path)
                self.flood_accuracy = self._load_json("flood_accuracy.json")
                print("Loaded flood_model.pkl (v1 -- v2 files not found in ml_models/)")
            else:
                print("WARNING: no flood model files found -- flood endpoint will fail")

        # --- Landslide model: prefer v2 ---
        ls_v2_paths = [os.path.join(ML_MODELS_DIR, f) for f in
                       ("landslide_model_v2.pkl", "landslide_scaler_v2.pkl", "landslide_label_encoder_v2.pkl")]
        if all(os.path.exists(p) for p in ls_v2_paths):
            self.landslide_model = joblib.load(ls_v2_paths[0])
            self.landslide_scaler = joblib.load(ls_v2_paths[1])
            self.landslide_label_encoder = joblib.load(ls_v2_paths[2])
            self.landslide_accuracy = self._load_json("landslide_accuracy_v2.json")
            self.landslide_feature_cols = (self.landslide_accuracy or {}).get("features", LANDSLIDE_FEATURE_COLS)
            self.landslide_uses_v2 = True
            print(f"Loaded landslide_model_v2.pkl (features: {self.landslide_feature_cols})")
        else:
            ls_model_path = os.path.join(ML_MODELS_DIR, "landslide_model.pkl")
            ls_scaler_path = os.path.join(ML_MODELS_DIR, "landslide_scaler.pkl")
            ls_le_path = os.path.join(ML_MODELS_DIR, "landslide_label_encoder.pkl")
            if os.path.exists(ls_model_path) and os.path.exists(ls_scaler_path) and os.path.exists(ls_le_path):
                self.landslide_model = joblib.load(ls_model_path)
                self.landslide_scaler = joblib.load(ls_scaler_path)
                self.landslide_label_encoder = joblib.load(ls_le_path)
                self.landslide_accuracy = self._load_json("landslide_accuracy.json")
                print("Loaded landslide_model.pkl (v1 -- v2 files not found in ml_models/)")
            else:
                print("WARNING: no landslide model files found -- landslide endpoint will fail")

        # --- Damage assessment model (PyTorch) -- loaded lazily, see _load_damage_model() ---
        damage_model_path = os.path.join(ML_MODELS_DIR, "damage_model.pt")
        if os.path.exists(damage_model_path):
            try:
                self._load_damage_model(damage_model_path)
            except Exception as e:
                print(f"WARNING: failed to load damage_model.pt: {e}")
        else:
            print("WARNING: damage_model.pt not found -- damage assessment endpoint disabled until it's added to backend/ml_models/")
        self.damage_accuracy = self._load_json("damage_assessment_accuracy.json")

    def _load_damage_model(self, damage_model_path):
        import torch  # only imported if damage_model.pt actually exists
        from services.damage_model_arch import SiameseDamageNet  # architecture must match Notebook 03 exactly
        self.damage_model = SiameseDamageNet(num_classes=4)
        self.damage_model.load_state_dict(torch.load(damage_model_path, map_location="cpu"))
        self.damage_model.eval()
        self.damage_model_available = True


# Loaded once, reused across every request -- this is what "don't reload per request" means.
registry = ModelRegistry()


def predict_flood(elevation, slope, rainfall_7day_mm, dist_to_water_m, vegetation, builtup, flow_accumulation=None):
    """Directly mirrors Notebook 04/05's flood section. Returns probability + label.
    flow_accumulation is only used by the v2 model -- ignored (and not required) for v1.

    Applies the seasonal rainfall calibration (see module docstring + seasonal_rainfall.py)
    whenever the season's factor is below 1.0 -- always discloses both the raw model output
    and the calibrated one, plus the seasonal context, so nothing is silently hidden."""
    if registry.flood_model is None:
        raise RuntimeError("Flood model not loaded -- check backend/ml_models/ for flood_model(.pkl or _v2.pkl)")

    row = {
        "elevation": elevation, "slope": slope, "rainfall_7day_mm": rainfall_7day_mm,
        "dist_to_water_m": dist_to_water_m, "vegetation": vegetation, "builtup": builtup,
        "flow_accumulation": flow_accumulation,
    }
    if registry.flood_uses_v2 and flow_accumulation is None:
        raise RuntimeError(
            "This place has no flow_accumulation value (only in the v2 feature store) -- "
            "re-run db/seed_places.py against lsgd_feature_store_v2.csv, or fall back to the v1 model."
        )
    X = pd.DataFrame([row])[registry.flood_feature_cols]

    X_scaled = registry.flood_scaler.transform(X)
    raw_prob = float(registry.flood_model.predict_proba(X_scaled)[0][1])

    seasonal = seasonal_rainfall.get_seasonal_flood_factor()
    factor = seasonal["factor"]
    calibrated_prob = raw_prob * factor
    risk_level = "HIGH" if calibrated_prob > FLOOD_RISK_HIGH else "MODERATE" if calibrated_prob > FLOOD_RISK_MODERATE else "LOW"

    result = {"probability": calibrated_prob, "risk_level": risk_level}
    if factor < 1.0:
        result["raw_model_probability"] = raw_prob
        result["rainfall_calibration_applied"] = True
        result["calibration_note"] = (
            f"Terrain-based model output ({raw_prob:.0%}) scaled by a seasonal rainfall factor "
            f"of {factor:.2f} -- {seasonal['note']}"
        )
    return result


def predict_landslide(elevation, slope, rainfall_7day_mm, vegetation, dist_to_water_m, soil_texture_class=None):
    """Directly mirrors Notebook 04/05's landslide section.
    soil_texture_class is only used by the v2 model -- ignored (and not required) for v1.

    Applies the SAME seasonal rainfall factor used for flood (see seasonal_rainfall.py) to the
    risk TIER (Low/Moderate/High/Critical), since this model outputs a class, not a
    probability. NOTE: this reuses the flood calibration as a proxy -- no dedicated multi-year
    landslide dataset was available to fit a landslide-specific version (Kerala landslide data
    found so far only covers the single 2018 event). Landslides are also monsoon-saturation
    driven, so this is a reasonable stand-in, not a precise fit -- revisit if a multi-year
    landslide inventory becomes available."""
    if registry.landslide_model is None:
        raise RuntimeError("Landslide model not loaded -- check backend/ml_models/ for landslide_model(.pkl or _v2.pkl)")

    row = {
        "elevation": elevation, "slope": slope, "rainfall_7day_mm": rainfall_7day_mm,
        "vegetation": vegetation, "dist_to_water_m": dist_to_water_m,
        "soil_texture_class": soil_texture_class,
    }
    if registry.landslide_uses_v2 and soil_texture_class is None:
        raise RuntimeError(
            "This place has no soil_texture_class value (only in the v2 feature store) -- "
            "re-run db/seed_places.py against lsgd_feature_store_v2.csv, or fall back to the v1 model."
        )
    X = pd.DataFrame([row])[registry.landslide_feature_cols]

    X_scaled = registry.landslide_scaler.transform(X)
    pred_class = registry.landslide_model.predict(X_scaled)[0]
    raw_risk_level = registry.landslide_label_encoder.inverse_transform([pred_class])[0]
    confidence = float(registry.landslide_model.predict_proba(X_scaled)[0].max())

    TIERS = ["Low", "Moderate", "High", "Critical"]
    seasonal = seasonal_rainfall.get_seasonal_flood_factor()
    factor = seasonal["factor"]
    result = {"risk_level": raw_risk_level, "confidence": confidence}
    if factor < 1.0 and raw_risk_level in TIERS:
        raw_idx = TIERS.index(raw_risk_level)
        calibrated_idx = round(raw_idx * factor)
        calibrated_risk_level = TIERS[calibrated_idx]
        if calibrated_risk_level != raw_risk_level:
            result["risk_level"] = calibrated_risk_level
            result["raw_model_risk_level"] = raw_risk_level
            result["rainfall_calibration_applied"] = True
            result["calibration_note"] = (
                f"Terrain-based tier ({raw_risk_level}) scaled by a seasonal rainfall factor of "
                f"{factor:.2f}, reused from the flood calibration (no dedicated multi-year "
                f"landslide dataset available) -- {seasonal['note']}"
            )
    return result


def predict_damage(pre_image_tensor, post_image_tensor):
    """Runs the Siamese CNN on a pre/post image pair. Requires damage_model.pt to be present."""
    if not registry.damage_model_available:
        raise RuntimeError(
            "Damage assessment model not loaded -- add damage_model.pt to backend/ml_models/ "
            "(exported from Notebook 03) to enable this endpoint."
        )
    import torch
    DAMAGE_CLASSES = ["no-damage", "minor-damage", "major-damage", "destroyed"]
    with torch.no_grad():
        output = registry.damage_model(pre_image_tensor.unsqueeze(0), post_image_tensor.unsqueeze(0))
        probs = torch.softmax(output, dim=1)[0]
        pred_idx = int(probs.argmax())
    return {"damage_class": DAMAGE_CLASSES[pred_idx], "confidence": float(probs[pred_idx])}


def get_accuracy_summary():
    """Read-only -- returns the honest accuracy figures saved by the Colab notebooks.
    Never invents or rounds these numbers."""
    return {
        "flood": registry.flood_accuracy,
        "landslide": registry.landslide_accuracy,
        "damage_assessment": registry.damage_accuracy,
    }