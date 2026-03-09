"""
Lightweight JSON persistence using TinyDB.

Why TinyDB and not SQLite/Postgres?
  - Zero setup, no server, no migrations
  - Data is human-readable JSON — easy to inspect and edit during development
  - Fine for capstone prototype scale (<100k records)

Stored data is used for:
  1. Building a training dataset over time (labeled snapshots)
  2. Serving recent snapshots per user for context
"""
import os
from datetime import datetime
from tinydb import TinyDB, Query
from core.config import DB_PATH

# Singleton DB — all tables share this file
_db = TinyDB(DB_PATH, indent=2)
_snapshots = _db.table("health_snapshots")


# ──────────────────────────────────────────────
# Writes
# ──────────────────────────────────────────────

def save_snapshot(snapshot: dict) -> int:
    """
    Persist a health snapshot.
    Converts datetime objects to ISO strings for JSON compatibility.
    Returns the TinyDB document ID.
    """
    record = {**snapshot}
    for key, val in record.items():
        if isinstance(val, datetime):
            record[key] = val.isoformat()
    return _snapshots.insert(record)


# ──────────────────────────────────────────────
# Reads
# ──────────────────────────────────────────────

def get_labeled_snapshots() -> list[dict]:
    """Return all snapshots that carry a ground-truth label (for ML training)."""
    Snap = Query()
    return _snapshots.search(Snap.label.exists())


def get_recent_snapshots(user_id: str, limit: int = 10) -> list[dict]:
    """Return the most recent N snapshots for a given user, newest first."""
    Snap = Query()
    results = _snapshots.search(Snap.user_id == user_id)
    results.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return results[:limit]


def get_all_snapshots() -> list[dict]:
    """Return every snapshot — used for bulk export or full retrains."""
    return _snapshots.all()


# ──────────────────────────────────────────────
# Counts
# ──────────────────────────────────────────────

def count_labeled() -> int:
    """How many labeled (training-eligible) snapshots are stored."""
    return len(get_labeled_snapshots())


def count_total() -> int:
    """Total snapshots stored (labeled + unlabeled)."""
    return len(_snapshots)