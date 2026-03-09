"""
GO Transit / Metrolinx provider.

Fetches upcoming departures from Union Station via the Metrolinx Open Data API.
"""

import requests
import urllib3
from dotenv import load_dotenv
import os
from datetime import datetime

# Suppress SSL warnings (Metrolinx API sometimes has certificate issues)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

load_dotenv()

BASE_URL = "https://api.openmetrolinx.com/OpenDataAPI/api/V1/ServiceUpdate/UnionDepartures/All"
KEY = os.getenv("METROLINX_API_KEY")


def _parse_time(t: str) -> datetime:
    """Convert API time string into datetime."""
    return datetime.strptime(t, "%Y-%m-%d %H:%M:%S")


def _normalize(dep: dict) -> dict:
    """
    Flatten a raw departure dict into a clean structure
    usable by the frontend/mobile app.
    """
    stops = dep.get("Stops", [])
    destination = stops[-1]["Name"] if stops else None

    return {
        "line": dep.get("Service"),
        "destination": destination,
        "time": dep.get("Time"),
        "platform": dep.get("Platform"),
        "status": dep.get("Info"),
        "_sort_time": _parse_time(dep["Time"]),
    }


def get_departures(limit: int = 10) -> list[dict]:
    """
    Fetch upcoming GO Train departures from Union Station.

    Returns:
        list[dict] of normalized departures sorted by time.
    """

    if not KEY:
        raise EnvironmentError("METROLINX_API_KEY not set in .env")

    headers = {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
        "Connection": "keep-alive"
    }

    try:
        resp = requests.get(
            BASE_URL,
            params={"key": KEY},
            headers=headers,
            timeout=10,
            verify=False
        )

        resp.raise_for_status()

    except requests.RequestException as e:
        print("Metrolinx API request failed:", e)
        return []

    data = resp.json()

    raw = data.get("AllDepartures")
    if not raw:
        return []

    # API sometimes returns dict of lists or list
    if isinstance(raw, dict):
        raw = list(raw.values())

    flat: list[dict] = []

    for item in raw:
        if isinstance(item, list):
            flat.extend(d for d in item if isinstance(d, dict))
        elif isinstance(item, dict):
            flat.append(item)

    normalized = []

    for d in flat:
        if d.get("Time"):
            try:
                normalized.append(_normalize(d))
            except Exception:
                continue

    normalized.sort(key=lambda x: x["_sort_time"])

    for d in normalized:
        d.pop("_sort_time", None)

    return normalized[:limit]


if __name__ == "__main__":
    from pprint import pprint

    print("Fetching GO departures...\n")
    departures = get_departures()

    pprint(departures)