"""
Standalone script to parse and print GTFS-RT service alerts from a binary .pb file.

Usage:
    python test_alerts.py              # uses alerts.pb in current directory
    python test_alerts.py path/to/file.pb

How to get a fresh alerts.pb:
    curl -o alerts.pb "https://api.openmetrolinx.com/OpenDataAPI/api/V1/ServiceAlerts?key=YOUR_KEY"
"""
import sys
import os
from google.transit import gtfs_realtime_pb2


def parse_alerts(pb_path: str) -> list[dict]:
    """Parse a GTFS-RT .pb file and return a list of alert dicts."""
    if not os.path.exists(pb_path):
        print(f"[ERROR] File not found: {pb_path}")
        return []

    with open(pb_path, "rb") as f:
        data = f.read()

    feed = gtfs_realtime_pb2.FeedMessage()
    feed.ParseFromString(data)

    alerts = []
    for entity in feed.entity:
        if not entity.HasField("alert"):
            continue

        header = (
            entity.alert.header_text.translation[0].text
            if entity.alert.header_text.translation else "No header"
        )
        desc = (
            entity.alert.description_text.translation[0].text
            if entity.alert.description_text.translation else ""
        )
        # Affected routes
        routes = [
            sel.route_id
            for sel in entity.alert.informed_entity
            if sel.HasField("route_id") or sel.route_id
        ]

        alerts.append({
            "id":     entity.id,
            "header": header,
            "description": desc,
            "affected_routes": routes,
        })

    return alerts


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "alerts.pb"
    results = parse_alerts(path)

    if not results:
        print("No alerts found.")
    else:
        print(f"Found {len(results)} alert(s):\n")
        for alert in results:
            print(f"[{alert['id']}] {alert['header']}")
            if alert["description"]:
                print(f"  {alert['description']}")
            if alert["affected_routes"]:
                print(f"  Routes: {', '.join(alert['affected_routes'])}")
            print()