"""
Shared Pydantic schemas — updated for 6-mood classification + Spotify context.
"""
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, Literal

# 6 supported moods with emoji mapping
MOOD_EMOJI = {
    "happy":    "😊",
    "neutral":  "😐",
    "stressed": "😤",
    "angry":    "😠",
    "sad":      "😢",
    "sleepy":   "😴",
}

MoodLabel = Literal["happy", "neutral", "stressed", "angry", "sad", "sleepy"]


class SpotifyContext(BaseModel):
    """Currently playing track info from Spotify — sent alongside health data."""
    track_name:   Optional[str]   = None
    artist_name:  Optional[str]   = None
    energy:       Optional[float] = Field(default=None, ge=0.0, le=1.0,
                                          description="Spotify audio feature: 0=calm, 1=intense")
    valence:      Optional[float] = Field(default=None, ge=0.0, le=1.0,
                                          description="Spotify audio feature: 0=negative, 1=positive")
    tempo:        Optional[float] = Field(default=None, description="BPM of the track")
    danceability: Optional[float] = Field(default=None, ge=0.0, le=1.0)


class HealthSnapshot(BaseModel):
    """
    A single health + location + Spotify reading from the mobile app.
    POST every 30–60 seconds during an active commute.
    Include `label` when the user taps their current mood in the app.
    """
    user_id: str

    # Biometrics
    heart_rate:          int            = Field(..., ge=30, le=220)
    steps_last_minute:   int            = Field(default=0, ge=0)

    # Location
    latitude:            Optional[float] = None
    longitude:           Optional[float] = None
    location_variance:   Optional[float] = None

    # Spotify (optional — only present if user has Spotify connected)
    spotify:             Optional[SpotifyContext] = None

    timestamp:           datetime        = Field(default_factory=datetime.utcnow)

    # Ground-truth mood label (set when user taps mood button in app)
    label:               Optional[MoodLabel] = None

    model_config = {"json_schema_extra": {"examples": [{
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
        },
        "label": "stressed"
    }]}}


class MoodPrediction(BaseModel):
    """Response from /api/ml/predict"""
    user_id:    str
    mood:       MoodLabel
    emoji:      str
    confidence: float = Field(..., ge=0.0, le=1.0)
    heart_rate: int
    timestamp:  datetime
    spotify_context: Optional[str] = None  # e.g. "Listening to: Lose Yourself"


class TrainRequest(BaseModel):
    min_samples: int = Field(default=10)