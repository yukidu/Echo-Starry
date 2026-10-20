"""S3-B07 local concurrency proof (real SQLite writers, no HTTP or cloud)."""
import concurrent.futures
import datetime
import json
import sqlite3
import subprocess
import sys
import tempfile
import time
from pathlib import Path

with tempfile.TemporaryDirectory(prefix="s3-claim-local-") as folder:
    dbfile = str(Path(folder) / "dummy.sqlite")
    subprocess.run([sys.executable, "tests/b07-s3-fake-d1.py", dbfile, "init"],
                   check=True, capture_output=True, text=True)
    callid = "b07-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    day = datetime.datetime.now(datetime.timezone.utc).date().isoformat()
    current = int(time.time() * 1000)
    connection = sqlite3.connect(dbfile, timeout=20)
    connection.execute("PRAGMA busy_timeout=20000")
    for scope in ("global", "member:default", "app:echostars", "task:echostars:echo.qa"):
        connection.execute("UPDATE starry_ai_b07_policies SET max_calls=1000,max_micro_twd=100000 WHERE scope_key=?", (scope,))
    connection.execute("""INSERT INTO starry_ai_b07_calls(
     id,request_key,fingerprint,day,app_id,task_id,member_key,model_id,
     billing_class,status,max_units,unit_micro_twd,held_micro_twd,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,'reserved',?,?,?,?,?)""",
     (callid, "s3-threaded-request", "b"*64, day, "echostars", "echo.qa", "a"*64,
      "@cf/fake/priced", "priced", 6, 2, 12, current, current))
    connection.execute("""INSERT INTO starry_ai_b07_s3_run_plans
     (request_id,fingerprint,segment_count,max_attempts_per_segment,max_units_per_attempt,created_at)
     VALUES (?,?,?,?,?,?)""", (callid, "b"*64, 1, 3, 2, current))
    connection.commit()
    connection.close()

    def claim_once(index):
        db = sqlite3.connect(dbfile, timeout=25, isolation_level=None)
        db.execute("PRAGMA busy_timeout=25000")
        try:
            cursor = db.execute("""INSERT OR IGNORE INTO starry_ai_b07_s3_attempts
            (attempt_key,request_id,segment_index,attempt_ordinal,max_units,status,created_at,updated_at)
            VALUES (?, ?, 0, 0, 2, 'may_have_sent', ?, ?)""",
            ("s3:"+callid+":0:0", callid, current+index, current+index))
            return max(0, cursor.rowcount)
        except sqlite3.IntegrityError:
            return 0
        finally:
            db.close()

    # 80 truly concurrent SQLite writer attempts, at most 12 test threads.
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        claimed = list(pool.map(claim_once, range(80)))
    assert sum(claimed) == 1, f"duplicate provider tickets: {sum(claimed)}"

    # Provider timeout: append 'uncertain' and hold the complete run reservation.
    db = sqlite3.connect(dbfile, timeout=10)
    db.execute("""UPDATE starry_ai_b07_s3_attempts SET status='uncertain',updated_at=?
                  WHERE request_id=? AND status='may_have_sent'""", (current+100, callid))
    db.execute("""UPDATE starry_ai_b07_calls SET status='uncertain',updated_at=?
                  WHERE id=? AND status='reserved'""", (current+101, callid))
    db.commit()
    db.close()

    def reconcile_once(index):
        db = sqlite3.connect(dbfile, timeout=25, isolation_level=None)
        db.execute("PRAGMA busy_timeout=25000")
        try:
            row = db.execute("""INSERT OR IGNORE INTO starry_ai_b07_s3_reconciliations
              (id,request_id,evidence_source,evidence_digest,first_reviewer,second_reviewer,
               actual_units,settled_micro_twd,released_micro_twd,created_at)
              VALUES (?,?,'provider_invoice',?,'fake-one-001','fake-two-002',1,2,10,?)""",
              ("s3rec:"+callid,callid,"c"*64,current+index))
            return max(0,row.rowcount)
        except sqlite3.IntegrityError:
            return 0
        finally:
            db.close()

    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        reconciled = list(pool.map(reconcile_once, range(80)))
    assert sum(reconciled)==1, f"duplicate invoice adjustments: {sum(reconciled)}"
    db=sqlite3.connect(dbfile)
    try:
        row=db.execute("SELECT calls,held_micro_twd,settled_micro_twd FROM starry_ai_b07_usage WHERE day=? AND scope_key='global'", (day,)).fetchone()
        assert row==(1,0,2), f"hold or amount was adjusted twice: {row}"
        assert db.execute("SELECT status FROM starry_ai_b07_calls WHERE id=?", (callid,)).fetchone()[0]=='uncertain'
    finally:
        db.close()
print("S3_SQLITE_CONCURRENT_OK " + json.dumps({
  "parallelSQLiteSubmissions":80,"maxTestThreads":12,
  "providerTicketsGranted":sum(claimed),"reconciliationSubmissions":80,
  "invoiceAdjustments":sum(reconciled),"realProviderCalls":0
}))
