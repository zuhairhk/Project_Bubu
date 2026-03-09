"""
ML training pipeline — 6-mood classifier with Spotify context.
"""
import os
import json
import numpy as np
import joblib
from datetime import datetime
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.model_selection import cross_val_score, StratifiedKFold

from ml.features import build_feature_matrix, FEATURE_NAMES, INT_TO_MOOD
from db.store import get_labeled_snapshots
from core.config import MODEL_DIR

MODEL_FILE    = os.path.join(MODEL_DIR, "mood_classifier.pkl")
METADATA_FILE = os.path.join(MODEL_DIR, "model_metadata.json")


def _make_synthetic_data() -> list[dict]:
    """
    600 synthetic samples covering all 6 moods with realistic
    biometric + Spotify audio feature combinations.

    Mood profiles:
      happy    — moderate HR, active steps, high valence, high energy music
      neutral  — resting HR, low steps, mid valence, mid energy music
      stressed — elevated HR, rush hour, low/high steps, intense low-valence music
      angry    — very high HR, high steps, very low valence, very high energy music
      sad      — low HR, few steps, low valence, low energy music
      sleepy   — very low HR, almost no steps, low energy slow music
    """
    rng = np.random.default_rng(seed=42)
    samples = []

    def ts(hour_min, hour_max, day=1):
        h = int(rng.integers(hour_min, hour_max))
        m = int(rng.integers(0, 59))
        return datetime(2026, 3, day, h, m, 0)

    # ── HAPPY (100 samples) ──────────────────────────────────────
    for i in range(100):
        samples.append({
            "heart_rate":        int(rng.integers(72, 95)),
            "steps_last_minute": int(rng.integers(30, 70)),
            "location_variance": float(rng.uniform(0.00001, 0.00008)),
            "timestamp":         ts(9, 18, i % 9 + 1),
            "spotify": {
                "energy":       float(rng.uniform(0.65, 0.95)),
                "valence":      float(rng.uniform(0.70, 1.00)),
                "tempo":        float(rng.uniform(110, 145)),
                "danceability": float(rng.uniform(0.60, 0.90)),
            },
            "label": "happy",
        })

    # ── NEUTRAL (100 samples) ────────────────────────────────────
    for i in range(100):
        samples.append({
            "heart_rate":        int(rng.integers(62, 80)),
            "steps_last_minute": int(rng.integers(5, 30)),
            "location_variance": float(rng.uniform(0.000001, 0.00003)),
            "timestamp":         ts(10, 19, i % 9 + 1),
            "spotify": {
                "energy":       float(rng.uniform(0.35, 0.60)),
                "valence":      float(rng.uniform(0.40, 0.65)),
                "tempo":        float(rng.uniform(90, 125)),
                "danceability": float(rng.uniform(0.40, 0.65)),
            },
            "label": "neutral",
        })

    # ── STRESSED (100 samples) ───────────────────────────────────
    for i in range(100):
        rushing = i % 2 == 0
        samples.append({
            "heart_rate":        int(rng.integers(100, 145) if rushing else rng.integers(90, 120)),
            "steps_last_minute": int(rng.integers(80, 150) if rushing else rng.integers(0, 15)),
            "location_variance": float(rng.uniform(0.0005, 0.002) if rushing else rng.uniform(0.0002, 0.0009)),
            "timestamp":         ts(7, 9, i % 9 + 1),
            "spotify": {
                "energy":       float(rng.uniform(0.70, 1.00)),
                "valence":      float(rng.uniform(0.10, 0.40)),
                "tempo":        float(rng.uniform(140, 200)),
                "danceability": float(rng.uniform(0.30, 0.60)),
            },
            "label": "stressed",
        })

    # ── ANGRY (100 samples) ──────────────────────────────────────
    for i in range(100):
        samples.append({
            "heart_rate":        int(rng.integers(110, 155)),
            "steps_last_minute": int(rng.integers(50, 130)),
            "location_variance": float(rng.uniform(0.0003, 0.0015)),
            "timestamp":         ts(7, 20, i % 9 + 1),
            "spotify": {
                "energy":       float(rng.uniform(0.85, 1.00)),
                "valence":      float(rng.uniform(0.00, 0.20)),
                "tempo":        float(rng.uniform(150, 200)),
                "danceability": float(rng.uniform(0.20, 0.50)),
            },
            "label": "angry",
        })

    # ── SAD (100 samples) ────────────────────────────────────────
    for i in range(100):
        samples.append({
            "heart_rate":        int(rng.integers(55, 75)),
            "steps_last_minute": int(rng.integers(0, 20)),
            "location_variance": float(rng.uniform(0.000001, 0.00005)),
            "timestamp":         ts(8, 22, i % 9 + 1),
            "spotify": {
                "energy":       float(rng.uniform(0.10, 0.40)),
                "valence":      float(rng.uniform(0.00, 0.30)),
                "tempo":        float(rng.uniform(60, 100)),
                "danceability": float(rng.uniform(0.10, 0.40)),
            },
            "label": "sad",
        })

    # ── SLEEPY (100 samples) ─────────────────────────────────────
    for i in range(100):
        samples.append({
            "heart_rate":        int(rng.integers(48, 65)),
            "steps_last_minute": int(rng.integers(0, 8)),
            "location_variance": float(rng.uniform(0.0, 0.000005)),
            "timestamp":         ts(6, 10, i % 9 + 1),   # early morning commute
            "spotify": {
                "energy":       float(rng.uniform(0.05, 0.30)),
                "valence":      float(rng.uniform(0.20, 0.50)),
                "tempo":        float(rng.uniform(60, 90)),
                "danceability": float(rng.uniform(0.10, 0.35)),
            },
            "label": "sleepy",
        })

    return samples


