"""
ML routes.

POST /api/ml/predict     — run stress inference on a health snapshot
POST /api/ml/train       — retrain the model (admin / dev use)
GET  /api/ml/model/info  — current model metadata + DB stats
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
    Predict stress level from a health snapshot.

    - Saves the snapshot to the DB (without a label — for unlabeled inference logs).
    - Returns mood ("stressed" / "not_stressed") and confidence score.
    - On first call, auto-trains from synthetic seed data if no model exists.

    Example body:
    ```json
    {
      "user_id": "user_abc",
      "heart_rate": 115,
      "steps_last_minute": 5,
      "location_variance": 0.00038
    }
    ```
    """
    from ml.inference import predict_stress

    record = data.model_dump()
    save_snapshot(record)

    try:
        prediction = predict_stress(record)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction error: {str(e)}")

    return prediction


@router.post("/train")
def retrain(req: TrainRequest = TrainRequest()):
    """
    Retrain the stress classifier.

    - Merges all labeled snapshots from the DB with synthetic seed data.
    - Runs 5-fold cross-validation and reports F1 score.
    - Saves the model to ml/models/stress_classifier.pkl.
    - Recommended: call after collecting 20+ real labeled samples.
    """
    from ml.models.training.train import train_model

    labeled = count_labeled()
    try:
        metadata = train_model(min_samples=req.min_samples)
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=f"{str(e)}. Currently have {labeled} labeled samples in DB."
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Training failed: {str(e)}")

    return {"status": "trained", **metadata}


@router.get("/model/info")
def model_info():
    """
    Return metadata about the currently loaded model.
    Includes: training date, sample counts, CV F1 score, feature list.
    """
    if not os.path.exists(METADATA_FILE):
        return {
            "status": "no_model_trained",
            "message": "POST /api/ml/train to train the model, or POST /api/ml/predict to auto-train.",
            "labeled_samples_in_db": count_labeled(),
        }

    with open(METADATA_FILE) as f:
        meta = json.load(f)

    meta["labeled_samples_in_db"] = count_labeled()
    return meta