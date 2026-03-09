"""
ML routes — 6-mood prediction, training, model info.
"""
import os
import json
from fastapi import APIRouter, HTTPException
from core.models import HealthSnapshot, MoodPrediction, TrainRequest
from core.config import MODEL_DIR
from db.store import save_snapshot, count_labeled

router = APIRouter(prefix="/api/ml", tags=["ml"])
METADATA_FILE = os.path.join(MODEL_DIR, "model_metadata.json")


@router.post("/predict", response_model=MoodPrediction)
def predict(data: HealthSnapshot):
    """
    Predict user mood from health + Spotify snapshot.

    Returns one of: happy 😊 | neutral 😐 | stressed 😤 | angry 😠 | sad 😢 | sleepy 😴

    Example with Spotify:
    ```json
    {
      "user_id": "dev_user",
      "heart_rate": 112,
      "steps_last_minute": 8,
      "location_variance": 0.00043,
      "spotify": {
        "track_name": "Lose Yourself",
        "artist_name": "Eminem",
        "energy": 0.95,
        "valence": 0.31,
        "tempo": 171.0
      }
    }
    ```
    """
    from ml.inference import predict_mood

    record = data.model_dump()
    save_snapshot(record)

    try:
        return predict_mood(record)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction error: {str(e)}")


@router.post("/train")
def retrain(req: TrainRequest = TrainRequest()):
    """Retrain the mood classifier on all labeled DB snapshots + synthetic data."""
    from ml.models.training.train import train_model

    try:
        metadata = train_model(min_samples=req.min_samples)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Training failed: {str(e)}")

    return {"status": "trained", **metadata}


@router.get("/model/info")
def model_info():
    """Return metadata about the current model."""
    if not os.path.exists(METADATA_FILE):
        return {
            "status":                "no_model_trained",
            "labeled_samples_in_db": count_labeled(),
            "moods_supported":       ["happy", "neutral", "stressed", "angry", "sad", "sleepy"],
        }
    with open(METADATA_FILE) as f:
        meta = json.load(f)
    meta["labeled_samples_in_db"] = count_labeled()
    return meta