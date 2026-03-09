"""
Backend test suite — run with: pytest tests.py -v

Tests cover:
  - API endpoints (status, transit mock, health ingestion, ML predict/train)
  - ML feature extraction
  - DB store operations
  - Stress prediction logic
"""
import pytest
from datetime import datetime
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock


# ──────────────────────────────────────────────
# Setup
# ──────────────────────────────────────────────

@pytest.fixture(scope="module")
def client():
    from main import app
    return TestClient(app)


# ──────────────────────────────────────────────
# Root / Status
# ──────────────────────────────────────────────

def test_root(client):
    r = client.get("/")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert "timestamp" in data


# ──────────────────────────────────────────────
# Transit
# ──────────────────────────────────────────────

def test_transit_next_mocked(client):
    mock_deps = [
        {"line": "Lakeshore West", "destination": "Aldershot", "time": "2024-03-01 08:15:00",
         "platform": "2", "status": "On Time"},
        {"line": "Barrie", "destination": "Barrie South", "time": "2024-03-01 08:30:00",
         "platform": "7", "status": "On Time"},
    ]
    with patch("transit_api.providers.go.get_departures", return_value=mock_deps):
        r = client.get("/api/transit/next?limit=2")
        assert r.status_code == 200
        body = r.json()
        assert "departures" in body
        assert len(body["departures"]) == 2
        assert body["departures"][0]["line"] == "Lakeshore West"


def test_transit_next_empty(client):
    with patch("transit_api.providers.go.get_departures", return_value=[]):
        r = client.get("/api/transit/next")
        assert r.status_code == 200
        assert r.json()["count"] == 0


# ──────────────────────────────────────────────
# Health snapshots
# ──────────────────────────────────────────────

SAMPLE_SNAPSHOT = {
    "user_id": "test_user_001",
    "heart_rate": 95,
    "steps_last_minute": 10,
    "location_variance": 0.00035,
    "timestamp": "2024-03-01T08:30:00",
}

LABELED_SNAPSHOT = {**SAMPLE_SNAPSHOT, "label": "stressed"}


def test_post_snapshot_unlabeled(client):
    r = client.post("/api/health/snapshot", json=SAMPLE_SNAPSHOT)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "saved"
    assert body["is_training_sample"] is False


def test_post_snapshot_labeled(client):
    r = client.post("/api/health/snapshot", json=LABELED_SNAPSHOT)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "saved"
    assert body["is_training_sample"] is True
    assert body["total_labeled_samples"] >= 1


def test_post_snapshot_invalid_hr(client):
    bad = {**SAMPLE_SNAPSHOT, "heart_rate": 300}  # out of range
    r = client.post("/api/health/snapshot", json=bad)
    assert r.status_code == 422


def test_get_recent_snapshots(client):
    r = client.get("/api/health/test_user_001/recent?limit=5")
    assert r.status_code == 200
    body = r.json()
    assert body["user_id"] == "test_user_001"
    assert "snapshots" in body


def test_get_recent_snapshots_unknown_user(client):
    r = client.get("/api/health/nonexistent_xyz_999/recent")
    assert r.status_code == 404


# ──────────────────────────────────────────────
# ML — Feature extraction
# ──────────────────────────────────────────────

def test_feature_extraction():
    from ml.features import extract_features, FEATURE_NAMES
    snap = {
        "heart_rate": 110,
        "steps_last_minute": 5,
        "location_variance": 0.0004,
        "timestamp": datetime(2024, 3, 1, 8, 30),  # rush hour
    }
    features = extract_features(snap)
    assert features.shape == (len(FEATURE_NAMES),)
    assert features[0] == 110.0                   # raw HR
    assert features[5] == 1.0                     # is_rush_hour (8am = True)


def test_feature_extraction_defaults():
    from ml.features import extract_features
    # All optional fields missing
    features = extract_features({"heart_rate": 72})
    assert features.shape == (6,)
    assert features[2] == 0.0  # steps default to 0


def test_build_feature_matrix_filters_unlabeled():
    from ml.features import build_feature_matrix
    snaps = [
        {"heart_rate": 100, "steps_last_minute": 5, "label": "stressed"},
        {"heart_rate": 70,  "steps_last_minute": 30},                      # no label — skip
        {"heart_rate": 65,  "steps_last_minute": 40, "label": "not_stressed"},
    ]
    X, y = build_feature_matrix(snaps)
    assert X.shape[0] == 2
    assert list(y) == [1, 0]


# ──────────────────────────────────────────────
# ML — Prediction endpoint
# ──────────────────────────────────────────────

def test_predict_stressed(client):
    r = client.post("/api/ml/predict", json={
        "user_id": "test_user_001",
        "heart_rate": 125,
        "steps_last_minute": 5,
        "location_variance": 0.0006,
        "timestamp": "2024-03-01T08:15:00",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["mood"] in ("stressed", "not_stressed")
    assert 0.0 <= body["confidence"] <= 1.0
    assert body["user_id"] == "test_user_001"


def test_predict_not_stressed(client):
    r = client.post("/api/ml/predict", json={
        "user_id": "test_user_001",
        "heart_rate": 62,
        "steps_last_minute": 20,
        "location_variance": 0.000005,
        "timestamp": "2024-03-01T14:00:00",
    })
    assert r.status_code == 200
    assert r.json()["mood"] in ("stressed", "not_stressed")


# ──────────────────────────────────────────────
# ML — Model info
# ──────────────────────────────────────────────

def test_model_info(client):
    # Ensure model exists first
    client.post("/api/ml/predict", json=SAMPLE_SNAPSHOT)
    r = client.get("/api/ml/model/info")
    assert r.status_code == 200
    body = r.json()
    # Should have either status or training metadata
    assert "labeled_samples_in_db" in body


# ──────────────────────────────────────────────
# ML — Retrain
# ──────────────────────────────────────────────

def test_retrain(client):
    r = client.post("/api/ml/train", json={"min_samples": 1})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "trained"
    assert "cv_f1_mean" in body
    assert body["total_samples"] > 0


# ──────────────────────────────────────────────
# Debug view
# ──────────────────────────────────────────────

def test_debug_view(client):
    r = client.get("/view/health")
    assert r.status_code == 200
    assert "Commute Buddy" in r.text