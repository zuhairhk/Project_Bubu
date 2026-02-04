from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from transit_api.providers.go import get_departures
from pydantic import BaseModel
from datetime import datetime
from typing import Literal

app = FastAPI(title="Commubu Transit API")

# --------------------
# Models
# --------------------

class HealthData(BaseModel):
    heart_rate: int
    steps: int
    mood: Literal["happy", "neutral", "sad", "stressed"]
    timestamp: datetime

# --------------------
# In-memory store
# --------------------

LATEST_HEALTH: HealthData | None = None

# --------------------
# Routes
# --------------------

@app.get("/")
def health():
    return {"status": "ok"}

@app.get("/api/next")
def next_departure():
    dep = get_departures()
    return dep or {"message": "No upcoming departures"}

@app.get("/api/health")
def get_health():
    if LATEST_HEALTH:
        return LATEST_HEALTH
    return {
        "heart_rate": 72,
        "steps": 1200,
        "mood": "neutral",
        "timestamp": datetime.utcnow()
    }

@app.post("/api/health")
def post_health(data: HealthData):
    global LATEST_HEALTH
    LATEST_HEALTH = data
    return {"status": "received", "data": data}

@app.get("/view/health", response_class=HTMLResponse)
def view_health():
    if not LATEST_HEALTH:
        return """
        <html>
            <body>
                <h2>No health data received yet</h2>
            </body>
        </html>
        """

    return f"""
    <html>
        <head>
            <title>Health Data View</title>
            <style>
                body {{
                    font-family: Arial, sans-serif;
                    background: #f5f5f5;
                    padding: 40px;
                }}
                .card {{
                    background: white;
                    padding: 20px;
                    border-radius: 10px;
                    max-width: 400px;
                    box-shadow: 0 4px 10px rgba(0,0,0,0.1);
                }}
                h2 {{
                    margin-top: 0;
                }}
            </style>
        </head>
        <body>
            <div class="card">
                <h2>Latest Health Data</h2>
                <p><b>Heart Rate:</b> {LATEST_HEALTH.heart_rate} bpm</p>
                <p><b>Steps:</b> {LATEST_HEALTH.steps}</p>
                <p><b>Mood:</b> {LATEST_HEALTH.mood}</p>
                <p><b>Timestamp:</b> {LATEST_HEALTH.timestamp}</p>
            </div>
        </body>
    </html>
    """
