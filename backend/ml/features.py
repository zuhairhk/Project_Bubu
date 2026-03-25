"""
Features: 6-mood classifier with Spotify audio features.

Feature vector (10 features):
  [0]  heart_rate             — raw BPM
  [1]  hr_normalized          — deviation from resting baseline
  [2]  steps_last_minute      — activity level
  [3]  location_variance      — GPS jitter
  [4]  hour_of_day            — time context
  [5]  is_rush_hour           — binary rush hour flag
  [6]  spotify_energy         — track energy (0=calm, 1=intense). 0.5 if no Spotify
  [7]  spotify_valence        — track positivity (0=sad, 1=happy). 0.5 if no Spotify
  [8]  spotify_tempo_norm     — track BPM normalized to 0-1 range (0=60bpm, 1=200bpm)
  [9]  has_spotify            — binary: 1 if Spotify data present

Mood → label encoding:
  happy    = 0
  neutral  = 1
  stressed = 2
  angry    = 3
  sad      = 4
  sleepy   = 5
"""
import numpy as np
from datetime import datetime

RESTING_HR_BASELINE = 70

MOOD_TO_INT = {
    "happy":    0,
    "neutral":  1,
    "stressed": 2,
    "angry":    3,
    "sad":      4,
    "sleepy":   5,
}

INT_TO_MOOD = {v: k for k, v in MOOD_TO_INT.items()}

FEATURE_NAMES = [
    "heart_rate",
    "hr_normalized",
    "steps_last_minute",
    "location_variance",
    "hour_of_day",
    "is_rush_hour",
    "spotify_energy",
    "spotify_valence",
    "spotify_tempo_norm",
    "has_spotify",
]


def extract_features(snapshot: dict) -> np.ndarray:
    """Convert a single snapshot dict into a 10-element feature vector."""
    hr    = float(snapshot.get("heart_rate") or RESTING_HR_BASELINE)
    steps = float(snapshot.get("steps_last_minute") or 0)
    locv  = float(snapshot.get("location_variance") or 0.0)

    # Timestamp features
    ts = snapshot.get("timestamp")
    if isinstance(ts, str):
        try:
            ts = datetime.fromisoformat(ts)
        except ValueError:
            ts = datetime.utcnow()
    elif not isinstance(ts, datetime):
        ts = datetime.utcnow()

    hour     = float(ts.hour)
    is_rush  = 1.0 if (7 <= ts.hour <= 9) or (16 <= ts.hour <= 19) else 0.0
    hr_norm  = (hr - RESTING_HR_BASELINE) / RESTING_HR_BASELINE

    # Spotify features — use neutral defaults if not present
    spotify = snapshot.get("spotify") or {}
    if isinstance(spotify, object) and hasattr(spotify, "__dict__"):
        spotify = spotify.__dict__

    has_spotify      = 1.0 if spotify and any(spotify.values()) else 0.0
    spotify_energy   = float(spotify.get("energy")   or 0.5)
    spotify_valence  = float(spotify.get("valence")  or 0.5)
    raw_tempo        = float(spotify.get("tempo")    or 120.0)
    # Normalize tempo: 60bpm→0.0, 200bpm→1.0
    spotify_tempo_norm = max(0.0, min(1.0, (raw_tempo - 60.0) / 140.0))

    return np.array([
        hr, hr_norm, steps, locv, hour, is_rush,
        spotify_energy, spotify_valence, spotify_tempo_norm, has_spotify,
    ], dtype=np.float32)


def build_feature_matrix(snapshots: list[dict]) -> tuple[np.ndarray, np.ndarray]:
    """Build X and y from labeled snapshots. Skips unlabeled ones."""
    X, y = [], []
    for snap in snapshots:
        lbl = snap.get("label")
        if lbl not in MOOD_TO_INT:
            continue
        X.append(extract_features(snap))
        y.append(MOOD_TO_INT[lbl])

    if not X:
        return np.empty((0, len(FEATURE_NAMES))), np.empty((0,))

    return np.array(X, dtype=np.float32), np.array(y, dtype=np.int32)