def train_model(min_samples: int = 10) -> dict:
    """Train the 6-mood classifier and save to disk."""
    real_data      = get_labeled_snapshots()
    synthetic_data = _make_synthetic_data()
    all_data       = synthetic_data + real_data

    X, y = build_feature_matrix(all_data)

    if len(X) < min_samples:
        raise ValueError(f"Need at least {min_samples} samples, got {len(X)}")

    # Count per mood
    mood_counts = {}
    for label_int in y:
        mood = INT_TO_MOOD[int(label_int)]
        mood_counts[mood] = mood_counts.get(mood, 0) + 1

    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", RandomForestClassifier(
            n_estimators=300,
            max_depth=8,
            min_samples_leaf=2,
            class_weight="balanced",
            random_state=42,
        )),
    ])

    # Need at least 2 samples per class for stratified CV
    min_class_count = min(mood_counts.values()) if mood_counts else 1
    n_splits = max(2, min(5, min_class_count))
    cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
    cv_scores = cross_val_score(pipeline, X, y, cv=cv, scoring="f1_weighted")

    pipeline.fit(X, y)
    joblib.dump(pipeline, MODEL_FILE)

    metadata = {
        "trained_at":        datetime.utcnow().isoformat(),
        "total_samples":     int(len(X)),
        "real_samples":      len(real_data),
        "synthetic_samples": len(synthetic_data),
        "mood_counts":       mood_counts,
        "cv_f1_weighted_mean": round(float(cv_scores.mean()), 4),
        "cv_f1_weighted_std":  round(float(cv_scores.std()), 4),
        "features":          FEATURE_NAMES,
        "moods_supported":   list(INT_TO_MOOD.values()),
        "model_path":        MODEL_FILE,
    }

    with open(METADATA_FILE, "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"[ML] Trained 6-mood classifier — {len(X)} samples | F1={metadata['cv_f1_weighted_mean']:.3f}")
    return metadata


def load_model():
    if not os.path.exists(MODEL_FILE):
        print("[ML] No model — training on synthetic data...")
        train_model(min_samples=1)
    return joblib.load(MODEL_FILE)


if __name__ == "__main__":
    result = train_model()
    print(json.dumps(result, indent=2))