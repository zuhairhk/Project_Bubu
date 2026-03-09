"""
seed_and_train_v2.py
────────────────────
120 labeled samples across 6 moods. Each sample has realistic biometrics
AND matching Spotify audio features so the model learns both signals.

Mood profiles:
  😊 happy    HR 72-92   steps 30-68   energy 0.65-0.90  valence 0.75-0.97  tempo 95-171
  😐 neutral  HR 62-75   steps 5-22    energy 0.30-0.55  valence 0.33-0.58  tempo 70-130
  😤 stressed HR 95-145  steps 0-14 (waiting) OR 85-145 (rushing)  energy 0.82-0.97  valence 0.12-0.37  tempo 90-175  rush hour
  😠 angry    HR 136-162 steps 58-135  energy 0.93-0.99  valence 0.04-0.12  tempo 89-212
  😢 sad      HR 55-65   steps 1-11    energy 0.09-0.28  valence 0.06-0.19  tempo 57-133
  😴 sleepy   HR 46-59   steps 0-5     energy 0.05-0.16  valence 0.23-0.40  tempo 56-104  early morning

Run with server running:
    python seed_and_train_v2.py
"""
import requests

BASE = "http://localhost:8000"
E    = {"happy":"😊","neutral":"😐","stressed":"😤","angry":"😠","sad":"😢","sleepy":"😴"}

