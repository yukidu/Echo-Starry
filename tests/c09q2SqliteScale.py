"""S2367A Q2 independent offline SQLite cost / backup / stale-source rehearsal.
Only synthetic in-memory/transient SQLite. Never imports cloud clients.
Pass a destination JSON path to persist machine-readable results.
"""
import json, os, random, sqlite3, statistics, sys, tempfile, time
from pathlib import Path

rng=random.Random(2367)
CHUNKS=[
 '社區植栽管理提醒澆水之前確認表土排水避免積水與日光暴曬',
 '學校藝文活動的管理人員要記錄開放時間入口和負責老師',
 '圖書借閱期限更新之前要保存原始紀錄並確認管理員權限',
 '家長會和志工服務站宣導安全規則不得引用已撤銷的訊息',
 '農業觀察小組整理台灣海岸線生態與森林保育學習',
 '烘焙課程說明麵糰發酵步驟與烤箱預熱和溫度',
 '戶外踏青應該準備雨衣地圖以及緊急照明工具',
 '瑜伽與慢跑教學先做暖身再進行活動避免過度疲累',
 '長途自行車騎乘每六十分鐘要休息補充適當水份',
 '天文夜間活動需使用紅色手電筒減少強光干擾',
 '藝術陶藝作品先自然風乾然後經專業老師確認才能燒製',
 '教育圖畫書籍閱讀計畫安排學生與父母共同學習',
 '多語言導覽資料與音檔字幕先進行人工審核才能對外展示',
 '溫室植物照顧應該控制澆水量和監測土壤乾濕狀況',
 '舊版會員授權若已取消便不能參照過去影音逐字稿內容',
]

def p95(values):
    v=sorted(values)
    return round(v[min(len(v)-1,max(0,int(len(v)*.95)-1))],4)

def words(text):
    # Independent bounded 2-char term extractor, not app algorithm correctness test.
    # Han-only synthetic text, no external dependencies.
    return set('h'+text[i:i+2] for i in range(len(text)-1) if '\u4e00'<=text[i]<='\u9fff' and '\u4e00'<=text[i+1]<='\u9fff')

def setup(cx):
    cx.executescript('''
    CREATE TABLE q1_source_state(trackId TEXT PRIMARY KEY, activeGeneration TEXT,sourceVersion TEXT,sourceKey TEXT,sourceUpdatedAt INTEGER,permissionsRevision TEXT,authorityEpoch TEXT,invalidated INTEGER DEFAULT 0,sourceRevision INTEGER);
    CREATE TABLE q1_paragraphs(id INTEGER PRIMARY KEY,trackId TEXT,generation TEXT,sourceVersion TEXT,ordinal INTEGER,fromSegment TEXT,toSegment TEXT,startMs INTEGER,endMs INTEGER,content TEXT,UNIQUE(trackId,generation,ordinal));
    CREATE INDEX q1_paragraphs_by_version ON q1_paragraphs(trackId,generation);
    CREATE TABLE q1_postings(term TEXT NOT NULL,paragraphId INTEGER NOT NULL,PRIMARY KEY(term,paragraphId)) WITHOUT ROWID;
    CREATE INDEX q1_postings_by_paragraph ON q1_postings(paragraphId);
    ''')

