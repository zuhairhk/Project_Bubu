"""
Commute Buddy Backend — FastAPI entry point
"""
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
from api.routes import transit, health, ml

app = FastAPI(title="Commute Buddy API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(transit.router)
app.include_router(health.router)
app.include_router(ml.router)


@app.get("/", tags=["status"])
def root():
    return {"status": "ok", "service": "Commute Buddy API", "version": "1.0.0",
            "timestamp": datetime.utcnow().isoformat()}


@app.get("/view/health", response_class=HTMLResponse, tags=["debug"])
def debug_view():
    from db.store import get_labeled_snapshots, count_labeled, count_total
    import json as _json, os
    from core.config import MODEL_DIR

    all_labeled = get_labeled_snapshots()
    # Show ALL labeled snapshots in the table, newest first
    all_rows    = list(reversed(all_labeled))
    total       = count_total()
    labeled     = count_labeled()

    MOOD = {
        "happy":    {"emoji": "😊", "color": "#d97706", "bg": "#fef3c7", "dot": "#f59e0b"},
        "neutral":  {"emoji": "😐", "color": "#0369a1", "bg": "#e0f2fe", "dot": "#38bdf8"},
        "stressed": {"emoji": "😤", "color": "#c2410c", "bg": "#fff7ed", "dot": "#fb923c"},
        "angry":    {"emoji": "😠", "color": "#b91c1c", "bg": "#fee2e2", "dot": "#f87171"},
        "sad":      {"emoji": "😢", "color": "#1d4ed8", "bg": "#eff6ff", "dot": "#60a5fa"},
        "sleepy":   {"emoji": "😴", "color": "#6d28d9", "bg": "#f5f3ff", "dot": "#a78bfa"},
    }

    counts = {m: 0 for m in MOOD}
    for s in all_labeled:
        m = s.get("label")
        if m in counts:
            counts[m] += 1
    base = labeled or 1

    pills = ""
    for mood, meta in MOOD.items():
        n   = counts[mood]
        pct = round(n / base * 100)
        pills += f"""<div class="pill" style="border-left:3px solid {meta['dot']}">
          <div class="pill-top">
            <span class="pemoji">{meta['emoji']}</span>
            <span class="pname">{mood}</span>
            <span class="pcount" style="color:{meta['color']}">{n}</span>
          </div>
          <div class="ptrack"><div class="pfill" style="width:{pct}%;background:{meta['dot']}"></div></div>
          <div class="ppct" style="color:{meta['color']}">{pct}%</div>
        </div>"""

    rows = ""
    for s in all_rows:
        mood   = s.get("label") or "unknown"
        meta   = MOOD.get(mood, {"emoji": "?", "color": "#888", "bg": "#f5f5f5", "dot": "#ccc"})
        sp     = s.get("spotify") or {}
        track  = sp.get("track_name", "") if isinstance(sp, dict) else ""
        artist = sp.get("artist_name", "") if isinstance(sp, dict) else ""
        energy = sp.get("energy")          if isinstance(sp, dict) else None
        valence= sp.get("valence")         if isinstance(sp, dict) else None

        music = (f'<div class="trk">{track}</div><div class="art">{artist}</div>'
                 if track else '<span class="na">—</span>')

        bars = ""
        if energy is not None:
            ew = round(float(energy)         * 50)
            vw = round(float(valence or 0.5) * 50)
            bars = (
                f'<div class="bar-row"><span class="bar-lbl">E</span>'
                f'<div class="bar-track"><div class="bar-fill" style="width:{ew}px;background:#f97316"></div></div>'
                f'<span class="bar-val">{float(energy):.2f}</span></div>'
                f'<div class="bar-row"><span class="bar-lbl">V</span>'
                f'<div class="bar-track"><div class="bar-fill" style="width:{vw}px;background:#3b82f6"></div></div>'
                f'<span class="bar-val">{float(valence or 0):.2f}</span></div>'
            )

        ts = str(s.get("timestamp", ""))[:16].replace("T", " ")
        hr = s.get("heart_rate", "?")
        steps = s.get("steps_last_minute", "?")

        # HR colour coding
        hr_color = "#16a34a"
        if isinstance(hr, int):
            if hr > 130: hr_color = "#dc2626"
            elif hr > 100: hr_color = "#ea580c"
            elif hr < 55: hr_color = "#7c3aed"

        rows += f"""<tr>
          <td><span class="uid">{s.get('user_id','?')}</span></td>
          <td><span class="hrval" style="color:{hr_color}">{hr}</span><span class="unit"> bpm</span></td>
          <td><span class="steps">{steps}</span></td>
          <td class="music-td">{music}</td>
          <td class="bars-td">{bars}</td>
          <td><span class="badge" style="color:{meta['color']};background:{meta['bg']}">{meta['emoji']} {mood}</span></td>
          <td class="tscell">{ts}</td>
        </tr>"""

    meta_path = os.path.join(MODEL_DIR, "model_metadata.json")
    if os.path.exists(meta_path):
        with open(meta_path) as f:
            md = _json.load(f)
        f1      = md.get("cv_f1_weighted_mean", md.get("cv_f1_mean", "—"))
        trained = md.get("trained_at", "")[:16].replace("T", " ")
        real    = md.get("real_samples", 0)
        synth   = md.get("synthetic_samples", 0)
        f1_float = float(f1) if isinstance(f1, (int, float)) else 0
        f1_color = "#16a34a" if f1_float >= 0.90 else "#ea580c"
        minner = (f'<span class="mchip">F1 Score <b style="color:{f1_color}">{f1}</b></span>'
                  f'<span class="mdiv">|</span>'
                  f'<span class="mchip">{real} real + {synth} synthetic samples</span>'
                  f'<span class="mdiv">|</span>'
                  f'<span class="mchip">Last trained {trained} UTC</span>')
    else:
        minner = '<span style="color:#9ca3af;font-style:italic">No model trained yet</span>'

    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Commute Buddy — Dashboard</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}

  body {{
    background: #f1f5f9;
    color: #0f172a;
    font-family: 'Inter', sans-serif;
    font-size: 14px;
    min-height: 100vh;
  }}

  /* ── TOP BAR ── */
  .topbar {{
    background: #0f172a;
    color: #fff;
    padding: 0 2rem;
    height: 52px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 100;
  }}
  .topbar-left {{
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }}
  .topbar h1 {{
    font-family: 'Space Grotesk', sans-serif;
    font-size: 1.1rem;
    font-weight: 700;
    color: #f1f5f9;
    letter-spacing: -0.01em;
  }}
  .topbar-sub {{
    font-size: 0.65rem;
    color: #64748b;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }}
  .topbar-right {{
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }}
  .online-badge {{
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.7rem;
    color: #4ade80;
    font-weight: 500;
  }}
  .online-badge::before {{
    content: '';
    width: 7px; height: 7px;
    background: #4ade80;
    border-radius: 50%;
    box-shadow: 0 0 6px #4ade80;
    animation: pulse 2s infinite;
  }}
  @keyframes pulse {{ 0%,100% {{ opacity:1 }} 50% {{ opacity:0.4 }} }}
  .topbar-time {{ font-size: 0.7rem; color: #64748b; }}

  /* ── NAV ── */
  .nav {{
    background: #fff;
    border-bottom: 1px solid #e2e8f0;
    padding: 0 2rem;
    display: flex;
    gap: 0.25rem;
  }}
  .nav a {{
    display: inline-block;
    padding: 0.6rem 0.85rem;
    font-size: 0.75rem;
    font-weight: 500;
    color: #64748b;
    text-decoration: none;
    border-bottom: 2px solid transparent;
    transition: all 0.15s;
  }}
  .nav a:hover {{ color: #0f172a; border-bottom-color: #3b82f6; }}

  /* ── PAGE ── */
  .page {{ max-width: 1400px; margin: 0 auto; padding: 1.5rem 2rem 3rem; }}

  /* ── STAT CARDS ── */
  .stats {{
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 1rem;
    margin-bottom: 1.25rem;
  }}
  .sc {{
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 1rem 1.25rem;
  }}
  .sl {{ font-size: 0.68rem; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 0.4rem; }}
  .sv {{ font-size: 2rem; font-weight: 700; color: #0f172a; line-height: 1; }}
  .ss {{ font-size: 0.68rem; color: #94a3b8; margin-top: 0.2rem; }}

  /* ── MODEL BAR ── */
  .mbar {{
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 0.75rem 1.25rem;
    margin-bottom: 1.25rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }}
  .mlbl {{ font-size: 0.68rem; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em; }}
  .mchip {{ font-size: 0.8rem; color: #334155; }}
  .mchip b {{ font-weight: 600; }}
  .mdiv {{ color: #cbd5e1; }}

  /* ── SECTION TITLE ── */
  .stitle {{
    font-size: 0.7rem;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 0.75rem;
  }}

  /* ── MOOD PILLS ── */
  .mgrid {{
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }}
  .pill {{
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 0.9rem 1rem 0.75rem;
  }}
  .pill-top {{ display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.6rem; }}
  .pemoji {{ font-size: 1.25rem; }}
  .pname {{ font-size: 0.72rem; font-weight: 600; color: #475569; flex: 1; text-transform: capitalize; }}
  .pcount {{ font-size: 1.1rem; font-weight: 700; }}
  .ptrack {{ height: 4px; background: #f1f5f9; border-radius: 4px; overflow: hidden; margin-bottom: 0.35rem; }}
  .pfill {{ height: 100%; border-radius: 4px; }}
  .ppct {{ font-size: 0.65rem; font-weight: 600; text-align: right; }}

  /* ── TABLE ── */
  .twrap {{
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    overflow: hidden;
  }}
  .table-header {{
    padding: 0.9rem 1.25rem;
    border-bottom: 1px solid #f1f5f9;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }}
  .table-title {{
    font-size: 0.78rem;
    font-weight: 600;
    color: #0f172a;
  }}
  .table-legend {{
    display: flex;
    align-items: center;
    gap: 1rem;
    font-size: 0.68rem;
    color: #64748b;
  }}
  .leg-item {{ display: flex; align-items: center; gap: 0.3rem; }}
  .leg-dot {{ width: 8px; height: 8px; border-radius: 2px; }}
  .table-count {{
    font-size: 0.68rem;
    color: #94a3b8;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    padding: 2px 8px;
    border-radius: 20px;
  }}

  /* scrollable table body */
  .table-scroll {{
    max-height: 520px;
    overflow-y: auto;
    overflow-x: auto;
  }}
  .table-scroll::-webkit-scrollbar {{ width: 6px; height: 6px; }}
  .table-scroll::-webkit-scrollbar-track {{ background: #f8fafc; }}
  .table-scroll::-webkit-scrollbar-thumb {{ background: #cbd5e1; border-radius: 3px; }}
  .table-scroll::-webkit-scrollbar-thumb:hover {{ background: #94a3b8; }}

  table {{ width: 100%; border-collapse: collapse; min-width: 700px; }}
  thead tr {{
    background: #f8fafc;
    position: sticky;
    top: 0;
    z-index: 10;
  }}
  th {{
    padding: 0.6rem 1rem;
    text-align: left;
    font-size: 0.67rem;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-bottom: 1px solid #e2e8f0;
    white-space: nowrap;
    background: #f8fafc;
  }}
  td {{
    padding: 0.6rem 1rem;
    font-size: 0.8rem;
    border-bottom: 1px solid #f1f5f9;
    vertical-align: middle;
    color: #334155;
  }}
  tr:last-child td {{ border-bottom: none; }}
  tbody tr:hover td {{ background: #f8fafc; }}

  .uid {{
    font-size: 0.68rem;
    font-weight: 500;
    color: #94a3b8;
    background: #f1f5f9;
    border-radius: 4px;
    padding: 2px 7px;
  }}
  .hrval {{ font-size: 0.9rem; font-weight: 700; }}
  .unit {{ font-size: 0.7rem; color: #94a3b8; }}
  .steps {{ font-weight: 600; color: #334155; }}
  .trk {{ font-weight: 500; color: #0f172a; font-size: 0.78rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px; }}
  .art {{ font-size: 0.7rem; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px; }}
  .na {{ color: #cbd5e1; }}
  .music-td {{ max-width: 180px; }}
  .bars-td {{ min-width: 120px; }}

  .bar-row {{
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin-bottom: 3px;
  }}
  .bar-row:last-child {{ margin-bottom: 0; }}
  .bar-lbl {{ font-size: 0.6rem; font-weight: 600; color: #94a3b8; width: 10px; }}
  .bar-track {{ height: 4px; background: #f1f5f9; border-radius: 3px; width: 50px; overflow: hidden; }}
  .bar-fill {{ height: 100%; border-radius: 3px; }}
  .bar-val {{ font-size: 0.65rem; color: #94a3b8; width: 28px; }}

  .badge {{
    display: inline-block;
    padding: 3px 9px;
    border-radius: 20px;
    font-size: 0.7rem;
    font-weight: 600;
    white-space: nowrap;
  }}
  .tscell {{ font-size: 0.72rem; color: #94a3b8; white-space: nowrap; font-variant-numeric: tabular-nums; }}
  .empty td {{ text-align: center; color: #94a3b8; padding: 3rem; font-style: italic; }}
</style>
</head>
<body>

<div class="topbar">
  <div class="topbar-left">
    <span style="font-size:1.3rem">🚌</span>
    <div>
      <div class="topbar h1" style="font-family:'Space Grotesk',sans-serif;font-size:1rem;font-weight:700;color:#f1f5f9">Commute Buddy</div>
      <div class="topbar-sub">Backend Intelligence Dashboard</div>
    </div>
  </div>
  <div class="topbar-right">
    <div class="online-badge">Backend Online</div>
    <div class="topbar-time">{now} UTC</div>
  </div>
</div>

<div class="nav">
  <a href="/docs">📄 Swagger UI</a>
  <a href="/redoc">📘 ReDoc</a>
  <a href="/api/transit/next">🚆 GO Transit</a>
  <a href="/api/ml/model/info">🤖 Model JSON</a>
  <a href="/api/health/dev_user/recent">👤 User Snapshots</a>
</div>

<div class="page">

  <div class="stats">
    <div class="sc">
      <div class="sl">Total Snapshots</div>
      <div class="sv">{total}</div>
      <div class="ss">all time</div>
    </div>
    <div class="sc">
      <div class="sl">Labeled</div>
      <div class="sv">{labeled}</div>
      <div class="ss">training eligible</div>
    </div>
    <div class="sc">
      <div class="sl">Moods Tracked</div>
      <div class="sv">6</div>
      <div class="ss">😊 😐 😤 😠 😢 😴</div>
    </div>
    <div class="sc">
      <div class="sl">Unlabeled</div>
      <div class="sv">{total - labeled}</div>
      <div class="ss">inference only</div>
    </div>
  </div>

  <div class="mbar">
    <span class="mlbl">🤖 ML Model</span>
    {minner}
  </div>

  <div class="stitle">Mood Distribution</div>
  <div class="mgrid">{pills}</div>

  <div class="twrap">
    <div class="table-header">
      <span class="table-title">All Labeled Snapshots</span>
      <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
        <div class="table-legend">
          <div class="leg-item"><div class="leg-dot" style="background:#f97316"></div> Energy</div>
          <div class="leg-item"><div class="leg-dot" style="background:#3b82f6"></div> Valence</div>
          <div class="leg-item" style="color:#dc2626">● High HR</div>
          <div class="leg-item" style="color:#16a34a">● Normal HR</div>
          <div class="leg-item" style="color:#7c3aed">● Low HR</div>
        </div>
        <span class="table-count">{labeled} rows</span>
      </div>
    </div>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>User</th>
            <th>Heart Rate</th>
            <th>Steps/min</th>
            <th>Track</th>
            <th>Energy / Valence</th>
            <th>Mood</th>
            <th>Timestamp</th>
          </tr>
        </thead>
        <tbody>
          {rows or '<tr class="empty"><td colspan="7">No snapshots yet — run seed_and_train_v2.py</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>

</div>
</body>
</html>"""