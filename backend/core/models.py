"""
Shared Pydantic schemas used across routes and ML pipeline.
"""
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, Literal


class HealthSnapshot(BaseModel):
    """
    A single health + location reading sent from the mobile app.
    The app should POST this every 30–60 seconds while commuting.

    Include `label` when the user consciously marks their current state
    (e.g. tapping "I feel stressed") — these labeled samples train the ML model.
    """
    user_id: str = Field(..., description="Unique user identifier from the mobile app")

    # Biometrics
    heart_rate: int = Field(..., ge=30, le=220, description="Heart rate in BPM")
    steps_last_minute: int = Field(default=0, ge=0, description="Steps counted in last 60 seconds")

    # Location (optional — may be unavailable if user denies permission)
    latitude: Optional[float] = Field(default=None, description="GPS latitude")
    longitude: Optional[float] = Field(default=None, description="GPS longitude")
    location_variance: Optional[float] = Field(
        default=None,
        description="Variance of GPS coords over the last N readings. High = erratic movement."
    )

    timestamp: datetime = Field(default_factory=datetime.utcnow)

    # Ground-truth label (only present when user provides feedback)
    label: Optional[Literal["stressed", "not_stressed"]] = Field(
        default=None,
        description="User-provided label for supervised training. Omit for inference-only snapshots."
    )

    model_config = {"json_schema_extra": {
        "examples": [
            {
                "user_id": "user_abc123",
                "heart_rate": 108,
                "steps_last_minute": 12,
                "location_variance": 0.00045,
                "label": "stressed"
            },
            {
                "user_id": "user_abc123",
                "heart_rate": 68,
                "steps_last_minute": 35,
                "location_variance": 0.00002,
            }
        ]
    }}


class MoodPrediction(BaseModel):
    """Response schema for /api/ml/predict."""
    user_id: str
    mood: Literal["stressed", "not_stressed"]
    confidence: float = Field(..., ge=0.0, le=1.0)
    heart_rate: int
    timestamp: datetime


class TrainRequest(BaseModel):
    """Request body for /api/ml/train."""
    min_samples: int = Field(
        default=20,
        description="Minimum total samples needed before training. Synthetic data always included."
    )