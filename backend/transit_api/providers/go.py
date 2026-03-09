"""
GO Transit / Metrolinx provider.

Actual API response shape (confirmed from live response):
{
  "adata": {
    "Departures": {
      "Trip": [
        {
          "Info": "Wait / Attendez",
          "TripNumber": "1029",
          "Platform": "-",
          "Service": "Lakeshore West",
          "ServiceType": "T",
          "Time": "2026-03-09 18:17:00",
          "Stops": [
            {"Name": "Exhibition", "Code": null},
            {"Name": "Aldershot",  "Code": null}
          ]
        },
        ...
      ]
    }
  }
}
"""
import requests
import urllib3
from dotenv import load_dotenv
import os
from datetime import datetime

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
load_dotenv()

BASE_URL = "https://api.openmetrolinx.com/OpenDataAPI/api/V1/ServiceUpdate/UnionDepartures/All"
KEY = os.getenv("METROLINX_API_KEY")

TIME_FORMAT = "%Y-%m-%d %H:%M:%S"


def _parse_time(t: str) -> datetime:
    return datetime.strptime(t, TIME_FORMAT)


def _normalize(trip: dict) -> dict:
    """Map a raw Trip dict to a clean, consistent shape."""
    stops = trip.get("Stops") or []
    destination = stops[-1]["Name"] if stops else None

    return {
        "trip_number": trip.get("TripNumber"),
        "line":        trip.get("Service"),
        "service_type": trip.get("ServiceType"),
        "destination": destination,
        "time":        trip.get("Time"),
        "platform":    trip.get("Platform"),
        "status":      trip.get("Info"),
        "stops":       [s["Name"] for s in stops if s.get("Name")],
        "_sort_time":  _parse_time(trip["Time"]),
    }


def get_departures(limit: int = 10) -> list[dict]:
    """
    Fetch the next GO Train departures from Union Station.
    Returns a list sorted by departure time ascending.
    """
    if not KEY:
        raise EnvironmentError("METROLINX_API_KEY not set in .env")

    resp = requests.get(BASE_URL, params={"key": KEY}, timeout=10, verify=False)
    resp.raise_for_status()

    body = resp.json()

    # Navigate actual response structure: body["adata"]["Departures"]["Trip"]
    try:
        trips = body["adata"]["Departures"]["Trip"]
    except (KeyError, TypeError):
        # Fallback: try old expected shape just in case
        trips = body.get("AllDepartures", [])

    if not trips:
        return []

    # Ensure it's a list
    if isinstance(trips, dict):
        trips = [trips]

    normalized = [_normalize(t) for t in trips if t.get("Time")]
    normalized.sort(key=lambda x: x["_sort_time"])

    for d in normalized:
        d.pop("_sort_time", None)

    return normalized[:limit]


if __name__ == "__main__":
    from pprint import pprint
    pprint(get_departures())