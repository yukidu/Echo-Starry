#!/usr/bin/env python3
"""Isolated SQLite stress verification: NO Cloudflare and NO production data.
The SQL arrives from the actual TypeScript F22 query builders.
"""
import json
import sqlite3
import sys
import time
from datetime import datetime, timedelta, timezone

def isolated_fixture(event_count):
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    db.executescript("""
        CREATE TABLE qa_claims (
          commentId TEXT PRIMARY KEY, identity TEXT NOT NULL, day TEXT NOT NULL,
          trackId TEXT NOT NULL, mode TEXT NOT NULL, status TEXT NOT NULL,
          error TEXT, createdAt INTEGER NOT NULL);
        CREATE INDEX qa_claims_day ON qa_claims(day,status);
        CREATE TABLE tracks (
          id TEXT PRIMARY KEY, title TEXT, speaker TEXT, uploadDate TEXT);
        CREATE TABLE track_speakers (
          trackId TEXT NOT NULL, speakerName TEXT NOT NULL,position INTEGER NOT NULL,
          PRIMARY KEY(trackId,position), UNIQUE(trackId,speakerName));
    """)
    for i in range(50):
        tid = f"track-{i}"
        names = [f"講者-{i}"] if i%4 else [f"講者-{i}", f"共同講者-{i}"]
        db.execute("INSERT INTO tracks VALUES (?,?,?,?)",
            (tid,f"音檔-{i}", "&".join(names),"2026-10-20"))
        for j,sp in enumerate(names):
            db.execute("INSERT INTO track_speakers VALUES (?,?,?)",(tid,sp,j))
    start=datetime(2026,10,1,10,tzinfo=timezone.utc)
    records=[]
    for i in range(event_count):
        t=start+timedelta(days=i%20,seconds=(i//20)%72000)
        taipei_day=(t+timedelta(hours=8)).date().isoformat()
        records.append((f"c-{i}",f"member:{i%2000:04d}",taipei_day,
            f"track-{i%50}","current",("done" if i%5 else "failed"),None,int(t.timestamp()*1000)))
    db.executemany("INSERT INTO qa_claims VALUES (?,?,?,?,?,?,?,?)",records)
    db.commit()
    return db

def main():
    payload=json.load(sys.stdin)
    q=payload["queries"]
    limit=int(payload["limit"])
    # Fixed boundaries: dates and event timestamps use Taipei's +08:00 calendar.
    p=["2026-10-01","2026-10-21",
       int(datetime(2026,9,30,16,tzinfo=timezone.utc).timestamp()*1000),
       int(datetime(2026,10,21,16,tzinfo=timezone.utc).timestamp()*1000)]
    stats=[]
    for num in (60000,4200):
        db=isolated_fixture(num)
        params=p+[limit+1]
        plan=db.execute("EXPLAIN QUERY PLAN "+q["preflight"],params).fetchall()
        plan_text="; ".join(str(tuple(x)) for x in plan)
        assert "qa_claims_day" in plan_text,plan_text
        steps=[0]
        db.set_progress_handler(lambda: (steps.__setitem__(0,steps[0]+1),0)[1],1000)
        start=time.monotonic()
        row=db.execute(q["preflight"],params).fetchone()
        elapsed_ms=round((time.monotonic()-start)*1000,2)
        checked=int(row["n"])
        assert checked==min(num,limit+1),(checked,num)
        assert steps[0]<2000,(steps[0],num)
        # The expensive LAG + GROUP BY only executes in the within-budget case.
        summary_run=0
        if checked<=limit:
            totals=db.execute(q["summary"],p).fetchone()
            tracks=db.execute(q["tracks"],p).fetchall()
            speakers=db.execute(q["speakers"],p).fetchall()
            trend=db.execute(q["trend"],p).fetchall()
            summary_run=1
            assert totals["calls"]==num,(totals["calls"],num)
            assert totals["members"]==min(num,2000),totals["members"]
            assert sum(x["calls"] for x in tracks)==num,"multispeaker multiplied audio count"
            assert sum(x["calls"] for x in speakers)==num,"multispeaker multiplied speaker count"
            assert sum(x["calls"] for x in trend)==num,"trend counts truncated"
            assert any(x["title"]=="多人演講（未歸屬）" for x in speakers)
        else:
            assert num>limit
        stats.append({"isolatedRows":num,"guardCount":checked,
                      "guardElapsedMs":elapsed_ms,"sqliteVMInstructionsApprox":steps[0]*1000,
                      "aggregateQueriesExecuted":summary_run*4,
                      "indexUsed":True})
        db.close()
    print(json.dumps({"ok":True,"runs":stats},ensure_ascii=False))
if __name__=="__main__":
    main()
