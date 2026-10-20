"""S2367A B07-I1 full offline Gate2/B07 integration experiment.

Uses exactly ONE copy of the existing #464 B07 base + S3 migrations,
and a TEST-ONLY, durable, separate source-identity gate. No cloud/AI/keys.
Echo and central ID use separate SQLite files. The fake gate schema is NOT
a proposed production migration; a real integration needs another approval.
"""
from __future__ import annotations
import concurrent.futures
from contextlib import closing
import datetime
import hashlib
import json
import sqlite3
import tempfile
import threading
import time
import uuid
from pathlib import Path

BASE = "starry-id/migrations/20261020_ai_b07_budget_guard.sql"
S3 = "starry-id/migrations/20261020_ai_b07_s3_attempt_guard.sql"
MODEL = "@cf/fake/priced"
FREE_MODEL = "@cf/fake/free"
NOW = int(time.time()*1000)
DAY = datetime.datetime.now(datetime.timezone.utc).date().isoformat()
OPAQUE_MEMBER = "a"*64

def h(*values):
    return hashlib.sha256(json.dumps(list(values), separators=(",",":"), ensure_ascii=False).encode()).hexdigest()

def identity(track, etag, grant, segment, model=MODEL):
    return h("B07-I1:source:approval:segment:v1",track,etag,grant,segment,model)

def run_identity(track,etag,grant,model=MODEL):
    return h("B07-I1:run:approval:v1",track,etag,grant,model)

def open_db(path):
    db=sqlite3.connect(path,timeout=20,isolation_level=None)
    db.execute("PRAGMA busy_timeout=20000")
    db.execute("PRAGMA foreign_keys=ON")
    return db

