#!/usr/bin/env python3
"""Private, offline SQLite backend for the B07 local HTTP virtual-user harness.

STDIN/STDOUT are line-delimited JSON. No Cloudflare bindings, API keys,
member records, external network, paid models, or production data.
The REAL proposed B07 D1 migration SQL is executed against a temporary SQLite file.
"""
import hashlib
import json
import sqlite3
import sys
import time
import uuid
from pathlib import Path

if len(sys.argv) != 2 or not str(sys.argv[1]).endswith(".sqlite"):
    raise SystemExit("offline test database file required")
db = sqlite3.connect(sys.argv[1], isolation_level=None)
db.execute("PRAGMA busy_timeout=10000")
db.execute("CREATE TABLE starry_ai_models (model_id TEXT PRIMARY KEY, registry_status TEXT, free_eligibility TEXT, tasks_json TEXT)")
free_model = "@cf/fake/offline-free"
paid_model = "@cf/fake/offline-paid"
db.executemany("INSERT INTO starry_ai_models VALUES(?,?,?,?)", [
    (free_model, "verified", "eligible", '["echo.qa"]'),
    (paid_model, "verified", "not_eligible", '["echo.qa"]')
])
db.executescript(Path("starry-id/migrations/20261020_ai_b07_budget_guard.sql").read_text(encoding="utf-8"))
now = int(time.time()*1000)
db.executemany("INSERT INTO starry_ai_b07_tariffs VALUES(?,?,?,?,?,?,?)", [
    (free_model, "free_verified", 0, 300, "https://example.invalid/test-only", now-1000, now+3600_000),
    (paid_model, "priced", 1000, 0, "https://example.invalid/test-only", now-1000, now+3600_000)
])
db.executemany("""INSERT OR REPLACE INTO starry_ai_b07_policies
 (scope_key,enabled,max_calls,max_micro_twd,revision,actor_id,updated_at)
 VALUES (?,1,?,0,1,'offline-test',?)""", [
    ("global", 500, now),
    ("app:echostars", 450, now),
    ("task:echostars:echo.qa", 400, now),
    ("member:default", 2, now)
])
day = time.strftime("%Y-%m-%d", time.gmtime())
def result(message):
    sys.stdout.write(json.dumps(message, separators=(",", ":")) + "\n")
    sys.stdout.flush()
def reserve(command):
    fake_user = str(command.get("user", ""))
    request_key = str(command.get("requestKey", ""))
    mode = str(command.get("mode", "free"))
    if not fake_user.startswith("fake-member-") or len(fake_user) > 60 or not request_key.startswith("local-"):
        return {"accepted": False, "reason": "invalid_fake_request"}
    member_key = hashlib.sha256(fake_user.encode()).hexdigest()
    fingerprint = hashlib.sha256((request_key+"|"+fake_user+"|"+mode).encode()).hexdigest()
    exists = db.execute("SELECT fingerprint,status FROM starry_ai_b07_calls WHERE request_key=?", (request_key,)).fetchone()
    if exists:
        return {"accepted": False, "duplicate": exists[0] == fingerprint,
                "reason": "duplicate" if exists[0] == fingerprint else "fingerprint_conflict"}
    model_id = free_model if mode == "free" else paid_model if mode == "paid" else "no-model"
    billing = "free_verified" if mode == "free" else "priced"
    price = 0 if mode == "free" else 1000
    req_id = "b07-" + str(uuid.uuid4())
    try:
        db.execute("""INSERT OR IGNORE INTO starry_ai_b07_calls
          (id,request_key,fingerprint,day,app_id,task_id,member_key,model_id,
           billing_class,status,max_units,unit_micro_twd,held_micro_twd,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,'reserved',?,?,?,?,?)""",
          (req_id,request_key,fingerprint,day,"echostars","echo.qa",member_key,model_id,
           billing,1,price,price,now,now))
        created = db.execute("SELECT changes()").fetchone()[0]
        return {"accepted": created == 1, "reason": "reserved" if created == 1 else "duplicate"}
    except sqlite3.IntegrityError:
        return {"accepted": False, "reason": "budget_or_verification_rejected"}
def summary():
    rows = db.execute("SELECT scope_key,calls,held_micro_twd,settled_micro_twd,free_units FROM starry_ai_b07_usage WHERE day=?",(day,)).fetchall()
    mapping = {r[0]: {"calls":r[1],"held":r[2],"settled":r[3],"freeUnits":r[4]} for r in rows}
    return {"rows": db.execute("SELECT count(*) FROM starry_ai_b07_calls").fetchone()[0],
            "events": db.execute("SELECT count(*) FROM starry_ai_b07_events").fetchone()[0],
            "scopes": {k: mapping.get(k) for k in ["global","app:echostars","task:echostars:echo.qa","free:"+free_model]}}
for line in sys.stdin:
    try:
        command=json.loads(line)
        action=command.get("action")
        if action == "reserve":
            output=reserve(command)
        elif action == "summary":
            output=summary()
        else:
            output={"error":"unsupported_action"}
        result({"id":command.get("id"),**output})
    except Exception as e:
        result({"id":command.get("id"),"error":"offline_backend_error", "errorType":type(e).__name__})
db.close()
