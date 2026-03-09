"""
Inference — predicts one of 6 moods from a health + Spotify snapshot.
"""
from datetime import datetime
from ml.models.training.train import load_model
from ml.features import extract_features, INT_TO_MOOD
from core.models import MoodPrediction, MOOD_EMOJI


def predict_mood(snapshot: dict) -> MoodPrediction:
    """
    Predict mood from a health snapshot dict.
    Returns mood label, emoji, and confidence.
    """
    pipeline = load_model()
    features = extract_features(snapshot).reshape(1, -1)

    label_int = int(pipeline.predict(features)[0])
    proba     = pipeline.predict_proba(features)[0]

    mood       = INT_TO_MOOD[label_int]
    confidence = round(float(max(proba)), 3)
    emoji      = MOOD_EMOJI[mood]

    # Build Spotify context string if available
    spotify = snapshot.get("spotify") or {}
    if isinstance(spotify, object) and hasattr(spotify, "track_name"):
        track  = getattr(spotify, "track_name", None)
        artist = getattr(spotify, "artist_name", None)
    else:
        track  = spotify.get("track_name")
        artist = spotify.get("artist_name")

    spotify_context = None
    if track:
        spotify_context = f"Listening to: {track}"
        if artist:
            spotify_context += f" by {artist}"

    return MoodPrediction(
        user_id         = snapshot.get("user_id", "unknown"),
        mood            = mood,
        emoji           = emoji,
        confidence      = confidence,
        heart_rate      = int(snapshot.get("heart_rate", 0)),
        timestamp       = datetime.utcnow(),
        spotify_context = spotify_context,
    )