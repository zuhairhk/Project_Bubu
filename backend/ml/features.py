"""
Feature engineering — converts raw health snapshots into ML-ready feature vectors.

Raw inputs (HealthSnapshot fields):
  heart_rate, steps_last_minute, location_variance, timestamp

Output: numpy array of shape (6,) — one row per snapshot

Why these features?
  - heart_rate:       primary physiological stress indicator
  - hr_normalized:    HR relative to a resting baseline — captures deviation, not absolute value
  - steps_last_minute:low steps + high HR = passive stress (crowded train, delays)
                      high steps + high HR = physical rush (running for train)
  - location_variance:erratic GPS = rushing around; stable GPS = seated on transit
  - hour_of_day:      time context — 8am vs 2pm feel very different
  - is_rush_hour:     binary flag — rush hour correlates with commute stress
"""
import numpy as np
from datetime import datetime

RESTING_HR_BASELINE = 70   # bpm — typical adult resting HR used for normalization

FEATURE_NAMES = [
    "heart_rate",
    "hr_normalized",
    "steps_last_minute",
    "location_variance",
    "hour_of_day",
    "is_rush_hour",
]


def extract_features(snapshot: dict) -> np.ndarray:
    """
    Convert a single snapshot dict into a 6-element feature vector.
    Missing/None values are replaced with safe defaults.
    """
    hr    = float(snapshot.get("heart_rate") or RESTING_HR_BASELINE)
    steps = float(snapshot.get("steps_last_minute") or 0)
    locv  = float(snapshot.get("location_variance") or 0.0)

    # Parse timestamp
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

    return np.array([hr, hr_norm, steps, locv, hour, is_rush], dtype=np.float32)


def build_feature_matrix(snapshots: list[dict]) -> tuple[np.ndarray, np.ndarray]:
    """
    Build X (feature matrix) and y (label vector) from a list of labeled snapshots.

    Label encoding:
      1  →  "stressed"
      0  →  "not_stressed"

    Snapshots without a valid label are silently skipped.
    """
    X, y = [], []
    for snap in snapshots:
        lbl = snap.get("label")
        if lbl not in ("stressed", "not_stressed"):
            continue
        X.append(extract_features(snap))
        y.append(1 if lbl == "stressed" else 0)

    if not X:
        return np.empty((0, len(FEATURE_NAMES))), np.empty((0,))

    return np.array(X, dtype=np.float32), np.array(y, dtype=np.int32)