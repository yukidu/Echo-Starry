#!/usr/bin/env python3
"""Actual SQLite concurrency and transaction safety tests for the B07 D1 migration.
Local temporary databases only. No Cloudflare credentials, provider APIs, or production writes.
"""
import concurrent.futures
import hashlib
import pathlib
import sqlite3
import tempfile
import time
import uuid

SCHEMA=pathlib.Path("starry-id/migrations/20261020_ai_b07_budget_guard.sql").read_text()
NOW=int(time.time()*1000)
DAY=time.strftime("%Y-%m-%d",time.gmtime())
MODEL_FREE="@cf/test/free-confirmed"
MODEL_PAID="@cf/test/paid-confirmed"
TASK="echo.qa"
APP="echostars"

def conn(path):
    c=sqlite3.connect(path,timeout=30,isolation_level=None)
    c.execute("PRAGMA busy_timeout=30000")
    c.execute("PRAGMA foreign_keys=ON")
    return c

def initialise(path,free_units=300,global_calls=600,cap=0):
    db=conn(path)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("CREATE TABLE starry_ai_models (model_id TEXT PRIMARY KEY,registry_status TEXT,free_eligibility TEXT,tasks_json TEXT)")
    db.execute("INSERT INTO starry_ai_models VALUES(?,?,?,?)",(MODEL_FREE,"verified","eligible",'["echo.qa"]'))
    db.execute("INSERT INTO starry_ai_models VALUES(?,?,?,?)",(MODEL_PAID,"verified","not_eligible",'["echo.qa"]'))
    db.executescript(SCHEMA)
    db.executemany("INSERT INTO starry_ai_b07_tariffs VALUES(?,?,?,?,?,?,?)",[
        (MODEL_FREE,"free_verified",0,free_units,"https://example.test/official",NOW-1000,NOW+7200000),
        (MODEL_PAID,"priced",1000,0,"https://example.test/official",NOW-1000,NOW+7200000)
    ])
    db.executemany("""INSERT OR REPLACE INTO starry_ai_b07_policies
      (scope_key,enabled,max_calls,max_micro_twd,revision,actor_id,updated_at)
      VALUES (?,1,?,?,1,'test',?)""",[
        ("global",global_calls,cap,NOW),
        ("app:"+APP,global_calls,cap,NOW),
        ("task:"+APP+":"+TASK,global_calls,cap,NOW),
        ("member:default",20,cap,NOW)
    ])
    db.close()

def attempt(path,i,model=MODEL_FREE,units=2,key=None,member=None):
    key=key or "req-"+str(i).zfill(8)
    member=member or hashlib.sha256(str(i).encode()).hexdigest()
    unit_cost=0 if model==MODEL_FREE else 1000
    c=conn(path)
    try:
      c.execute("""INSERT OR IGNORE INTO starry_ai_b07_calls
      (id,request_key,fingerprint,day,app_id,task_id,member_key,model_id,
       billing_class,status,max_units,unit_micro_twd,held_micro_twd,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,'reserved',?,?,?,?,?)""",(
        "b07-"+str(uuid.uuid4()),key,hashlib.sha256(key.encode()).hexdigest(),DAY,
        APP,TASK,member,model,"free_verified" if model==MODEL_FREE else "priced",
        units,unit_cost,units*unit_cost,NOW,NOW
      ))
      return c.execute("SELECT changes()").fetchone()[0]
    except sqlite3.IntegrityError:
      return 0
    finally:
      c.close()

def counts(path):
    c=conn(path)
    n=c.execute("SELECT COUNT(*) FROM starry_ai_b07_calls").fetchone()[0]
    scopes=c.execute("SELECT scope_key,calls,held_micro_twd,settled_micro_twd,free_units FROM starry_ai_b07_usage WHERE day=?",(DAY,)).fetchall()
    events=c.execute("SELECT COUNT(*) FROM starry_ai_b07_events").fetchone()[0]
    c.close()
    return n,{s[0]:s[1:] for s in scopes},events