SAMPLES = [

  # ════════════════════════════════════════════════════
  # 😊  HAPPY  (20)
  # High energy + high valence music, moderate HR, active steps
  # ════════════════════════════════════════════════════
  {"user_id":"dev_user","heart_rate":78,"steps_last_minute":48,"location_variance":0.000035,"timestamp":"2026-03-09T10:15:00","spotify":{"track_name":"Levitating","artist_name":"Dua Lipa","energy":0.82,"valence":0.93,"tempo":103.0},"label":"happy"},
  {"user_id":"dev_user","heart_rate":82,"steps_last_minute":55,"location_variance":0.000042,"timestamp":"2026-03-09T11:30:00","spotify":{"track_name":"Blinding Lights","artist_name":"The Weeknd","energy":0.80,"valence":0.76,"tempo":171.0},"label":"happy"},
  {"user_id":"dev_user","heart_rate":75,"steps_last_minute":38,"location_variance":0.000021,"timestamp":"2026-03-10T10:00:00","spotify":{"track_name":"Happy","artist_name":"Pharrell Williams","energy":0.84,"valence":0.96,"tempo":160.0},"label":"happy"},
  {"user_id":"dev_user","heart_rate":88,"steps_last_minute":62,"location_variance":0.000058,"timestamp":"2026-03-10T12:20:00","spotify":{"track_name":"Can't Stop the Feeling","artist_name":"Justin Timberlake","energy":0.79,"valence":0.95,"tempo":113.0},"label":"happy"},
  {"user_id":"dev_user","heart_rate":80,"steps_last_minute":50,"location_variance":0.000039,"timestamp":"2026-03-11T09:45:00","spotify":{"track_name":"Good as Hell","artist_name":"Lizzo","energy":0.75,"valence":0.88,"tempo":96.0},"label":"happy"},
  {"user_id":"dev_user","heart_rate":74,"steps_last_minute":41,"location_variance":0.000028,"timestamp":"2026-03-11T14:10:00","spotify":{"track_name":"Uptown Funk","artist_name":"Bruno Mars","energy":0.86,"valence":0.91,"tempo":115.0},"label":"happy"},
  {"user_id":"dev_user","heart_rate":85,"steps_last_minute":56,"location_variance":0.000049,"timestamp":"2026-03-12T11:00:00","spotify":{"track_name":"Shake It Off","artist_name":"Taylor Swift","energy":0.80,"valence":0.94,"tempo":160.0},"label":"happy"},
  {"user_id":"dev_user","heart_rate":77,"steps_last_minute":43,"location_variance":0.000030,"timestamp":"2026-03-12T13:30:00","spotify":{"track_name":"Dynamite","artist_name":"BTS","energy":0.74,"valence":0.88,"tempo":114.0},"label":"happy"},
  {"user_id":"dev_user","heart_rate":81,"steps_last_minute":51,"location_variance":0.000040,"timestamp":"2026-03-13T10:30:00","spotify":{"track_name":"Sunflower","artist_name":"Post Malone","energy":0.76,"valence":0.91,"tempo":90.0},"label":"happy"},
  {"user_id":"dev_user","heart_rate":79,"steps_last_minute":47,"location_variance":0.000034,"timestamp":"2026-03-14T11:15:00","spotify":{"track_name":"Permission to Dance","artist_name":"BTS","energy":0.82,"valence":0.93,"tempo":124.0},"label":"happy"},
  {"user_id":"dev_user","heart_rate":87,"steps_last_minute":59,"location_variance":0.000053,"timestamp":"2026-03-15T12:00:00","spotify":{"track_name":"Watermelon Sugar","artist_name":"Harry Styles","energy":0.82,"valence":0.91,"tempo":95.0},"label":"happy"},
  {"user_id":"dev_user","heart_rate":76,"steps_last_minute":42,"location_variance":0.000029,"timestamp":"2026-03-15T14:45:00","spotify":{"track_name":"As It Was","artist_name":"Harry Styles","energy":0.73,"valence":0.84,"tempo":124.0},"label":"happy"},
  {"user_id":"dev_user","heart_rate":83,"steps_last_minute":54,"location_variance":0.000045,"timestamp":"2026-03-16T10:00:00","spotify":{"track_name":"Golden Hour","artist_name":"JVKE","energy":0.60,"valence":0.89,"tempo":97.0},"label":"happy"},
  {"user_id":"dev_user","heart_rate":73,"steps_last_minute":36,"location_variance":0.000019,"timestamp":"2026-03-16T15:30:00","spotify":{"track_name":"Heat Waves","artist_name":"Glass Animals","energy":0.62,"valence":0.81,"tempo":80.0},"label":"happy"},
  {"user_id":"dev_user","heart_rate":90,"steps_last_minute":65,"location_variance":0.000064,"timestamp":"2026-03-17T09:30:00","spotify":{"track_name":"I Gotta Feeling","artist_name":"Black Eyed Peas","energy":0.88,"valence":0.96,"tempo":128.0},"label":"happy"},
  {"user_id":"dev_user","heart_rate":84,"steps_last_minute":57,"location_variance":0.000050,"timestamp":"2026-03-17T13:00:00","spotify":{"track_name":"Supalonely","artist_name":"BENEE","energy":0.66,"valence":0.78,"tempo":107.0},"label":"happy"},
  {"user_id":"dev_user","heart_rate":72,"steps_last_minute":34,"location_variance":0.000016,"timestamp":"2026-03-18T10:45:00","spotify":{"track_name":"Flowers","artist_name":"Miley Cyrus","energy":0.72,"valence":0.86,"tempo":118.0},"label":"happy"},
  {"user_id":"dev_user","heart_rate":86,"steps_last_minute":60,"location_variance":0.000055,"timestamp":"2026-03-18T14:00:00","spotify":{"track_name":"About Damn Time","artist_name":"Lizzo","energy":0.77,"valence":0.90,"tempo":110.0},"label":"happy"},
  {"user_id":"dev_user","heart_rate":78,"steps_last_minute":46,"location_variance":0.000033,"timestamp":"2026-03-19T11:30:00","spotify":{"track_name":"Butter","artist_name":"BTS","energy":0.81,"valence":0.92,"tempo":110.0},"label":"happy"},
  {"user_id":"dev_user","heart_rate":92,"steps_last_minute":68,"location_variance":0.000070,"timestamp":"2026-03-19T13:45:00","spotify":{"track_name":"Cruel Summer","artist_name":"Taylor Swift","energy":0.70,"valence":0.84,"tempo":170.0},"label":"happy"},

  # ════════════════════════════════════════════════════
  # 😐  NEUTRAL  (20)
  # Resting HR, minimal movement, mid energy/valence music
  # ════════════════════════════════════════════════════
  {"user_id":"dev_user","heart_rate":68,"steps_last_minute":12,"location_variance":0.000005,"timestamp":"2026-03-09T13:00:00","spotify":{"track_name":"Circles","artist_name":"Post Malone","energy":0.49,"valence":0.52,"tempo":120.0},"label":"neutral"},
  {"user_id":"dev_user","heart_rate":72,"steps_last_minute":18,"location_variance":0.000009,"timestamp":"2026-03-09T15:00:00","spotify":{"track_name":"Peaches","artist_name":"Justin Bieber","energy":0.52,"valence":0.55,"tempo":90.0},"label":"neutral"},
  {"user_id":"dev_user","heart_rate":65,"steps_last_minute":8,"location_variance":0.000003,"timestamp":"2026-03-10T14:30:00","spotify":{"track_name":"Memories","artist_name":"Maroon 5","energy":0.41,"valence":0.49,"tempo":91.0},"label":"neutral"},
  {"user_id":"dev_user","heart_rate":70,"steps_last_minute":15,"location_variance":0.000007,"timestamp":"2026-03-10T16:00:00","spotify":{"track_name":"Perfect","artist_name":"Ed Sheeran","energy":0.43,"valence":0.57,"tempo":95.0},"label":"neutral"},
  {"user_id":"dev_user","heart_rate":67,"steps_last_minute":10,"location_variance":0.000004,"timestamp":"2026-03-11T13:45:00","spotify":{"track_name":"Midnight Rain","artist_name":"Taylor Swift","energy":0.52,"valence":0.50,"tempo":81.0},"label":"neutral"},
  {"user_id":"dev_user","heart_rate":73,"steps_last_minute":20,"location_variance":0.000011,"timestamp":"2026-03-11T15:30:00","spotify":{"track_name":"Drivers License","artist_name":"Olivia Rodrigo","energy":0.44,"valence":0.33,"tempo":73.0},"label":"neutral"},
  {"user_id":"dev_user","heart_rate":66,"steps_last_minute":9,"location_variance":0.000004,"timestamp":"2026-03-12T14:00:00","spotify":{"track_name":"Heather","artist_name":"Conan Gray","energy":0.36,"valence":0.41,"tempo":90.0},"label":"neutral"},
  {"user_id":"dev_user","heart_rate":71,"steps_last_minute":16,"location_variance":0.000008,"timestamp":"2026-03-12T16:30:00","spotify":{"track_name":"Wasted","artist_name":"Tiesto","energy":0.51,"valence":0.48,"tempo":128.0},"label":"neutral"},
  {"user_id":"dev_user","heart_rate":69,"steps_last_minute":13,"location_variance":0.000006,"timestamp":"2026-03-13T13:15:00","spotify":{"track_name":"Falling","artist_name":"Trevor Daniel","energy":0.39,"valence":0.40,"tempo":70.0},"label":"neutral"},
  {"user_id":"dev_user","heart_rate":64,"steps_last_minute":7,"location_variance":0.000003,"timestamp":"2026-03-13T17:00:00","spotify":{"track_name":"lovely","artist_name":"Billie Eilish","energy":0.30,"valence":0.36,"tempo":115.0},"label":"neutral"},
  {"user_id":"dev_user","heart_rate":74,"steps_last_minute":22,"location_variance":0.000013,"timestamp":"2026-03-14T14:00:00","spotify":{"track_name":"Antihero","artist_name":"Taylor Swift","energy":0.48,"valence":0.43,"tempo":97.0},"label":"neutral"},
  {"user_id":"dev_user","heart_rate":63,"steps_last_minute":6,"location_variance":0.000002,"timestamp":"2026-03-14T16:45:00","spotify":{"track_name":"Glimpse of Us","artist_name":"Joji","energy":0.34,"valence":0.38,"tempo":71.0},"label":"neutral"},
  {"user_id":"dev_user","heart_rate":70,"steps_last_minute":14,"location_variance":0.000007,"timestamp":"2026-03-15T13:00:00","spotify":{"track_name":"softly","artist_name":"Keshi","energy":0.40,"valence":0.46,"tempo":80.0},"label":"neutral"},
  {"user_id":"dev_user","heart_rate":68,"steps_last_minute":11,"location_variance":0.000005,"timestamp":"2026-03-15T17:15:00","spotify":{"track_name":"Golden","artist_name":"Harry Styles","energy":0.44,"valence":0.57,"tempo":144.0},"label":"neutral"},
  {"user_id":"dev_user","heart_rate":72,"steps_last_minute":17,"location_variance":0.000009,"timestamp":"2026-03-16T14:30:00","spotify":{"track_name":"Without Me","artist_name":"Halsey","energy":0.46,"valence":0.44,"tempo":110.0},"label":"neutral"},
  {"user_id":"dev_user","heart_rate":66,"steps_last_minute":10,"location_variance":0.000004,"timestamp":"2026-03-16T16:00:00","spotify":{"track_name":"Starboy","artist_name":"The Weeknd","energy":0.59,"valence":0.47,"tempo":186.0},"label":"neutral"},
  {"user_id":"dev_user","heart_rate":71,"steps_last_minute":19,"location_variance":0.000010,"timestamp":"2026-03-17T14:00:00","spotify":{"track_name":"XO","artist_name":"The Weeknd","energy":0.48,"valence":0.43,"tempo":95.0},"label":"neutral"},
  {"user_id":"dev_user","heart_rate":67,"steps_last_minute":11,"location_variance":0.000005,"timestamp":"2026-03-17T16:30:00","spotify":{"track_name":"Earned It","artist_name":"The Weeknd","energy":0.45,"valence":0.38,"tempo":70.0},"label":"neutral"},
  {"user_id":"dev_user","heart_rate":69,"steps_last_minute":13,"location_variance":0.000006,"timestamp":"2026-03-18T13:15:00","spotify":{"track_name":"Die For You","artist_name":"The Weeknd","energy":0.47,"valence":0.41,"tempo":100.0},"label":"neutral"},
  {"user_id":"dev_user","heart_rate":65,"steps_last_minute":8,"location_variance":0.000003,"timestamp":"2026-03-18T17:00:00","spotify":{"track_name":"Call Out My Name","artist_name":"The Weeknd","energy":0.42,"valence":0.35,"tempo":83.0},"label":"neutral"},

  # ════════════════════════════════════════════════════
  # 😤  STRESSED  (20)
  # Elevated HR, rush hour 7–9am, high energy + low valence music.
  # Two archetypes: frozen (stuck on train, low steps) and rushing (sprinting)
  # ════════════════════════════════════════════════════
  {"user_id":"dev_user","heart_rate":118,"steps_last_minute":5,"location_variance":0.00048,"timestamp":"2026-03-09T08:15:00","spotify":{"track_name":"Lose Yourself","artist_name":"Eminem","energy":0.95,"valence":0.31,"tempo":171.0},"label":"stressed"},
  {"user_id":"dev_user","heart_rate":124,"steps_last_minute":3,"location_variance":0.00062,"timestamp":"2026-03-09T08:22:00","spotify":{"track_name":"Till I Collapse","artist_name":"Eminem","energy":0.97,"valence":0.22,"tempo":171.0},"label":"stressed"},
  {"user_id":"dev_user","heart_rate":132,"steps_last_minute":112,"location_variance":0.00091,"timestamp":"2026-03-10T08:07:00","spotify":{"track_name":"Eye of the Tiger","artist_name":"Survivor","energy":0.92,"valence":0.35,"tempo":109.0},"label":"stressed"},
  {"user_id":"dev_user","heart_rate":109,"steps_last_minute":8,"location_variance":0.00039,"timestamp":"2026-03-10T08:44:00","spotify":{"track_name":"Numb","artist_name":"Linkin Park","energy":0.88,"valence":0.18,"tempo":112.0},"label":"stressed"},
  {"user_id":"dev_user","heart_rate":141,"steps_last_minute":128,"location_variance":0.00140,"timestamp":"2026-03-11T08:03:00","spotify":{"track_name":"Thunderstruck","artist_name":"AC/DC","energy":0.94,"valence":0.29,"tempo":133.0},"label":"stressed"},
  {"user_id":"dev_user","heart_rate":127,"steps_last_minute":4,"location_variance":0.00055,"timestamp":"2026-03-11T08:31:00","spotify":{"track_name":"In The End","artist_name":"Linkin Park","energy":0.89,"valence":0.15,"tempo":105.0},"label":"stressed"},
  {"user_id":"dev_user","heart_rate":115,"steps_last_minute":7,"location_variance":0.00043,"timestamp":"2026-03-12T08:18:00","spotify":{"track_name":"Stronger","artist_name":"Kanye West","energy":0.85,"valence":0.37,"tempo":119.0},"label":"stressed"},
  {"user_id":"dev_user","heart_rate":138,"steps_last_minute":97,"location_variance":0.00112,"timestamp":"2026-03-12T08:09:00","spotify":{"track_name":"Run The World","artist_name":"Beyonce","energy":0.91,"valence":0.28,"tempo":127.0},"label":"stressed"},
  {"user_id":"dev_user","heart_rate":103,"steps_last_minute":11,"location_variance":0.00037,"timestamp":"2026-03-13T08:52:00","spotify":{"track_name":"Power","artist_name":"Kanye West","energy":0.90,"valence":0.24,"tempo":90.0},"label":"stressed"},
  {"user_id":"dev_user","heart_rate":121,"steps_last_minute":2,"location_variance":0.00071,"timestamp":"2026-03-13T08:25:00","spotify":{"track_name":"Sicko Mode","artist_name":"Travis Scott","energy":0.87,"valence":0.20,"tempo":155.0},"label":"stressed"},
  {"user_id":"dev_user","heart_rate":134,"steps_last_minute":119,"location_variance":0.00098,"timestamp":"2026-03-14T08:06:00","spotify":{"track_name":"Goosebumps","artist_name":"Travis Scott","energy":0.84,"valence":0.23,"tempo":130.0},"label":"stressed"},
  {"user_id":"dev_user","heart_rate":112,"steps_last_minute":9,"location_variance":0.00041,"timestamp":"2026-03-14T08:38:00","spotify":{"track_name":"Rockstar","artist_name":"Post Malone","energy":0.83,"valence":0.16,"tempo":160.0},"label":"stressed"},
  {"user_id":"dev_user","heart_rate":145,"steps_last_minute":135,"location_variance":0.00180,"timestamp":"2026-03-15T08:02:00","spotify":{"track_name":"Rap God","artist_name":"Eminem","energy":0.96,"valence":0.26,"tempo":154.0},"label":"stressed"},
  {"user_id":"dev_user","heart_rate":108,"steps_last_minute":6,"location_variance":0.00044,"timestamp":"2026-03-15T08:29:00","spotify":{"track_name":"HUMBLE.","artist_name":"Kendrick Lamar","energy":0.89,"valence":0.27,"tempo":150.0},"label":"stressed"},
  {"user_id":"dev_user","heart_rate":129,"steps_last_minute":14,"location_variance":0.00067,"timestamp":"2026-03-16T08:41:00","spotify":{"track_name":"God's Plan","artist_name":"Drake","energy":0.82,"valence":0.32,"tempo":77.0},"label":"stressed"},
  {"user_id":"dev_user","heart_rate":116,"steps_last_minute":88,"location_variance":0.00085,"timestamp":"2026-03-16T08:11:00","spotify":{"track_name":"Not Afraid","artist_name":"Eminem","energy":0.91,"valence":0.25,"tempo":97.0},"label":"stressed"},
  {"user_id":"dev_user","heart_rate":137,"steps_last_minute":4,"location_variance":0.00059,"timestamp":"2026-03-17T08:19:00","spotify":{"track_name":"Monster","artist_name":"Eminem","energy":0.88,"valence":0.19,"tempo":120.0},"label":"stressed"},
  {"user_id":"dev_user","heart_rate":122,"steps_last_minute":102,"location_variance":0.00103,"timestamp":"2026-03-17T08:08:00","spotify":{"track_name":"Without Me","artist_name":"Eminem","energy":0.90,"valence":0.30,"tempo":138.0},"label":"stressed"},
  {"user_id":"dev_user","heart_rate":98,"steps_last_minute":10,"location_variance":0.00035,"timestamp":"2026-03-18T08:47:00","spotify":{"track_name":"Kim","artist_name":"Eminem","energy":0.92,"valence":0.12,"tempo":90.0},"label":"stressed"},
  {"user_id":"dev_user","heart_rate":143,"steps_last_minute":141,"location_variance":0.00165,"timestamp":"2026-03-18T08:04:00","spotify":{"track_name":"Fack","artist_name":"Eminem","energy":0.93,"valence":0.21,"tempo":138.0},"label":"stressed"},

  # ════════════════════════════════════════════════════
  # 😠  ANGRY  (20)
  # Very high HR, high steps, extreme metal/hardcore, near-zero valence
  # ════════════════════════════════════════════════════
  {"user_id":"dev_user","heart_rate":148,"steps_last_minute":88,"location_variance":0.00120,"timestamp":"2026-03-09T09:05:00","spotify":{"track_name":"Break Stuff","artist_name":"Limp Bizkit","energy":0.98,"valence":0.05,"tempo":121.0},"label":"angry"},
  {"user_id":"dev_user","heart_rate":152,"steps_last_minute":102,"location_variance":0.00145,"timestamp":"2026-03-09T17:45:00","spotify":{"track_name":"One Step Closer","artist_name":"Linkin Park","energy":0.97,"valence":0.08,"tempo":97.0},"label":"angry"},
  {"user_id":"dev_user","heart_rate":143,"steps_last_minute":75,"location_variance":0.00098,"timestamp":"2026-03-10T09:15:00","spotify":{"track_name":"Given Up","artist_name":"Linkin Park","energy":0.96,"valence":0.10,"tempo":184.0},"label":"angry"},
  {"user_id":"dev_user","heart_rate":155,"steps_last_minute":115,"location_variance":0.00162,"timestamp":"2026-03-10T17:30:00","spotify":{"track_name":"Killing in the Name","artist_name":"Rage Against the Machine","energy":0.99,"valence":0.04,"tempo":89.0},"label":"angry"},
  {"user_id":"dev_user","heart_rate":138,"steps_last_minute":68,"location_variance":0.00087,"timestamp":"2026-03-11T09:00:00","spotify":{"track_name":"Bulls on Parade","artist_name":"Rage Against the Machine","energy":0.97,"valence":0.06,"tempo":119.0},"label":"angry"},
  {"user_id":"dev_user","heart_rate":149,"steps_last_minute":95,"location_variance":0.00131,"timestamp":"2026-03-11T18:00:00","spotify":{"track_name":"Down With The Sickness","artist_name":"Disturbed","energy":0.96,"valence":0.07,"tempo":107.0},"label":"angry"},
  {"user_id":"dev_user","heart_rate":141,"steps_last_minute":80,"location_variance":0.00108,"timestamp":"2026-03-12T08:55:00","spotify":{"track_name":"Freak on a Leash","artist_name":"Korn","energy":0.95,"valence":0.09,"tempo":88.0},"label":"angry"},
  {"user_id":"dev_user","heart_rate":158,"steps_last_minute":120,"location_variance":0.00175,"timestamp":"2026-03-12T17:50:00","spotify":{"track_name":"Chop Suey!","artist_name":"System of a Down","energy":0.98,"valence":0.05,"tempo":93.0},"label":"angry"},
  {"user_id":"dev_user","heart_rate":136,"steps_last_minute":62,"location_variance":0.00079,"timestamp":"2026-03-13T09:10:00","spotify":{"track_name":"Toxicity","artist_name":"System of a Down","energy":0.94,"valence":0.11,"tempo":152.0},"label":"angry"},
  {"user_id":"dev_user","heart_rate":146,"steps_last_minute":90,"location_variance":0.00122,"timestamp":"2026-03-13T17:40:00","spotify":{"track_name":"Master of Puppets","artist_name":"Metallica","energy":0.97,"valence":0.06,"tempo":212.0},"label":"angry"},
  {"user_id":"dev_user","heart_rate":153,"steps_last_minute":108,"location_variance":0.00150,"timestamp":"2026-03-14T09:00:00","spotify":{"track_name":"Enter Sandman","artist_name":"Metallica","energy":0.96,"valence":0.08,"tempo":123.0},"label":"angry"},
  {"user_id":"dev_user","heart_rate":140,"steps_last_minute":73,"location_variance":0.00095,"timestamp":"2026-03-14T18:05:00","spotify":{"track_name":"Bleed It Out","artist_name":"Linkin Park","energy":0.95,"valence":0.12,"tempo":198.0},"label":"angry"},
  {"user_id":"dev_user","heart_rate":147,"steps_last_minute":92,"location_variance":0.00128,"timestamp":"2026-03-15T08:50:00","spotify":{"track_name":"Crawling","artist_name":"Linkin Park","energy":0.93,"valence":0.09,"tempo":86.0},"label":"angry"},
  {"user_id":"dev_user","heart_rate":160,"steps_last_minute":130,"location_variance":0.00190,"timestamp":"2026-03-15T17:35:00","spotify":{"track_name":"Bodies","artist_name":"Drowning Pool","energy":0.98,"valence":0.05,"tempo":146.0},"label":"angry"},
  {"user_id":"dev_user","heart_rate":134,"steps_last_minute":58,"location_variance":0.00072,"timestamp":"2026-03-16T09:05:00","spotify":{"track_name":"Nightmare","artist_name":"Avenged Sevenfold","energy":0.96,"valence":0.07,"tempo":168.0},"label":"angry"},
  {"user_id":"dev_user","heart_rate":151,"steps_last_minute":100,"location_variance":0.00140,"timestamp":"2026-03-16T17:55:00","spotify":{"track_name":"Hail to the King","artist_name":"Avenged Sevenfold","energy":0.94,"valence":0.10,"tempo":114.0},"label":"angry"},
  {"user_id":"dev_user","heart_rate":144,"steps_last_minute":84,"location_variance":0.00111,"timestamp":"2026-03-17T09:00:00","spotify":{"track_name":"Riot","artist_name":"Three Days Grace","energy":0.97,"valence":0.06,"tempo":156.0},"label":"angry"},
  {"user_id":"dev_user","heart_rate":157,"steps_last_minute":118,"location_variance":0.00168,"timestamp":"2026-03-17T17:45:00","spotify":{"track_name":"Animal I Have Become","artist_name":"Three Days Grace","energy":0.95,"valence":0.08,"tempo":148.0},"label":"angry"},
  {"user_id":"dev_user","heart_rate":139,"steps_last_minute":70,"location_variance":0.00092,"timestamp":"2026-03-18T09:10:00","spotify":{"track_name":"Pain","artist_name":"Three Days Grace","energy":0.93,"valence":0.11,"tempo":114.0},"label":"angry"},
  {"user_id":"dev_user","heart_rate":162,"steps_last_minute":135,"location_variance":0.00200,"timestamp":"2026-03-18T17:50:00","spotify":{"track_name":"I Hate Everything About You","artist_name":"Three Days Grace","energy":0.96,"valence":0.07,"tempo":96.0},"label":"angry"},

  # ════════════════════════════════════════════════════
  # 😢  SAD  (20)
  # Low HR, barely moving, low energy + very low valence music, evenings
  # ════════════════════════════════════════════════════
  {"user_id":"dev_user","heart_rate":59,"steps_last_minute":4,"location_variance":0.000003,"timestamp":"2026-03-09T20:00:00","spotify":{"track_name":"Someone Like You","artist_name":"Adele","energy":0.18,"valence":0.10,"tempo":68.0},"label":"sad"},
  {"user_id":"dev_user","heart_rate":62,"steps_last_minute":7,"location_variance":0.000005,"timestamp":"2026-03-09T21:30:00","spotify":{"track_name":"Fix You","artist_name":"Coldplay","energy":0.22,"valence":0.14,"tempo":69.0},"label":"sad"},
  {"user_id":"dev_user","heart_rate":57,"steps_last_minute":2,"location_variance":0.000001,"timestamp":"2026-03-10T19:45:00","spotify":{"track_name":"The Night We Met","artist_name":"Lord Huron","energy":0.16,"valence":0.08,"tempo":133.0},"label":"sad"},
  {"user_id":"dev_user","heart_rate":63,"steps_last_minute":9,"location_variance":0.000006,"timestamp":"2026-03-10T22:00:00","spotify":{"track_name":"Skinny Love","artist_name":"Bon Iver","energy":0.20,"valence":0.12,"tempo":100.0},"label":"sad"},
  {"user_id":"dev_user","heart_rate":60,"steps_last_minute":5,"location_variance":0.000004,"timestamp":"2026-03-11T20:15:00","spotify":{"track_name":"Liability","artist_name":"Lorde","energy":0.12,"valence":0.07,"tempo":113.0},"label":"sad"},
  {"user_id":"dev_user","heart_rate":55,"steps_last_minute":1,"location_variance":0.000001,"timestamp":"2026-03-11T21:45:00","spotify":{"track_name":"Exile","artist_name":"Taylor Swift","energy":0.24,"valence":0.15,"tempo":77.0},"label":"sad"},
  {"user_id":"dev_user","heart_rate":64,"steps_last_minute":10,"location_variance":0.000007,"timestamp":"2026-03-12T20:00:00","spotify":{"track_name":"idk you yet","artist_name":"Alexander 23","energy":0.28,"valence":0.18,"tempo":87.0},"label":"sad"},
  {"user_id":"dev_user","heart_rate":58,"steps_last_minute":3,"location_variance":0.000002,"timestamp":"2026-03-12T22:30:00","spotify":{"track_name":"Motion Sickness","artist_name":"Phoebe Bridgers","energy":0.19,"valence":0.11,"tempo":128.0},"label":"sad"},
  {"user_id":"dev_user","heart_rate":61,"steps_last_minute":6,"location_variance":0.000004,"timestamp":"2026-03-13T19:30:00","spotify":{"track_name":"Moon Song","artist_name":"Phoebe Bridgers","energy":0.14,"valence":0.09,"tempo":124.0},"label":"sad"},
  {"user_id":"dev_user","heart_rate":56,"steps_last_minute":2,"location_variance":0.000001,"timestamp":"2026-03-13T21:00:00","spotify":{"track_name":"we fell in love in october","artist_name":"girl in red","energy":0.21,"valence":0.13,"tempo":92.0},"label":"sad"},
  {"user_id":"dev_user","heart_rate":65,"steps_last_minute":11,"location_variance":0.000008,"timestamp":"2026-03-14T20:00:00","spotify":{"track_name":"traitor","artist_name":"Olivia Rodrigo","energy":0.25,"valence":0.16,"tempo":70.0},"label":"sad"},
  {"user_id":"dev_user","heart_rate":59,"steps_last_minute":4,"location_variance":0.000003,"timestamp":"2026-03-14T22:00:00","spotify":{"track_name":"All I Want","artist_name":"Olivia Rodrigo","energy":0.17,"valence":0.09,"tempo":76.0},"label":"sad"},
  {"user_id":"dev_user","heart_rate":62,"steps_last_minute":8,"location_variance":0.000005,"timestamp":"2026-03-15T19:45:00","spotify":{"track_name":"deja vu","artist_name":"Olivia Rodrigo","energy":0.37,"valence":0.17,"tempo":118.0},"label":"sad"},
  {"user_id":"dev_user","heart_rate":57,"steps_last_minute":2,"location_variance":0.000001,"timestamp":"2026-03-15T21:30:00","spotify":{"track_name":"1 step forward 3 steps back","artist_name":"Olivia Rodrigo","energy":0.15,"valence":0.10,"tempo":151.0},"label":"sad"},
  {"user_id":"dev_user","heart_rate":60,"steps_last_minute":5,"location_variance":0.000004,"timestamp":"2026-03-16T20:00:00","spotify":{"track_name":"enough for you","artist_name":"Olivia Rodrigo","energy":0.18,"valence":0.11,"tempo":90.0},"label":"sad"},
  {"user_id":"dev_user","heart_rate":63,"steps_last_minute":9,"location_variance":0.000006,"timestamp":"2026-03-16T22:15:00","spotify":{"track_name":"hope ur ok","artist_name":"Olivia Rodrigo","energy":0.26,"valence":0.19,"tempo":80.0},"label":"sad"},
  {"user_id":"dev_user","heart_rate":58,"steps_last_minute":3,"location_variance":0.000002,"timestamp":"2026-03-17T20:00:00","spotify":{"track_name":"The Sound of Silence","artist_name":"Simon and Garfunkel","energy":0.10,"valence":0.07,"tempo":78.0},"label":"sad"},
  {"user_id":"dev_user","heart_rate":61,"steps_last_minute":6,"location_variance":0.000004,"timestamp":"2026-03-17T21:45:00","spotify":{"track_name":"Mad World","artist_name":"Gary Jules","energy":0.09,"valence":0.06,"tempo":88.0},"label":"sad"},
  {"user_id":"dev_user","heart_rate":55,"steps_last_minute":1,"location_variance":0.000001,"timestamp":"2026-03-18T20:30:00","spotify":{"track_name":"Hurt","artist_name":"Johnny Cash","energy":0.14,"valence":0.07,"tempo":57.0},"label":"sad"},
  {"user_id":"dev_user","heart_rate":64,"steps_last_minute":10,"location_variance":0.000007,"timestamp":"2026-03-18T22:00:00","spotify":{"track_name":"River","artist_name":"Joni Mitchell","energy":0.13,"valence":0.08,"tempo":72.0},"label":"sad"},

  # ════════════════════════════════════════════════════
  # 😴  SLEEPY  (20)
  # Very low HR, barely moving, slow ambient music, early morning 6-7am
  # ════════════════════════════════════════════════════
  {"user_id":"dev_user","heart_rate":52,"steps_last_minute":1,"location_variance":0.000001,"timestamp":"2026-03-09T06:30:00","spotify":{"track_name":"Weightless","artist_name":"Marconi Union","energy":0.08,"valence":0.30,"tempo":60.0},"label":"sleepy"},
  {"user_id":"dev_user","heart_rate":55,"steps_last_minute":3,"location_variance":0.000002,"timestamp":"2026-03-09T07:00:00","spotify":{"track_name":"Holocene","artist_name":"Bon Iver","energy":0.12,"valence":0.34,"tempo":104.0},"label":"sleepy"},
  {"user_id":"dev_user","heart_rate":49,"steps_last_minute":0,"location_variance":0.000000,"timestamp":"2026-03-10T06:15:00","spotify":{"track_name":"Re: Stacks","artist_name":"Bon Iver","energy":0.10,"valence":0.27,"tempo":90.0},"label":"sleepy"},
  {"user_id":"dev_user","heart_rate":58,"steps_last_minute":4,"location_variance":0.000003,"timestamp":"2026-03-10T07:20:00","spotify":{"track_name":"Slow Burn","artist_name":"Kacey Musgraves","energy":0.14,"valence":0.40,"tempo":76.0},"label":"sleepy"},
  {"user_id":"dev_user","heart_rate":51,"steps_last_minute":1,"location_variance":0.000001,"timestamp":"2026-03-11T06:00:00","spotify":{"track_name":"Woods","artist_name":"Bon Iver","energy":0.09,"valence":0.28,"tempo":80.0},"label":"sleepy"},
  {"user_id":"dev_user","heart_rate":54,"steps_last_minute":2,"location_variance":0.000001,"timestamp":"2026-03-11T07:10:00","spotify":{"track_name":"Intro","artist_name":"The xx","energy":0.11,"valence":0.25,"tempo":86.0},"label":"sleepy"},
  {"user_id":"dev_user","heart_rate":48,"steps_last_minute":0,"location_variance":0.000000,"timestamp":"2026-03-12T06:45:00","spotify":{"track_name":"Islands","artist_name":"The xx","energy":0.07,"valence":0.32,"tempo":73.0},"label":"sleepy"},
  {"user_id":"dev_user","heart_rate":57,"steps_last_minute":3,"location_variance":0.000002,"timestamp":"2026-03-12T07:30:00","spotify":{"track_name":"Crystalised","artist_name":"The xx","energy":0.13,"valence":0.26,"tempo":73.0},"label":"sleepy"},
  {"user_id":"dev_user","heart_rate":53,"steps_last_minute":1,"location_variance":0.000001,"timestamp":"2026-03-13T06:20:00","spotify":{"track_name":"Angels","artist_name":"The xx","energy":0.10,"valence":0.29,"tempo":74.0},"label":"sleepy"},
  {"user_id":"dev_user","heart_rate":50,"steps_last_minute":0,"location_variance":0.000000,"timestamp":"2026-03-13T07:05:00","spotify":{"track_name":"Night Owl","artist_name":"Galimatias","energy":0.08,"valence":0.35,"tempo":71.0},"label":"sleepy"},
  {"user_id":"dev_user","heart_rate":56,"steps_last_minute":2,"location_variance":0.000001,"timestamp":"2026-03-14T06:30:00","spotify":{"track_name":"Lua","artist_name":"Bright Eyes","energy":0.12,"valence":0.23,"tempo":63.0},"label":"sleepy"},
  {"user_id":"dev_user","heart_rate":59,"steps_last_minute":5,"location_variance":0.000003,"timestamp":"2026-03-14T07:15:00","spotify":{"track_name":"First Day of My Life","artist_name":"Bright Eyes","energy":0.11,"valence":0.38,"tempo":87.0},"label":"sleepy"},
  {"user_id":"dev_user","heart_rate":47,"steps_last_minute":0,"location_variance":0.000000,"timestamp":"2026-03-15T06:00:00","spotify":{"track_name":"Retrograde","artist_name":"James Blake","energy":0.09,"valence":0.24,"tempo":79.0},"label":"sleepy"},
  {"user_id":"dev_user","heart_rate":54,"steps_last_minute":2,"location_variance":0.000001,"timestamp":"2026-03-15T07:00:00","spotify":{"track_name":"Limit to Your Love","artist_name":"James Blake","energy":0.10,"valence":0.26,"tempo":62.0},"label":"sleepy"},
  {"user_id":"dev_user","heart_rate":52,"steps_last_minute":1,"location_variance":0.000001,"timestamp":"2026-03-16T06:45:00","spotify":{"track_name":"A Case of You","artist_name":"Joni Mitchell","energy":0.11,"valence":0.31,"tempo":92.0},"label":"sleepy"},
  {"user_id":"dev_user","heart_rate":55,"steps_last_minute":3,"location_variance":0.000002,"timestamp":"2026-03-16T07:20:00","spotify":{"track_name":"River","artist_name":"Leon Bridges","energy":0.16,"valence":0.31,"tempo":64.0},"label":"sleepy"},
  {"user_id":"dev_user","heart_rate":50,"steps_last_minute":1,"location_variance":0.000001,"timestamp":"2026-03-17T06:30:00","spotify":{"track_name":"Dream a Little Dream","artist_name":"Ella Fitzgerald","energy":0.07,"valence":0.33,"tempo":85.0},"label":"sleepy"},
  {"user_id":"dev_user","heart_rate":58,"steps_last_minute":4,"location_variance":0.000003,"timestamp":"2026-03-17T07:10:00","spotify":{"track_name":"Clair de Lune","artist_name":"Debussy","energy":0.06,"valence":0.29,"tempo":60.0},"label":"sleepy"},
  {"user_id":"dev_user","heart_rate":46,"steps_last_minute":0,"location_variance":0.000000,"timestamp":"2026-03-18T06:15:00","spotify":{"track_name":"Experience","artist_name":"Ludovico Einaudi","energy":0.05,"valence":0.27,"tempo":56.0},"label":"sleepy"},
  {"user_id":"dev_user","heart_rate":53,"steps_last_minute":2,"location_variance":0.000001,"timestamp":"2026-03-18T07:00:00","spotify":{"track_name":"Nuvole Bianche","artist_name":"Ludovico Einaudi","energy":0.08,"valence":0.32,"tempo":60.0},"label":"sleepy"},
]


