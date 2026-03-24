"""
ML routes — mood prediction, training, and model info.
"""
from fastapi import APIRouter, HTTPException
from datetime import datetime
from core.models import HealthSnapshot, MoodPrediction, TrainRequest, MOOD_EMOJI

router = APIRouter(prefix="/api/ml", tags=["ml"])

# Mood → Spotify audio seed parameters
# These mirror the MOOD_SEEDS in spotifyApi.ts so backend and frontend agree
MOOD_PLAYLIST_SEEDS = {
    "happy": {
        "seed_genres":    ["pop", "dance", "happy"],
        "target_energy":  0.80,
        "target_valence": 0.90,
        "target_tempo":   120,
        "min_energy":     0.60,
        "min_valence":    0.70,
        "description":    "Upbeat, positive energy tracks to match your great mood",
    },
    "neutral": {
        "seed_genres":    ["indie", "chill", "pop"],
        "target_energy":  0.45,
        "target_valence": 0.50,
        "target_tempo":   100,
        "description":    "Easy-going tracks for a balanced, relaxed commute",
    },
    "stressed": {
        "seed_genres":    ["ambient", "chill", "study"],
        "target_energy":  0.30,
        "target_valence": 0.55,
        "target_tempo":   80,
        "max_energy":     0.50,
        "description":    "Calming, low-energy tracks to help you decompress",
    },
    "angry": {
        "seed_genres":    ["chill", "acoustic", "soul"],
        "target_energy":  0.35,
        "target_valence": 0.60,
        "target_tempo":   85,
        "max_energy":     0.55,
        "description":    "Soothing tracks to bring your energy back down",
    },
    "sad": {
        "seed_genres":    ["sad", "indie", "singer-songwriter"],
        "target_energy":  0.25,
        "target_valence": 0.25,
        "target_tempo":   75,
        "description":    "Gentle, melancholic tracks that match your mood",
    },
    "sleepy": {
        "seed_genres":    ["sleep", "ambient", "classical"],
        "target_energy":  0.10,
        "target_valence": 0.35,
        "target_tempo":   65,
        "max_energy":     0.25,
        "description":    "Soft, slow tracks to ease you into the day",
    },
}


@router.post("/predict", response_model=MoodPrediction)
def predict(snapshot: HealthSnapshot):
    """
    Predict mood from a health snapshot.
    Spotify audio features are optional — the model works on HR + steps alone,
    but confidence will be lower without them.
    """
    from ml.inference import predict_mood
    try:
        return predict_mood(snapshot.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/train")
def train(req: TrainRequest):
    """Retrain the mood classifier."""
    from ml.models.training.train import train_model
    try:
        return train_model(min_samples=req.min_samples)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/model/info")
def model_info():
    """Return metadata about the currently loaded model."""
    import os, json
    from core.config import MODEL_DIR
    meta_path = os.path.join(MODEL_DIR, "model_metadata.json")
    if not os.path.exists(meta_path):
        raise HTTPException(status_code=404, detail="No model trained yet")
    with open(meta_path) as f:
        return json.load(f)


@router.get("/playlist-seeds/{mood}")
def playlist_seeds(mood: str):
    """
    Return Spotify recommendation parameters for a given mood.
    The mobile app can use these directly with the Spotify /recommendations API.
    """
    if mood not in MOOD_PLAYLIST_SEEDS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown mood '{mood}'. Valid: {list(MOOD_PLAYLIST_SEEDS.keys())}",
        )
    return {
        "mood":    mood,
        "emoji":   MOOD_EMOJI.get(mood, "🎵"),
        "seeds":   MOOD_PLAYLIST_SEEDS[mood],
    }


@router.get("/playlist-seeds")
def all_playlist_seeds():
    """Return Spotify seed parameters for all 6 moods."""
    return {
        mood: {
            "emoji": MOOD_EMOJI.get(mood, "🎵"),
            **seeds,
        }
        for mood, seeds in MOOD_PLAYLIST_SEEDS.items()
    }