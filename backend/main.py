from fastapi import FastAPI
from dotenv import load_dotenv
from transit_api.providers.go import get_next_departure

load_dotenv()

app = FastAPI(title="Commubu Transit API")

@app.get("/")
def health():
    return {"status": "ok"}

@app.get("/api/next")
def next_departure():
    dep = get_next_departure()
    return dep or {"message": "No upcoming departures"}
