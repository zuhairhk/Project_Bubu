"""
Commute Buddy Backend — FastAPI entry point

Routes:
  GET  /                             → health check
  GET  /api/transit/next             → next GO Train departures from Union
  POST /api/health/snapshot          → ingest health snapshot from mobile app
  GET  /api/health/{user_id}/recent  → recent snapshots for a user
  POST /api/ml/predict               → predict stress from a health snapshot
  POST /api/ml/train                 → retrain the ML model on demand
  GET  /api/ml/model/info            → metadata about the current model
  GET  /view/health                  → HTML debug dashboard
"""

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime

from api.routes import transit, health, ml

app = FastAPI(
    title="Commute Buddy API",
    description="Transit data, health tracking, and ML-based stress detection",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(transit.router)
app.include_router(health.router)
app.include_router(ml.router)


@app.get("/", tags=["status"])
def root():
    return {
        "status": "ok",
        "service": "Commute Buddy API",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.get("/view/health", response_class=HTMLResponse, tags=["debug"])
def debug_view():
    from db.store import get_labeled_snapshots, count_labeled, count_total

    recent = get_labeled_snapshots()[-10:]
    rows = "".join(
        f"""<tr>
            <td>{s.get('user_id','?')}</td>
            <td>{s.get('heart_rate','?')} bpm</td>
            <td>{s.get('steps_last_minute','?')}</td>
            <td>{s.get('location_variance','N/A')}</td>
            <td class="label-{s.get('label','none')}">{s.get('label','—')}</td>
            <td>{str(s.get('timestamp','?'))[:19]}</td>
        </tr>"""
        for s in reversed(recent)
    )

    return f"""<!DOCTYPE html>
<html>
<head>
    <title>Commute Buddy — Debug Dashboard</title>
    <style>
        * {{ box-sizing:border-box; margin:0; padding:0; }}
        body {{ font-family:'Courier New',monospace; background:#0d0d0d; color:#d4d4d4; padding:2rem; line-height:1.6; }}
        h1 {{ color:#7ef9a0; font-size:1.6rem; margin-bottom:0.25rem; }}
        h2 {{ color:#888; font-size:1rem; margin:1.5rem 0 0.75rem; text-transform:uppercase; letter-spacing:0.1em; }}
        .stats {{ display:flex; gap:1rem; margin:1rem 0; flex-wrap:wrap; }}
        .stat {{ background:#1a1a1a; border:1px solid #2a2a2a; border-radius:8px; padding:0.75rem 1.25rem; min-width:140px; }}
        .stat-label {{ font-size:0.7rem; color:#666; text-transform:uppercase; }}
        .stat-value {{ font-size:1.4rem; color:#7ef9a0; font-weight:bold; }}
        table {{ border-collapse:collapse; width:100%; margin-top:0.5rem; }}
        th {{ background:#1a1a1a; color:#7ef9a0; padding:10px 12px; text-align:left; font-size:0.75rem; text-transform:uppercase; border-bottom:1px solid #2a2a2a; }}
        td {{ padding:9px 12px; border-bottom:1px solid #1a1a1a; font-size:0.85rem; }}
        tr:hover td {{ background:#141414; }}
        .label-stressed {{ color:#ff6b6b; font-weight:bold; }}
        .label-not_stressed {{ color:#7ef9a0; }}
        .links {{ margin-top:2rem; display:flex; gap:1rem; }}
        .links a {{ color:#7ef9a0; text-decoration:none; background:#1a1a1a; border:1px solid #2a2a2a; padding:6px 14px; border-radius:6px; font-size:0.85rem; }}
        .links a:hover {{ background:#222; }}
    </style>
</head>
<body>
    <h1>🚌 Commute Buddy — Backend Dashboard</h1>
    <p style="color:#555;font-size:0.8rem;margin-top:0.25rem">{datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC</p>
    <div class="stats">
        <div class="stat"><div class="stat-label">Total Snapshots</div><div class="stat-value">{count_total()}</div></div>
        <div class="stat"><div class="stat-label">Labeled (Training)</div><div class="stat-value">{count_labeled()}</div></div>
    </div>
    <h2>Recent Labeled Snapshots</h2>
    <table>
        <tr><th>User</th><th>Heart Rate</th><th>Steps/min</th><th>Loc Variance</th><th>Label</th><th>Timestamp</th></tr>
        {rows or '<tr><td colspan="6" style="color:#555;padding:1rem">No labeled snapshots yet</td></tr>'}
    </table>
    <div class="links">
        <a href="/docs">📄 Swagger UI</a>
        <a href="/redoc">📘 ReDoc</a>
        <a href="/api/transit/next">🚆 Transit</a>
        <a href="/api/ml/model/info">🤖 Model Info</a>
    </div>
</body>
</html>"""