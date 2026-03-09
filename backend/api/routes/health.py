"""
Health data routes.

POST /api/health/snapshot  — receive a reading from the mobile app
GET  /api/health/{user_id}/recent — last N snapshots for a user
"""
from fastapi import APIRouter, HTTPException
from core.models import HealthSnapshot
from db.store import save_snapshot, get_recent_snapshots, count_labeled

router = APIRouter(prefix="/api/health", tags=["health"])


@router.post("/snapshot")
def post_snapshot(data: HealthSnapshot):
    """
    Ingest a health snapshot from the mobile app.

    - Always saves the snapshot to the database.
    - If `label` is included ("stressed" or "not_stressed"), the snapshot
      is flagged as training data for the ML model.
    - The app should call this every 30–60 seconds during an active commute.

    Example body:
    ```json
    {
      "user_id": "user_abc",
      "heart_rate": 112,
      "steps_last_minute": 8,
      "location_variance": 0.00043,
      "label": "stressed"
    }
    ```
    """
    record = data.model_dump()
    doc_id = save_snapshot(record)

    return {
        "status": "saved",
        "doc_id": doc_id,
        "is_training_sample": data.label is not None,
        "total_labeled_samples": count_labeled(),
        "hint": (
            None if data.label
            else "Add 'label': 'stressed' or 'not_stressed' to contribute training data"
        ),
    }


@router.get("/{user_id}/recent")
def get_recent(user_id: str, limit: int = 10):
    """
    Retrieve the most recent health snapshots for a specific user.

    Path param: user_id  
    Query param: limit (default 10, max recommended 50)
    """
    snapshots = get_recent_snapshots(user_id, limit=limit)
    if not snapshots:
        raise HTTPException(
            status_code=404,
            detail=f"No snapshots found for user '{user_id}'"
        )
    return {"user_id": user_id, "count": len(snapshots), "snapshots": snapshots}