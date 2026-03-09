"""
Central config — loads .env and exposes constants used across the app.
"""
import os
from dotenv import load_dotenv

load_dotenv()

# --- Transit ---
METROLINX_API_KEY: str = os.getenv("METROLINX_API_KEY", "")

# --- Paths ---
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_DIR = os.path.join(BASE_DIR, "ml", "models")
DB_PATH   = os.path.join(BASE_DIR, "db", "commute_data.json")

# Ensure dirs exist at import time
os.makedirs(MODEL_DIR, exist_ok=True)
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)