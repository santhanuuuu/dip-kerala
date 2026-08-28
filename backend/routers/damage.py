import io
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from PIL import Image

from db.session import get_db
from db.models import DamageAssessment, Place
from routers.auth import get_current_user_required
from services import inference

router = APIRouter(prefix="/api/damage-assessment", tags=["damage"])

IMG_SIZE = (384, 384)  # matches the resolution used in Notebook 03's final training run


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

    pre_tensor = _preprocess_image(pre_bytes)
    post_tensor = _preprocess_image(post_bytes)

    result = inference.predict_damage(pre_tensor, post_tensor)

    # NOTE: this example stores images in-memory only for the response; a real deployment
    # should upload pre_bytes/post_bytes to S3/Cloud Storage and store the resulting URLs.
    # Left as a TODO since bucket/storage choice is a deployment decision, not an ML one.
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