def clear():
    import os
    from core.config import DB_PATH
    print("🗑  Clearing existing DB...")
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
        print(f"   Deleted {DB_PATH}")
    else:
        print("   DB was already empty")


def seed():
    counts = {}
    print(f"\n📦 Posting {len(SAMPLES)} samples...\n")
    for i, s in enumerate(SAMPLES):
        requests.post(f"{BASE}/api/health/snapshot", json=s, timeout=5).raise_for_status()
        m = s["label"]
        counts[m] = counts.get(m, 0) + 1
        track = s.get("spotify", {}).get("track_name", "")
        print(f"  [{i+1:03d}] {E[m]} {m:10s}  HR={s['heart_rate']:3d}  steps={s['steps_last_minute']:3d}  🎵 {track}")
    print(f"\n📊 Per-mood:")
    for mood in ["happy","neutral","stressed","angry","sad","sleepy"]:
        print(f"   {E[mood]} {mood:12s}: {counts.get(mood,0)}")


def train():
    print("\n🤖 Training model...")
    r = requests.post(f"{BASE}/api/ml/train", json={"min_samples": 1}, timeout=30)
    r.raise_for_status()
    res = r.json()
    f1  = res.get("cv_f1_weighted_mean", res.get("cv_f1_mean", "?"))
    std = res.get("cv_f1_weighted_std",  res.get("cv_f1_std",  "?"))
    print(f"\n✅ Done! {res['total_samples']} samples  ({res['real_samples']} real + {res['synthetic_samples']} synthetic)")
    print(f"   F1 weighted: {f1} ± {std}")


