"""S45A offline-only fake SQLite ordinary-index performance/restore check.
Called by c09q1Search.test.ts. Never reads an actual D1 or an R2 object.
"""
import json, sqlite3, sys, pathlib, time, statistics, tempfile
base=pathlib.Path(sys.argv[1]); docs=json.loads((base/'fake.json').read_text()); schema=(base/'schema.sql').read_text()
results=[]
for limit in (30,112,500,2000):
    dbfile=base/f'fake-{limit}.db'; conn=sqlite3.connect(dbfile)
    conn.executescript(schema)
    count=0;postcount=0
    conn.execute('BEGIN')
    for d in docs[:limit]:
        conn.execute('INSERT INTO q1_source_state VALUES(?,?,?,?,?,?,?,0,0,?)',
          (d['trackId'],'g1',d['version'],d['sourceKey'],d['sourceUpdatedAt'],d['permissionsRevision'],d['epoch'],1))
        for p in d['paragraphs']:
            cur=conn.execute('INSERT INTO q1_paragraphs(trackId,generation,sourceVersion,ordinal,fromSegment,toSegment,startMs,endMs,content) VALUES(?,?,?,?,?,?,?,?,?)',
              (d['trackId'],'g1',d['version'],p['ordinal'],p['fromSegment'],p['toSegment'],p['startMs'],p['endMs'],p['content']))
            count+=1
            for term in p['tokens']:
                conn.execute('INSERT OR IGNORE INTO q1_postings(term,paragraphId) VALUES(?,?)',(term,cur.lastrowid))
                postcount+=1
    conn.commit()
    sql="""SELECT p.trackId,p.content FROM q1_postings q
      JOIN q1_paragraphs p ON p.id=q.paragraphId
      JOIN q1_source_state s ON s.trackId=p.trackId AND s.activeGeneration=p.generation
      WHERE q.term IN (?,?,?) AND s.invalidated=0
      GROUP BY p.id ORDER BY COUNT(*) DESC LIMIT 40"""
    terms=[('h團隊','h學習','h方法'),('h會員','h權限','h審核'),('h健康','h飲食','h營養'),
      ('c02','c01','c05'),('c18','h文件','c19'),('h逐字','h字幕','h訂正')]
    times=[]
    for _ in range(35):
        for q in terms:
            start=time.perf_counter_ns();conn.execute(sql,q).fetchall()
            times.append((time.perf_counter_ns()-start)/1_000_000)
    times.sort()
    plan=conn.execute('EXPLAIN QUERY PLAN '+sql,terms[0]).fetchall()
    indexed=any('SEARCH q USING PRIMARY KEY (term=?)' in str(item[-1]) or ('SEARCH q USING' in str(item[-1]) and 'INDEX' in str(item[-1])) for item in plan)
    # Invalidate the first track and require zero hits for a uniquely scoped search.
    first=docs[0]['trackId'];conn.execute('UPDATE q1_source_state SET invalidated=1,sourceRevision=sourceRevision+1 WHERE trackId=?',(first,))
    clean=conn.execute("""SELECT COUNT(*) FROM q1_postings q JOIN q1_paragraphs p ON p.id=q.paragraphId
        JOIN q1_source_state s ON s.trackId=p.trackId AND s.activeGeneration=p.generation
        WHERE p.trackId=? AND s.invalidated=0""",(first,)).fetchone()[0]==0
    conn.commit()
    # Rebuild only one fake document using a new active generation. The previous
    # derived rows remain inaccessible while invalidated, even during failure.
    affected=docs[0]; prev_changes=conn.total_changes
    conn.execute('BEGIN')
    new_key='fake/rewritten-first.json'
    for p in affected['paragraphs']:
        cur=conn.execute('INSERT INTO q1_paragraphs(trackId,generation,sourceVersion,ordinal,fromSegment,toSegment,startMs,endMs,content) VALUES(?,?,?,?,?,?,?,?,?)',
          (first,'g2','v2',p['ordinal'],p['fromSegment'],p['toSegment'],p['startMs'],p['endMs'],p['content']+' 修正已審核'))
        for term in p['tokens']:
            conn.execute('INSERT OR IGNORE INTO q1_postings(term,paragraphId) VALUES(?,?)',(term,cur.lastrowid))
    before_publish=conn.execute('SELECT COUNT(*) FROM q1_postings q JOIN q1_paragraphs p ON p.id=q.paragraphId JOIN q1_source_state s ON s.trackId=p.trackId AND s.activeGeneration=p.generation WHERE p.trackId=? AND s.invalidated=0',(first,)).fetchone()[0]
    assert before_publish==0
    conn.execute('UPDATE q1_source_state SET activeGeneration=?, sourceVersion=?,sourceKey=?,sourceUpdatedAt=sourceUpdatedAt+1,invalidated=0,sourceRevision=sourceRevision+1 WHERE trackId=? AND invalidated=1',('g2','v2',new_key,first))
    conn.commit()
    after_publish=conn.execute('SELECT COUNT(*) FROM q1_postings q JOIN q1_paragraphs p ON p.id=q.paragraphId JOIN q1_source_state s ON s.trackId=p.trackId AND s.activeGeneration=p.generation WHERE p.trackId=? AND s.invalidated=0',(first,)).fetchone()[0]
    rewrite_ok=before_publish==0 and after_publish>0
    update_writes=conn.total_changes-prev_changes
    # Ordinary tables must permit a faithful complete dump + restore.
    dump='\n'.join(conn.iterdump())
    restored=sqlite3.connect(':memory:');restored.executescript(dump)
    ok=restored.execute('SELECT COUNT(*) FROM q1_paragraphs').fetchone()[0]==count+len(affected['paragraphs']) and \
       restored.execute('SELECT COUNT(*) FROM q1_postings').fetchone()[0]==postcount+sum(len(p['tokens']) for p in affected['paragraphs'])
    restored.close();conn.close()
    results.append({'tracks':limit,'rows':count,'posts':postcount,
      'db_bytes':dbfile.stat().st_size,'p50_ms':round(statistics.median(times),3),
      'p95_ms':round(times[int(len(times)*0.95)-1],3),'query_plan_index_used':indexed,
      'dump_restore_ok':ok,'revocation_zero_leak':clean, 'new_generation_ok':rewrite_ok, 'update_total_changes':update_writes,
      'query_plan_details':[str(x[-1]) for x in plan], 'single_track_write_lower_bound':len(docs[0]['paragraphs'])+sum(len(p['tokens']) for p in docs[0]['paragraphs'])})
print(json.dumps(results,ensure_ascii=False))
