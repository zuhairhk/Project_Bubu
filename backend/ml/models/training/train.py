"""
ML training pipeline — stress classifier.

Run manually to retrain from the command line:
    cd backend
    python -m ml.training.train

Or call train_model() from the /api/ml/train endpoint.

Strategy:
  - Uses a Random Forest with StandardScaler — fast, interpretable, handles small datasets well.
  - Synthetic seed data ensures the model works before any real users contribute labels.
  - Real user data is appended last; when dataset grows, synthetic data becomes less influential.
  - class_weight="balanced" prevents the model from always predicting the majority class.
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

from ml.features import build_feature_matrix, FEATURE_NAMES
from db.store import get_labeled_snapshots
from core.config import MODEL_DIR

MODEL_FILE    = os.path.join(MODEL_DIR, "stress_classifier.pkl")
METADATA_FILE = os.path.join(MODEL_DIR, "model_metadata.json")


# ──────────────────────────────────────────────────────────────
# Synthetic seed data
# ──────────────────────────────────────────────────────────────

def _make_synthetic_data() -> list[dict]:
    """
    240 synthetic samples based on physiological research:
      - Stressed:     HR 95–140, low steps, higher location variance, rush hour
      - Not stressed: HR 58–85, moderate steps, low variance, off-peak
    """
    rng = np.random.default_rng(seed=42)
    samples = []

    # STRESSED — sitting on delayed train, heart racing
    for _ in range(60):
        samples.append({
            "heart_rate":        int(rng.integers(95, 125)),
            "steps_last_minute": int(rng.integers(0, 20)),
            "location_variance": float(rng.uniform(0.0001, 0.0008)),
            "timestamp":         datetime(2024, 3, 1, int(rng.integers(7, 10)), 0),
            "label":             "stressed",
        })

    # STRESSED — rushing to catch train
    for _ in range(60):
        samples.append({
            "heart_rate":        int(rng.integers(105, 145)),
            "steps_last_minute": int(rng.integers(90, 150)),
            "location_variance": float(rng.uniform(0.0005, 0.002)),
            "timestamp":         datetime(2024, 3, 1, int(rng.integers(7, 9)), 0),
            "label":             "stressed",
        })

    # NOT STRESSED — comfortable seated commute
    for _ in range(80):
        samples.append({
            "heart_rate":        int(rng.integers(58, 82)),
            "steps_last_minute": int(rng.integers(0, 15)),
            "location_variance": float(rng.uniform(0.0, 0.00004)),
            "timestamp":         datetime(2024, 3, 1, int(rng.integers(8, 18)), 0),
            "label":             "not_stressed",
        })

    # NOT STRESSED — walking at normal pace, off-peak
    for _ in range(40):
        samples.append({
            "heart_rate":        int(rng.integers(65, 90)),
            "steps_last_minute": int(rng.integers(30, 75)),
            "location_variance": float(rng.uniform(0.00001, 0.00008)),
            "timestamp":         datetime(2024, 3, 1, int(rng.integers(10, 20)), 0),
            "label":             "not_stressed",
        })

    return samples


# ──────────────────────────────────────────────────────────────
# Training
# ──────────────────────────────────────────────────────────────

def train_model(min_samples: int = 20) -> dict:
    """
    Train the stress classifier and persist it.

    Steps:
      1. Load labeled snapshots from DB + synthetic seed data
      2. Build feature matrix
      3. Stratified k-fold cross-validation (reports F1)
      4. Final fit on all data
      5. Save pipeline (.pkl) and metadata (.json)

    Raises ValueError if total samples < min_samples.
    Returns metadata dict.
    """
    real_data      = get_labeled_snapshots()
    synthetic_data = _make_synthetic_data()
    all_data       = synthetic_data + real_data  # real data at the end

    X, y = build_feature_matrix(all_data)

    if len(X) < min_samples:
        raise ValueError(
            f"Need at least {min_samples} labeled samples, got {len(X)}"
        )

    n_stressed     = int(y.sum())
    n_not_stressed = int(len(y) - n_stressed)

    # Pipeline: scale features → Random Forest
    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", RandomForestClassifier(
            n_estimators=200,
            max_depth=6,
            min_samples_leaf=3,
            class_weight="balanced",
            random_state=42,
        )),
    ])

    # Cross-validate — use StratifiedKFold to preserve class balance per fold
    n_splits  = min(5, n_stressed, n_not_stressed)  # can't have more folds than minority class
    cv        = StratifiedKFold(n_splits=max(2, n_splits), shuffle=True, random_state=42)
    cv_scores = cross_val_score(pipeline, X, y, cv=cv, scoring="f1")

    pipeline.fit(X, y)
    joblib.dump(pipeline, MODEL_FILE)

    metadata = {
        "trained_at":        datetime.utcnow().isoformat(),
        "total_samples":     int(len(X)),
        "real_samples":      len(real_data),
        "synthetic_samples": len(synthetic_data),
        "n_stressed":        n_stressed,
        "n_not_stressed":    n_not_stressed,
        "cv_f1_mean":        round(float(cv_scores.mean()), 4),
        "cv_f1_std":         round(float(cv_scores.std()), 4),
        "features":          FEATURE_NAMES,
        "model_path":        MODEL_FILE,
    }

    with open(METADATA_FILE, "w") as f:
        json.dump(metadata, f, indent=2)

    print(
        f"[ML] Training complete — "
        f"{len(X)} samples | "
        f"F1 = {metadata['cv_f1_mean']:.3f} ± {metadata['cv_f1_std']:.3f}"
    )
    return metadata


def load_model():
    """
    Load the trained pipeline from disk.
    Auto-trains on synthetic data if no saved model exists yet.
    """
    if not os.path.exists(MODEL_FILE):
        print("[ML] No model found — running initial training with synthetic seed data...")
        train_model(min_samples=1)
    return joblib.load(MODEL_FILE)


if __name__ == "__main__":
    result = train_model()
    print(json.dumps(result, indent=2))