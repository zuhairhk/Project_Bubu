"""
Transit routes — GO Train departures from Union Station.
"""
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/transit", tags=["transit"])


@router.get("/next")
def next_departures(limit: int = 10):
    """
    Returns the next N GO Train departures from Union Station, sorted by time.

    Query params:
      limit (int, default 10) — how many departures to return
    """
    from transit_api.providers.go import get_departures
    try:
        deps = get_departures(limit=limit)
        return {"count": len(deps), "departures": deps}
    except EnvironmentError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"GO Transit API error: {str(e)}")