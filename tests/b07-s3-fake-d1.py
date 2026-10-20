"""Purely local SQLite driver for S3 B07 tests; no network or provider SDK."""
import json
import sqlite3
import sys
from pathlib import Path

db_file = sys.argv[1]
action = sys.argv[2]
connection = sqlite3.connect(db_file, timeout=10)
connection.row_factory = sqlite3.Row
try:
    if action == "init":
        connection.execute("CREATE TABLE starry_ai_models (model_id TEXT PRIMARY KEY, registry_status TEXT, free_eligibility TEXT, tasks_json TEXT)")
        connection.executemany(
            "INSERT INTO starry_ai_models VALUES(?,?,?,?)",
            [
                ("@cf/fake/priced", "verified", "not_eligible", '["echo.qa"]'),
                ("@cf/fake/free", "verified", "eligible", '["echo.qa"]'),
            ],
        )
        connection.commit()
        base = Path("starry-id/migrations/20261020_ai_b07_budget_guard.sql").read_text(encoding="utf8")
        extension = Path("starry-id/migrations/20261020_ai_b07_s3_attempt_guard.sql").read_text(encoding="utf8")
        connection.executescript(base)
        connection.executescript(extension)
        now = 1900000000000
        connection.executemany(
            "INSERT INTO starry_ai_b07_tariffs VALUES (?,?,?,?,?,?,?)",
            [
                ("@cf/fake/priced", "priced", 2, 0, "local-fake-source", 1000000000000, now),
                ("@cf/fake/free", "free_verified", 0, 50, "local-fake-source", 1000000000000, now),
            ],
        )
        for scope in ("global", "member:default", "app:echostars", "task:echostars:echo.qa"):
            connection.execute(
                """INSERT INTO starry_ai_b07_policies
                   (scope_key,enabled,max_calls,max_micro_twd,actor_id,updated_at)
                   VALUES(?,1,100,0,'fake-test',0)
                   ON CONFLICT(scope_key) DO UPDATE
                   SET max_calls=100,max_micro_twd=0""", (scope,)
            )
        connection.commit()
        print(json.dumps({"initialized": True}))
    elif action == "exec":
        payload = json.load(sys.stdin)
        sql, params, mode = payload["sql"], payload.get("args", []), payload["mode"]
        cursor = connection.execute(sql, params)
        if mode == "first":
            row = cursor.fetchone()
            output = {"row": dict(row) if row else None}
        elif mode == "all":
            output = {"rows": [dict(x) for x in cursor.fetchall()]}
        else:
            output = {"meta": {"changes": max(0, cursor.rowcount)}}
        connection.commit()
        print(json.dumps(output, ensure_ascii=False))
    else:
        sys.exit("invalid test command")
finally:
    connection.close()