def test():
    print("\n🧪 Smoke test — one sample per mood:\n")
    cases = [
        ("😊 happy",    {"user_id":"dev_user","heart_rate":80, "steps_last_minute":50,"location_variance":0.000038,"timestamp":"2026-03-09T11:00:00","spotify":{"energy":0.82,"valence":0.93,"tempo":115.0}}),
        ("😐 neutral",  {"user_id":"dev_user","heart_rate":68, "steps_last_minute":12,"location_variance":0.000005,"timestamp":"2026-03-09T14:00:00","spotify":{"energy":0.45,"valence":0.50,"tempo":100.0}}),
        ("😤 stressed", {"user_id":"dev_user","heart_rate":122,"steps_last_minute":5, "location_variance":0.00055, "timestamp":"2026-03-09T08:20:00","spotify":{"energy":0.92,"valence":0.25,"tempo":165.0}}),
        ("😠 angry",    {"user_id":"dev_user","heart_rate":155,"steps_last_minute":110,"location_variance":0.00155,"timestamp":"2026-03-09T17:45:00","spotify":{"energy":0.98,"valence":0.05,"tempo":125.0}}),
        ("😢 sad",      {"user_id":"dev_user","heart_rate":58, "steps_last_minute":3, "location_variance":0.000002,"timestamp":"2026-03-09T21:00:00","spotify":{"energy":0.16,"valence":0.09,"tempo":70.0}}),
        ("😴 sleepy",   {"user_id":"dev_user","heart_rate":51, "steps_last_minute":1, "location_variance":0.000001,"timestamp":"2026-03-09T06:30:00","spotify":{"energy":0.09,"valence":0.30,"tempo":65.0}}),
    ]
    ok = 0
    for label, payload in cases:
        res  = requests.post(f"{BASE}/api/ml/predict", json=payload, timeout=5).json()
        got  = res.get("mood","?")
        conf = res.get("confidence", 0)
        exp  = label.split()[1]
        icon = "✅" if got == exp else "❌"
        if got == exp:
            ok += 1
        print(f"  {icon}  Expected {label:20s}  Got: {res.get('emoji','')} {got} ({conf:.0%})")
    print(f"\n  {ok}/6 correct\n")


if __name__ == "__main__":
    print("=" * 55)
    print("  Commute Buddy — Seed & Train v2  (6 moods)")
    print("=" * 55)
    try:
        requests.get(BASE, timeout=3)
    except Exception:
        print("\n❌ Server offline. Run: uvicorn main:app --reload")
        raise SystemExit(1)

    clear()
    seed()
    train()
    test()
    print("🏁 Done! → http://localhost:8000/view/health")