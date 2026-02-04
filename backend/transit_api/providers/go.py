import requests
from dotenv import load_dotenv
import os
from datetime import datetime

load_dotenv()

BASE_URL = "https://api.openmetrolinx.com/OpenDataAPI/api/V1/ServiceUpdate/UnionDepartures/All"
KEY = os.getenv("METROLINX_API_KEY")


def parse_time(t):
    return datetime.strptime(t, "%Y-%m-%d %H:%M:%S")


def normalize(dep):
    stops = dep.get("Stops", [])
    destination = stops[-1]["Name"] if stops else None

    return {
        "line": dep.get("Service"),
        "destination": destination,
        "time": dep.get("Time"),
        "platform": dep.get("Platform"),
        "status": dep.get("Info"),
        "_sort_time": parse_time(dep.get("Time")),
    }


def get_departures(limit=10):
    resp = requests.get(
        BASE_URL,
        params={"key": KEY},
        timeout=10,
        verify=False
    )
    resp.raise_for_status()

    raw = resp.json().get("AllDepartures")
    if not raw:
        return []

    # Normalize API shape
    if isinstance(raw, dict):
        raw = list(raw.values())

    # Flatten
    flat = []
    for item in raw:
        if isinstance(item, list):
            flat.extend([d for d in item if isinstance(d, dict)])
        elif isinstance(item, dict):
            flat.append(item)

    # Normalize + sort by time ASCENDING
    normalized = [normalize(d) for d in flat if d.get("Time")]
    normalized.sort(key=lambda x: x["_sort_time"])

    # Remove internal field before returning
    for d in normalized:
        d.pop("_sort_time", None)

    return normalized[:limit]


if __name__ == "__main__":
    from pprint import pprint
    pprint(get_departures())