class FakeEnvironment:
    def __init__(self, folder, cap=5000, money=500000):
        self.central=str(Path(folder)/"fake-central.sqlite")
        self.echo=str(Path(folder)/"fake-echo.sqlite")
        self.sends=0
        self.count_lock=threading.Lock()
        db=open_db(self.central)
        db.execute("CREATE TABLE starry_ai_models (model_id TEXT PRIMARY KEY, registry_status TEXT, free_eligibility TEXT, tasks_json TEXT)")
        db.executemany("INSERT INTO starry_ai_models VALUES(?,?,?,?)",[
            (MODEL,"verified","not_eligible",'["echo.qa"]'),
            (FREE_MODEL,"verified","eligible",'["echo.qa"]')])
        db.executescript(Path(BASE).read_text())
        db.executescript(Path(S3).read_text())
        db.execute("""CREATE TABLE fake_b07_i1_runs(
           identity_digest TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE,
           run_id TEXT NOT NULL, source_etag TEXT NOT NULL,
           grant TEXT NOT NULL, segment_count INTEGER NOT NULL, day TEXT NOT NULL)""")
        db.execute("""CREATE TABLE fake_b07_i1_segments(
           identity_digest TEXT PRIMARY KEY, request_id TEXT NOT NULL,
           segment_index INTEGER NOT NULL, provider_state TEXT NOT NULL
             CHECK(provider_state IN ('may_have_sent','settled','uncertain')),
           UNIQUE(request_id,segment_index))""")
        db.executemany("INSERT INTO starry_ai_b07_tariffs VALUES(?,?,?,?,?,?,?)", [
            (MODEL,"priced",2,0,"FAKE-OFFLINE",NOW-100000,NOW+86400000),
            (FREE_MODEL,"free_verified",0,10000,"FAKE-OFFLINE",NOW-100000,NOW+86400000)])
        for scope in ("global","member:default","app:echostars","task:echostars:echo.qa"):
            db.execute("""UPDATE starry_ai_b07_policies SET enabled=1,max_calls=?,max_micro_twd=?
                           WHERE scope_key=?""",(cap,money,scope)) if scope in ("global","member:default") else db.execute(
                           """INSERT INTO starry_ai_b07_policies(scope_key,enabled,max_calls,max_micro_twd,actor_id,updated_at)
                           VALUES(?,1,?,?,'I1-fake',0)""",(scope,cap,money))
        db.close()
        e=open_db(self.echo)
        e.executescript("""CREATE TABLE fake_transcript_runs(
          run_id TEXT PRIMARY KEY,track_id TEXT NOT NULL,source_etag TEXT NOT NULL,
          grant_digest TEXT NOT NULL, generation INTEGER NOT NULL, state TEXT NOT NULL,
          lease_until INTEGER NOT NULL,permission_ok INTEGER NOT NULL,restore_ok INTEGER NOT NULL,
          source_matches INTEGER NOT NULL, segment_count INTEGER NOT NULL);
          CREATE TABLE fake_transcript_index(
           track_id TEXT PRIMARY KEY,status TEXT NOT NULL,r2_key TEXT);""")
        e.close()

    def put_run(self,run,track,etag,grant,segments=1,generation=1,state="processing",
                permission_ok=1,restore_ok=1,source_matches=1,lease_until=None):
        with closing(open_db(self.echo)) as db:
            db.execute("INSERT OR REPLACE INTO fake_transcript_runs VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                       (run,track,etag,grant,generation,state,
                        NOW+600000 if lease_until is None else lease_until,
                        permission_ok,restore_ok,source_matches,segments))
            db.execute("INSERT OR IGNORE INTO fake_transcript_index VALUES(?,'ready','original-safe-r2.json')",(track,))

    def verified_run(self,run,track,etag,grant):
        with open_db(self.echo) as db:
            row=db.execute("SELECT * FROM fake_transcript_runs WHERE run_id=?",(run,)).fetchone()
        if not row: return None
        _,t,e,g,generation,state,lease,permission,restore,source,segments=row
        if (t,e,g)!=(track,etag,grant) or state!="processing" or generation<1 or lease<=NOW or not all((permission,restore,source)):
            return None
        return {"generation":generation,"segments":segments}

    def request(self,run,track,etag,grant,segment,request_key,*,day=DAY,model=MODEL,
                official_free_known=False,simulate_timeout=False):
        # Fake Echo ID authority is checked before the Central D1 transaction;
        # real cross-DB atomicity/permission races are NOT solved by this fixture.
        authority=self.verified_run(run,track,etag,grant)
        if not authority or not isinstance(segment,int) or segment<0 or segment>=authority["segments"]:
            return {"allow":False,"reason":"fake_authority_unknown"}
        if model==FREE_MODEL and not official_free_known:
            return {"allow":False,"reason":"fake_account_free_balance_unknown"}
        if model not in (MODEL,FREE_MODEL):
            return {"allow":False,"reason":"fake_tariff_unverified"}
        if not (len(grant)==64 and len(etag)==64):
            return {"allow":False,"reason":"fake_invalid_source"}
        key=run_identity(track,etag,grant,model)
        seg_id=identity(track,etag,grant,segment,model)
        db=open_db(self.central)
        try:
            db.execute("BEGIN IMMEDIATE")
            existing=db.execute("SELECT request_id,run_id,segment_count FROM fake_b07_i1_runs WHERE identity_digest=?",(key,)).fetchone()
            if existing:
                reservation,original_run,segment_count=existing
                if original_run!=run or segment_count!=authority["segments"]:
                    db.execute("ROLLBACK")
                    return {"allow":False,"reason":"same_approval_new_run_blocked"}
            else:
                reservation="b07-"+str(uuid.uuid4())
                units=authority["segments"]*3
                rate=0 if model==FREE_MODEL else 2
                db.execute("""INSERT INTO starry_ai_b07_calls(
                 id,request_key,fingerprint,day,app_id,task_id,member_key,model_id,
                 billing_class,status,max_units,unit_micro_twd,held_micro_twd,created_at,updated_at)
                 VALUES(?,?,?,?,?,?,?,?,?,'reserved',?,?,?,?,?)""",(
                 reservation,request_key,h("fake-i1",key),day,
                 "echostars","echo.qa",hashlib.sha256(track.encode()).hexdigest(),model,
                 "free_verified" if model==FREE_MODEL else "priced",
                 units,rate,units*rate,NOW,NOW))
                db.execute("""INSERT INTO starry_ai_b07_s3_run_plans(
                   request_id,fingerprint,segment_count,max_attempts_per_segment,max_units_per_attempt,created_at)
                   VALUES(?,?,?,?,?,?)""",(reservation,h("fake-i1",key),authority["segments"],3,1,NOW))
                db.execute("INSERT INTO fake_b07_i1_runs VALUES(?,?,?,?,?,?,?)",
                          (key,reservation,run,etag,grant,authority["segments"],day))
            # RequestKey deliberately DOES NOT participate in the audio identity.
            if db.execute("SELECT 1 FROM fake_b07_i1_segments WHERE identity_digest=?",(seg_id,)).fetchone():
                db.execute("ROLLBACK")
                return {"allow":False,"reason":"same_audio_segment_already_claimed"}
            db.execute("""INSERT INTO starry_ai_b07_s3_attempts
               (attempt_key,request_id,segment_index,attempt_ordinal,max_units,status,created_at,updated_at)
               VALUES(?,?,?,0,1,'may_have_sent',?,?)""",(
                "s3:"+reservation+":"+str(segment)+":0",reservation,segment,NOW,NOW))
            db.execute("INSERT INTO fake_b07_i1_segments VALUES(?,?,?,'may_have_sent')",(seg_id,reservation,segment))
            db.execute("COMMIT")
        except sqlite3.Error:
            try: db.execute("ROLLBACK")
            except sqlite3.Error: pass
            return {"allow":False,"reason":"central_rejected_or_budget_exceeded"}
        finally: db.close()
        # Fake provider only. No HTTP/network/callable provider SDK exists here.
        with self.count_lock: self.sends+=1
        if simulate_timeout:
            self.complete(reservation,segment,kind="unknown")
        return {"allow":True,"request_id":reservation,"segment_id":seg_id}

    def complete(self,reservation,segment,kind,actual=1):
        db=open_db(self.central)
        try:
            db.execute("BEGIN IMMEDIATE")
            row=db.execute("SELECT attempt_key,status FROM starry_ai_b07_s3_attempts WHERE request_id=? AND segment_index=?",
                           (reservation,segment)).fetchone()
            if not row or row[1]!="may_have_sent": raise ValueError("fake_result_already_recorded_or_missing")
            status="uncertain" if kind=="unknown" else "settled"
            db.execute("""UPDATE starry_ai_b07_s3_attempts
              SET status=?, actual_units=?,receipt_digest=?,updated_at=?
              WHERE attempt_key=? AND status='may_have_sent'""",(
                  status,0 if status=="uncertain" else actual,
                  "" if status=="uncertain" else "f"*64,NOW,row[0]))
            if status=="uncertain":
                db.execute("UPDATE starry_ai_b07_calls SET status='uncertain',updated_at=? WHERE id=? AND status='reserved'",
                           (NOW,reservation))
            db.execute("UPDATE fake_b07_i1_segments SET provider_state=? WHERE request_id=? AND segment_index=?",
                       (status,reservation,segment))
            db.execute("COMMIT")
        except:
            db.execute("ROLLBACK")
            raise
        finally:db.close()

    def finalize(self,reservation):
        db=open_db(self.central)
        try:
            db.execute("BEGIN IMMEDIATE")
            planned=db.execute("SELECT segment_count FROM starry_ai_b07_s3_run_plans WHERE request_id=?",(reservation,)).fetchone()
            rows=db.execute("SELECT status,actual_units FROM starry_ai_b07_s3_attempts WHERE request_id=?",(reservation,)).fetchall()
            if not planned or len(rows)!=planned[0] or not all(s=="settled" for s,_ in rows):
                db.execute("ROLLBACK")
                return False
            updated=db.execute("""UPDATE starry_ai_b07_calls SET status='settled',actual_units=?,
                         actual_micro_twd=?,updated_at=? WHERE id=? AND status='reserved'""",(
                         sum(u for _,u in rows),sum(u for _,u in rows)*2,NOW,reservation))
            if updated.rowcount != 1:
                db.execute("ROLLBACK")
                return False
            db.execute("COMMIT")
            return True
        finally:db.close()

    def usage(self):
        with closing(open_db(self.central)) as db:
            return db.execute("SELECT calls,held_micro_twd,settled_micro_twd FROM starry_ai_b07_usage WHERE day=? AND scope_key='global'",(DAY,)).fetchone()

    def count(self,table):
        with open_db(self.central) as db:
            return db.execute("SELECT COUNT(*) FROM "+table).fetchone()[0]