with tempfile.TemporaryDirectory() as d:
    path=str(pathlib.Path(d)/"test.sqlite")
    initialise(path,free_units=300,global_calls=600,cap=0)
    assert attempt(path,0,MODEL_FREE)==1, "confirmed free should work when money cap is zero"
    assert attempt(path,1,MODEL_PAID)==0, "paid request must fail at zero money budget"
    assert attempt(path,2,"unverified")==0, "unknown tariff must fail closed"
    # 2,000 DISTINCT SUBMISSIONS through at most 12 concurrent worker threads.\n    # This is NOT a test of 2,000 simultaneously connected users or Cloudflare capacity.
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
      responses=list(pool.map(lambda i:attempt(path,i+1000),range(2000)))
    count,scope,events=counts(path)
    assert sum(responses)==149,(sum(responses),scope)
    assert count==150,(count,scope)
    assert scope["global"][0]==150,scope
    assert scope["free:"+MODEL_FREE][3]==300,scope
    assert scope["global"][1]==0,"zero paid costs may remain zero"
    assert events==150,"one reservation event per unique accepted request"
    print("free_capacity: 2000 submissions / <=12 threads; exactly 150 accepted, no oversubscription")

    # Duplicate requests should not create extra charges, even during concurrent calls.
    repeated="same-request-0001"
    c=conn(path)
    c.execute("UPDATE starry_ai_b07_policies SET max_calls=650 WHERE scope_key IN ('global','app:echostars','task:echostars:echo.qa')")
    c.execute("UPDATE starry_ai_b07_tariffs SET daily_free_units=500 WHERE model_id=?",(MODEL_FREE,))
    c.close()
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
      tries=list(pool.map(lambda _:attempt(path,9999,key=repeated),range(80)))
    assert sum(tries)==1,tries
    count,scope,events=counts(path)
    assert scope["global"][0]==151,(count,scope)
    assert events==151
    print("idempotency: 80 duplicate parallel calls create only 1 reservation")

    # Paid cap stays safe for 2,000 submissions dispatched by up to 12 worker threads.
    paid=str(pathlib.Path(d)/"paid.sqlite")
    initialise(paid,free_units=300,global_calls=500,cap=5000)
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
      accepted=list(pool.map(lambda i:attempt(paid,i+20000,MODEL_PAID,1),range(2000)))
    n,scope,e=counts(paid)
    assert sum(accepted)==5 and n==5,(sum(accepted),n,scope)
    assert scope["global"][1]==5000
    assert scope["global"][2]==0
    print("paid_cap: 2000 submissions / <=12 threads; 5 accepted against 5000 micro-TWD")

    c=conn(paid)
    first=c.execute("SELECT id FROM starry_ai_b07_calls ORDER BY request_key LIMIT 1").fetchone()[0]
    c.execute("UPDATE starry_ai_b07_policies SET max_calls=0,max_micro_twd=0 WHERE scope_key='global'")
    c.execute("UPDATE starry_ai_b07_calls SET status='settled',actual_units=1,actual_micro_twd=1000,updated_at=? WHERE id=?",(NOW+10,first))
    global_scope=c.execute("SELECT held_micro_twd,settled_micro_twd FROM starry_ai_b07_usage WHERE scope_key='global'").fetchone()
    assert global_scope==(4000,1000),global_scope
    try:
        c.execute("UPDATE starry_ai_b07_calls SET status='void' WHERE id=?",(first,))
        raise AssertionError("settled transaction must be terminal")
    except sqlite3.IntegrityError: pass
    second=c.execute("SELECT id FROM starry_ai_b07_calls WHERE id<>? LIMIT 1",(first,)).fetchone()[0]
    c.execute("UPDATE starry_ai_b07_calls SET status='uncertain',updated_at=? WHERE id=?",(NOW+10,second))
    after=c.execute("SELECT held_micro_twd,settled_micro_twd FROM starry_ai_b07_usage WHERE scope_key='global'").fetchone()
    assert after==global_scope,"unconfirmed provider outcomes must keep the full hold"
    assert c.execute("SELECT COUNT(*) FROM starry_ai_b07_events WHERE action='uncertain'").fetchone()[0]==1
    c.close()
    print("settlement: hold release, immutable settled state, uncertain hold preserved after policy tightening")


    # A stricter 20-call MEMBER budget overrides a permissive 2,000-call app/global budget.
    member_db=str(pathlib.Path(d)/"members.sqlite")
    initialise(member_db,free_units=1000,global_calls=2000,cap=0)
    same_person=hashlib.sha256(b"example-member").hexdigest()
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
      tries=list(pool.map(lambda i:attempt(member_db,i+30000,MODEL_FREE,1,member=same_person),range(200)))
    n,scope,e=counts(member_db)
    assert sum(tries)==20 and n==20,(sum(tries),n)
    assert scope["member:"+same_person][0]==20
    assert scope["task:echostars:echo.qa"][0]==20
    assert scope["app:echostars"][0]==20
    assert scope["global"][0]==20
    assert e==20
    print("four_scopes: 200 requests / <=12 threads, default member cap enforces 20")

    # Model circuit-breaker must stop new reservations even with free units available.
    circuit_db=str(pathlib.Path(d)/"circuit.sqlite")
    initialise(circuit_db,free_units=1000,global_calls=2000,cap=0)
    c=conn(circuit_db)
    c.execute("INSERT INTO starry_ai_b07_circuits VALUES (?,?,?,?,?)",
        (MODEL_FREE,3,NOW+3_600_000,"provider_error",NOW))
    c.close()
    assert attempt(circuit_db,80000,MODEL_FREE,1)==0
    assert counts(circuit_db)[0]==0
    print("circuit_breaker: blocked model cannot reserve even verified free units")

    # Tampering may not alter price, request identity or history after a hold.
    tamper_db=str(pathlib.Path(d)/"tamper.sqlite")
    initialise(tamper_db,free_units=1000,global_calls=2000,cap=5000)
    assert attempt(tamper_db,99000,MODEL_PAID,1)==1
    c=conn(tamper_db)
    rid=c.execute("SELECT id FROM starry_ai_b07_calls").fetchone()[0]
    for sql in [
      "UPDATE starry_ai_b07_calls SET held_micro_twd=0 WHERE id=?",
      "UPDATE starry_ai_b07_calls SET request_key='replayed-id' WHERE id=?",
      "DELETE FROM starry_ai_b07_calls WHERE id=?",
      "UPDATE starry_ai_b07_calls SET status='settled',actual_units=1,actual_micro_twd=0 WHERE id=?"
    ]:
      try:
        c.execute(sql,(rid,))
        raise AssertionError("must reject tampering: "+sql)
      except sqlite3.IntegrityError:
        pass
    assert c.execute("SELECT COUNT(*) FROM starry_ai_b07_calls").fetchone()[0]==1
    assert c.execute("SELECT held_micro_twd FROM starry_ai_b07_usage WHERE scope_key='global'").fetchone()[0]==1000
    c.close()
    print("immutable_transactions: identity, reserved amounts and history cannot be rewritten/deleted")

print("B07_SQLITE_SAFETY_OK")