def run(n):
    with tempfile.TemporaryDirectory(prefix='ai4q2-scale-') as d:
        db=Path(d)/'synthetic.sqlite'
        c=sqlite3.connect(str(db)); setup(c)
        lengths=[180,680,1550,3100]
        t0=time.perf_counter()
        par_count=0; posts=0; char_count=0
        for i in range(n):
            tid=f'fake-long-{i:04d}'
            c.execute('INSERT INTO q1_source_state VALUES (?,?,?,?,?,?,?,?,?)',(tid,'g1','v1',f'fake/{tid}.json',100+i,'r1','e1',0,1))
            tokens=CHUNKS[i%len(CHUNKS)]+CHUNKS[(i*7+3)%len(CHUNKS)]
            text=(tokens*((lengths[i%4]//len(tokens))+1))[:lengths[i%4]]
            char_count+=len(text)
            for ordinal,offset in enumerate(range(0,len(text),450)):
                part=text[offset:offset+450]
                cur=c.execute('INSERT INTO q1_paragraphs(trackId,generation,sourceVersion,ordinal,fromSegment,toSegment,startMs,endMs,content) VALUES (?,?,?,?,?,?,?,?,?)',
                              (tid,'g1','v1',ordinal,f's{offset}',f's{offset+len(part)}',offset*100,(offset+len(part))*100,part))
                pid=cur.lastrowid
                terms=words(part)
                c.executemany('INSERT INTO q1_postings VALUES (?,?)',[(s,pid) for s in terms]); par_count+=1; posts+=len(terms)
            if i%200==0:c.commit()
        c.commit()
        elapsed=round(time.perf_counter()-t0,3)
        queries=['h社區','h活動','h備份','h會員','h光干','h植物','h保存','h原始','h服務','h檔案']
        times=[];matched=[];plan=None
        for trial in range(90):
            ids=[f'fake-long-{(trial*13+j*29)%n:04d}' for j in range(min(70,n))]
            q=queries[trial%len(queries)]
            sql='''SELECT p.id,p.trackId FROM q1_postings q JOIN q1_paragraphs p ON p.id=q.paragraphId
                   JOIN q1_source_state s ON s.trackId=p.trackId AND s.activeGeneration=p.generation
                   WHERE q.term=? AND p.trackId IN ('''+','.join('?' for _ in ids)+''')
                   AND s.invalidated=0 AND s.sourceVersion=p.sourceVersion
                   GROUP BY p.id ORDER BY COUNT(*) DESC LIMIT 180'''
            args=[q]+ids
            if plan is None:plan=[x[3] for x in c.execute('EXPLAIN QUERY PLAN '+sql,args).fetchall()]
            x=time.perf_counter();rr=c.execute(sql,args).fetchall();times.append((time.perf_counter()-x)*1000);matched.append(len(rr))
        # Copy consistent offline dump to in-memory empty DB without using FTS5.
        if n<=112:
            sql_dump='\n'.join(c.iterdump())
            restored=sqlite3.connect(':memory:');restored.executescript(sql_dump)
            restore_method='SQL iterdump import'
        else:
            restored=sqlite3.connect(':memory:');c.backup(restored)
            restore_method='SQLite backup API (not SQL dump)'
        restored_count=restored.execute('SELECT COUNT(*) FROM q1_postings').fetchone()[0]
        restored.close()
        # 5 revocation/version/deletion checks only on synthetic DB.
        last=f'fake-long-{n-1:04d}'
        orig=c.execute('SELECT sourceVersion,sourceKey,invalidated FROM q1_source_state WHERE trackId=?',(last,)).fetchone()
        c.execute('UPDATE q1_source_state SET invalidated=1 WHERE trackId=?',(last,));c.commit()
        invalidated=c.execute('SELECT COUNT(*) FROM q1_paragraphs p JOIN q1_source_state s ON s.trackId=p.trackId AND s.activeGeneration=p.generation WHERE p.trackId=? AND s.invalidated=0',(last,)).fetchone()[0]==0
        c.execute('UPDATE q1_source_state SET invalidated=0,sourceVersion=? WHERE trackId=?',('v2',last));c.commit()
        stale=c.execute('SELECT COUNT(*) FROM q1_paragraphs p JOIN q1_source_state s ON s.trackId=p.trackId WHERE p.trackId=? AND s.sourceVersion=p.sourceVersion',(last,)).fetchone()[0]==0
        c.execute('DELETE FROM q1_source_state WHERE trackId=?',(last,));c.commit()
        deleted=c.execute('SELECT COUNT(*) FROM q1_paragraphs p JOIN q1_source_state s ON s.trackId=p.trackId WHERE p.trackId=?',(last,)).fetchone()[0]==0
        result=dict(tracks=n,characters=char_count,paragraphs=par_count,postings=posts,sqlite_bytes=db.stat().st_size,
                    index_build_seconds=elapsed,sqlite_ms_p50=round(statistics.median(times),4),sqlite_ms_p95=p95(times),
                    max_sql_results=max(matched),index_used=any('q1_postings' in x or 'PRIMARY KEY' in x for x in plan),
                    explain_plan=plan[:3],restore_postings_ok=restored_count==posts,restore_method=restore_method,
                    revoked_blocks=invalidated,stale_version_blocks=stale,deleted_blocks=deleted,
                    source_before=orig[0],real_ai_calls=0,real_cloudflare_calls=0)
        c.close()
        return result

if __name__=='__main__':
    allr=[run(i) for i in [30,112,500,2000]]
    out={'experiment':'independent Q2 Python sqlite synthetic scale','seed':2367,'measures':allr}
    Path(sys.argv[1] if len(sys.argv)>1 else '/mnt/data/ai4_s2367a_q2/scale_results.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
    print(json.dumps(out,ensure_ascii=False,indent=2))
