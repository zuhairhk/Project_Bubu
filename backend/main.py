from fastapi import FastAPI
from transit_api.providers.go import get_departures

app = FastAPI(title="Commubu Transit API")

@app.get("/")
def health():
    return {"status": "ok"}

@app.get("/api/next")
def next_departure():
    dep = get_departures()
    return dep or {"message": "No upcoming departures"}