def check(cond,label):
    if not cond: raise AssertionError(label)

cases=0
def verified(cond,label):
    global cases
    check(cond,label)
    cases+=1

with tempfile.TemporaryDirectory(prefix="b07-i1-FULLY-OFFLINE-") as root:
    # 1. Source identity from approved version, not merely requestKey or runId.
    f=FakeEnvironment(root,cap=50)
    audio="1"*64;grant="2"*64
    f.put_run("safe-run-01","track-alpha",audio,grant,segments=2)
    a=f.request("safe-run-01","track-alpha",audio,grant,0,"new-key-one")
    verified(a["allow"] and f.sends==1,"first fake provider allowed")
    duplicate=f.request("safe-run-01","track-alpha",audio,grant,0,"different-request-key")
    verified(not duplicate["allow"] and f.sends==1,"requestKey rewrite cannot re-send same source/segment")
    f.put_run("safe-run-02","track-alpha",audio,grant,segments=2)
    rerun=f.request("safe-run-02","track-alpha",audio,grant,0,"third-request-key")
    verified(not rerun["allow"],"runId rewrite without new approval cannot re-send")
    # Restore original run for remaining segment.
    f.put_run("safe-run-01","track-alpha",audio,grant,segments=2)
    second=f.request("safe-run-01","track-alpha",audio,grant,1,"new-key-other-segment")
    verified(second["allow"] and second["request_id"]==a["request_id"] and f.sends==2,"segments share ONE run hold")
    f.complete(a["request_id"],0,"confirmed")
    verified(not f.finalize(a["request_id"]),"one of two segments cannot settle whole run")
    before=f.usage()
    verified(before[1]==12 and before[2]==0,"partial success retains full hold")
    f.complete(a["request_id"],1,"unknown")
    verified(not f.finalize(a["request_id"]),"unknown result blocks finalization")
    after=f.usage()
    verified(after[1]==12 and after[2]==0,"uncertain after partial success retains hold")
    tomorrow=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(days=1)).date().isoformat()
    next_day=f.request("safe-run-01","track-alpha",audio,grant,1,"tomorrow-new-code",day=tomorrow)
    verified(not next_day["allow"] and f.sends==2,"UTC change does not clear source claim")
    verified(f.count("starry_ai_b07_calls")==1 and f.count("starry_ai_b07_s3_attempts")==2,
             "same approval never duplicated B07 run reservation")
    # Missing live source/authorization, revoked member, restored stale epoch.
    f.put_run("revoked","track-r","3"*64,"4"*64,permission_ok=0)
    verified(not f.request("revoked","track-r","3"*64,"4"*64,0,"revoked-req")["allow"],"revoked denied")
    f.put_run("restored","track-r2","5"*64,"6"*64,restore_ok=0)
    verified(not f.request("restored","track-r2","5"*64,"6"*64,0,"restore-req")["allow"],"rollback epoch unknown denied")
    f.put_run("stale","track-r3","7"*64,"8"*64,source_matches=0)
    verified(not f.request("stale","track-r3","7"*64,"8"*64,0,"stale-req")["allow"],"source revision stale denied")
    f.put_run("expired","track-r4","9"*64,"a"*64,lease_until=NOW-1)
    verified(not f.request("expired","track-r4","9"*64,"a"*64,0,"expired-req")["allow"],"lease expired denied")
    # Account-wide free pool UNKNOWN, even if local tariff says free units.
    f.put_run("free-run","track-free","b"*64,"c"*64)
    verified(not f.request("free-run","track-free","b"*64,"c"*64,0,"free-req",model=FREE_MODEL)["allow"],
             "shared official free account balance unknown denied")
    verified(f.request("free-run","track-free","b"*64,"c"*64,0,"free-req-verified",
                       model=FREE_MODEL,official_free_known=True)["allow"],
             "only fake verified free meter authorizes local test")
    # Zero priced budget blocks providers atomically.
    with tempfile.TemporaryDirectory(prefix="i1-zero-") as d:
        zero=FakeEnvironment(d,cap=10,money=0)
        zero.put_run("zero","track-zero","d"*64,"e"*64)
        verified(not zero.request("zero","track-zero","d"*64,"e"*64,0,"zero-priced")["allow"] and zero.sends==0,
                 "priced at NT$0 globally fails closed")
    # 2,000 distinct synthetic members submitted to one fake shared budget.
    with tempfile.TemporaryDirectory(prefix="i1-two-thousand-") as d:
        peak=FakeEnvironment(d,cap=40,money=100000)
        for i in range(2000):
            key=f"fake-track-{i:04d}"
            peak.put_run(f"fake-run-{i:04d}",key,hashlib.sha256(("fake-audio-"+str(i)).encode()).hexdigest(),
                         hashlib.sha256(("fake-approval-"+str(i)).encode()).hexdigest())
        started=threading.Event()
        active=0;maxactive=0; lock=threading.Lock()
        def submit(i):
            global active,maxactive
            started.wait()
            with lock:
                active+=1;maxactive=max(maxactive,active)
            try:
                key=f"fake-track-{i:04d}"
                answer=peak.request(f"fake-run-{i:04d}",key,
                    hashlib.sha256(("fake-audio-"+str(i)).encode()).hexdigest(),
                    hashlib.sha256(("fake-approval-"+str(i)).encode()).hexdigest(),
                    0,f"fake-request-{i:04d}")
                return answer["allow"]
            finally:
                with lock: active-=1
        # 2,000 logical user requests are queued together, but the runner has
        # only 24 worker threads; NOT 2,000 simultaneous DB connections.
        with concurrent.futures.ThreadPoolExecutor(max_workers=24) as pool:
            futures=[pool.submit(submit,i) for i in range(2000)]
            started.set()
            outcomes=[future.result() for future in futures]
        verified(sum(outcomes)==40 and peak.sends==40,"account-global budget admits 40/2000 fake identities")
        verified(peak.count("starry_ai_b07_calls")==40 and peak.count("fake_b07_i1_segments")==40,
                 "admitted claims remain one-to-one with central holds")
        verified(peak.usage()[0]==40 and maxactive<=24,
                 "atomic shared cap, <=24 actual test threads")
        # Forced 80 rekeys on a single segment, still one fake provider attempt.
        with tempfile.TemporaryDirectory(prefix="i1-rekeys-") as d2:
            same=FakeEnvironment(d2,cap=100)
            same.put_run("one","same-track","9"*64,"e"*64)
            def rekey(i):
                return same.request("one","same-track","9"*64,"e"*64,0,
                    f"test-rewrite-{i:04d}")["allow"]
            with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
                replays=list(pool.map(rekey,range(80)))
            verified(sum(replays)==1 and same.sends==1 and same.count("starry_ai_b07_calls")==1,
                     "80 concurrent new requestKeys cannot pay twice")
        # No double base migration: only exact existing 7 legacy B07 tables.
        with open_db(peak.central) as db:
            base_tables=db.execute("""SELECT count(*) FROM sqlite_master
             WHERE type='table' AND name='starry_ai_b07_calls'""").fetchone()[0]
        verified(base_tables==1,"baseline B07 calls table created only once")
    print("B07_I1_OFFLINE_OK "+json.dumps({
       "cases":cases,"fakeIdentities":2000,"submittedFakeRequests":2000,
       "actualMaxTestThreads":24,"observedMaxActive":maxactive,
       "accepted":40,"denied":1960,"rekeyReplays":80,
       "rekeyProviderTickets":1,"remoteNetworkRequests":0,"realProviderCalls":0,
       "cloudflareD1OrR2Requests":0,"productionMigrations":0,
       "accountFreeBalanceFromRealProvider":"UNKNOWN",
       "cloudflare2000ConcurrentUsersVerified":False
    }))
