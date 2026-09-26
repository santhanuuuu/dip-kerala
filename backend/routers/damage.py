import io
import traceback
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from PIL import Image

from db.session import get_db
from db.models import DamageAssessment, Place
from routers.auth import get_current_user_required
from services import inference

router = APIRouter(prefix="/api/damage-assessment", tags=["damage"])

IMG_SIZE = (384, 384)  # matches the resolution used in Notebook 03's final training run
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB


def _looks_like_satellite_image(img: Image.Image) -> bool:
    """Heuristic, not a trained classifier -- we don't have a labeled 'satellite vs not'
    dataset to train one. Three independent checks, any one of which rejects the image:

    1. Skin tone: satellite/aerial imagery essentially never contains a face/skin filling
       much of the frame.
    2. Sky: a nadir (straight-down) satellite shot has no "up" -- visible sky is a
       ground-level-photo signature.
    3. Flat-row texture: satellite imagery has continuous natural texture (vegetation,
       roads, buildings, water) almost everywhere. Screenshots, UI, code editors, and most
       non-aerial digital images have large uniform-colored bands instead (e.g. a code
       editor's solid dark background, a browser's title bar). This check catches exactly
       that case -- it was the gap that let a VS Code screenshot through previously.
    """
    thumb = img.convert("RGB").resize((64, 64))
    arr = np.asarray(thumb).astype(np.int16)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]

    max_c = np.maximum(np.maximum(r, g), b)
    min_c = np.minimum(np.minimum(r, g), b)
    skin_mask = (
        (r > 95) & (g > 40) & (b > 20)
        & ((max_c - min_c) > 15)
        & (np.abs(r - g) > 15)
        & (r > g) & (r > b)
    )
    skin_fraction = float(skin_mask.mean())

    top_band = arr[:13, :, :]
    tr, tg, tb = top_band[:, :, 0], top_band[:, :, 1], top_band[:, :, 2]
    brightness = (tr.astype(np.float32) + tg + tb) / 3
    t_max = np.maximum(np.maximum(tr, tg), tb)
    t_min = np.minimum(np.minimum(tr, tg), tb)
    sky_mask = (tb >= tr) & (brightness > 140) & ((t_max - t_min) < 40)
    sky_fraction = float(sky_mask.mean())

    gray = np.asarray(img.convert("L").resize((128, 128))).astype(np.float32)
    overall_std = float(gray.std())
    row_std = gray.std(axis=1)
    flat_row_fraction = float((row_std < 10).mean())

    if skin_fraction > 0.12:
        return False
    if sky_fraction > 0.35:
        return False
    if overall_std < 8:  # near solid-color image
        return False
    if flat_row_fraction > 0.25:  # large uniform bands -- UI/screenshot/vector graphic
        return False
    return True


def _preprocess_image(file_bytes: bytes):
    import torchvision.transforms as T
    transform = T.Compose([
        T.Resize(IMG_SIZE),
        T.ToTensor(),
        T.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])
    img = Image.open(io.BytesIO(file_bytes)).convert("RGB")
    return transform(img)


@router.post("")
async def run_damage_assessment(
    place_id: int = Form(...),
    pre_image: UploadFile = File(...),
    post_image: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(get_current_user_required),
):
    """Manual, explicit workflow -- this is NOT triggered automatically by a place search.
    Requires an actual pre/post satellite image pair supplied by the user."""
    if not inference.registry.damage_model_available:
        raise HTTPException(
            status_code=503,
            detail="Damage assessment model not loaded. Ensure damage_model.pt is in backend/ml_models/.",
        )

    place = db.query(Place).filter(Place.id == place_id).first()
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")

    pre_bytes = await pre_image.read()
    post_bytes = await post_image.read()

    if len(pre_bytes) > MAX_UPLOAD_BYTES or len(post_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Each image must be under 10 MB.")

    try:
        pre_pil = Image.open(io.BytesIO(pre_bytes))
        pre_pil.load()
        post_pil = Image.open(io.BytesIO(post_bytes))
        post_pil.load()
    except Exception:
        raise HTTPException(status_code=422, detail="One of the uploaded files isn't a readable image.")

    if not _looks_like_satellite_image(pre_pil) or not _looks_like_satellite_image(post_pil):
        raise HTTPException(
            status_code=422,
            detail="This doesn't look like a satellite/aerial image. Please upload a top-down "
                   "pre-event and post-event image pair for this location.",
        )

    try:
        pre_tensor = _preprocess_image(pre_bytes)
        post_tensor = _preprocess_image(post_bytes)
        result = inference.predict_damage(pre_tensor, post_tensor)
    except Exception:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail="Something went wrong while running the damage assessment. Please try again.",
        )

    record = DamageAssessment(
        place_id=place_id,
        submitted_by=user.id,
        pre_image_url="TODO: upload to storage and put URL here",
        post_image_url="TODO: upload to storage and put URL here",
        damage_class=result["damage_class"],
        confidence=result["confidence"],
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    accuracy = inference.get_accuracy_summary()["damage_assessment"]

    return {
        "id": record.id,
        "place": place.name,
        "damage_class": result["damage_class"],
        "confidence": result["confidence"],
        "model_overall_accuracy": accuracy["overall_accuracy"] if accuracy else None,
        "note": (
            "Tile-level classification, not full building-level segmentation. "
            "'minor-damage' is a known weak class -- see model documentation."
        ),
    }


@router.get("/{place_id}/history")
def get_damage_history(place_id: int, db: Session = Depends(get_db)):
    """Public -- anyone can view past assessments for a place, no login needed."""
    records = db.query(DamageAssessment).filter(DamageAssessment.place_id == place_id).order_by(DamageAssessment.created_at.desc()).all()
    return {
        "results": [
            {"id": r.id, "damage_class": r.damage_class, "confidence": r.confidence,
             "event_date": r.event_date, "created_at": r.created_at}
            for r in records
        ]
    }
