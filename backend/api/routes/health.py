"""
Health data routes.
POST /api/health/snapshot  — receive a reading from the mobile app
GET  /api/health/{user_id}/recent — last N snapshots for a user
"""
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from core.models import HealthSnapshot
from db.store import save_snapshot, get_recent_snapshots, count_labeled, count_total

router = APIRouter(prefix="/api/health", tags=["health"])

# Auto-retrain every time this many NEW labeled samples have been collected
RETRAIN_EVERY_N = 10
_labeled_at_last_train: int = 0


async def _maybe_retrain(current_labeled: int):
    """Trigger a background retrain if enough new labeled samples have accumulated."""
    global _labeled_at_last_train
    new_since_last = current_labeled - _labeled_at_last_train
    if new_since_last >= RETRAIN_EVERY_N:
        try:
            from ml.models.training.train import train_model
            result = await run_in_threadpool(train_model, 1)
            _labeled_at_last_train = current_labeled
            print(f"[Auto-retrain] {result['total_samples']} samples | F1={result['cv_f1_weighted_mean']}")
        except Exception as e:
            print(f"[Auto-retrain] Failed: {e}")


@router.post("/snapshot")
async def post_snapshot(data: HealthSnapshot):
    """
    Ingest a health snapshot from the mobile app.
    - Always saves to the database.
    - If `label` is included, the snapshot is flagged as training data.
    - Auto-retrains the model every 10 new labeled samples.
    - The app should call this every 30-60 seconds during an active commute.
    """
    record = data.model_dump()
    doc_id = save_snapshot(record)
    labeled_total = count_labeled()

    # Trigger background retrain if we have enough new labeled data
    if data.label is not None:
        await _maybe_retrain(labeled_total)

    return {
        "status":                "saved",
        "doc_id":                doc_id,
        "is_training_sample":    data.label is not None,
        "total_labeled_samples": labeled_total,
        "total_snapshots":       count_total(),
        "hint": (
            None if data.label
            else "Add 'label' to contribute training data"
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


@router.get("/")
def health_status():
    """Quick status check — how much data is in the DB."""
    return {
        "total_snapshots":       count_total(),
        "labeled_snapshots":     count_labeled(),
        "next_retrain_in":       max(0, RETRAIN_EVERY_N - (count_labeled() - _labeled_at_last_train)),
    }