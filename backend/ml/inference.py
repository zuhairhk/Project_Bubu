"""
ML inference — loads trained model and predicts stress from a snapshot dict.
"""
from datetime import datetime
from ml.models.training.train import load_model
from ml.features import extract_features
from core.models import MoodPrediction


def predict_stress(snapshot: dict) -> MoodPrediction:
    """
    Run stress classification on a single health snapshot.

    Returns a MoodPrediction with:
      - mood:       "stressed" or "not_stressed"
      - confidence: probability of the predicted class (0.0 – 1.0)
    """
    pipeline = load_model()
    features = extract_features(snapshot).reshape(1, -1)

    label_idx = int(pipeline.predict(features)[0])
    proba     = pipeline.predict_proba(features)[0]

    return MoodPrediction(
        user_id    = snapshot.get("user_id", "unknown"),
        mood       = "stressed" if label_idx == 1 else "not_stressed",
        confidence = round(float(max(proba)), 3),
        heart_rate = int(snapshot.get("heart_rate", 0)),
        timestamp  = datetime.utcnow(),
    )