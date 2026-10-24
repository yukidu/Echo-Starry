import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  guardedStatistics, guardedExport, encodeCsvCell,
  type Action, type Evidence, type RequestScope, type Ports, type Policy, type Row
} from '../ai5-a03/privateStatisticsGate.ts';

/** A03 uses real transactional in-memory SQLite, but ONLY fake subjects/rows. */
const policy: Policy = { enabled: true, quotaKnown: true, minimumCohort: 5, maxRows: 100 };
const request = (action: Action, nonce = 'SYNTHETIC-NONCE-1'): RequestScope => ({
  subjectId: 'FAKE-ADMIN', sessionId: 'FAKE-SESSION', appId: 'echo',
  reportId: 'FAKE-REPORT', action, nonce
});
function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE authority (subject TEXT NOT NULL, session TEXT NOT NULL, app TEXT NOT NULL, report TEXT NOT NULL, action TEXT NOT NULL, active INTEGER NOT NULL, approved INTEGER NOT NULL, session_rev INTEGER NOT NULL, role_rev INTEGER NOT NULL, permission_rev INTEGER NOT NULL, resource_rev INTEGER NOT NULL, source_rev INTEGER NOT NULL, watermark INTEGER NOT NULL, restore_epoch INTEGER NOT NULL, expires INTEGER NOT NULL, PRIMARY KEY(subject,session,app,report,action)); CREATE TABLE events (event_id TEXT PRIMARY KEY, app TEXT NOT NULL, day TEXT NOT NULL, label TEXT NOT NULL, member TEXT NOT NULL); CREATE TABLE claims (app TEXT, report TEXT, action TEXT, nonce TEXT, PRIMARY KEY(app,report,action,nonce));');
  const insert = db.prepare('INSERT INTO authority VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  for (const action of ['stats.private.read', 'stats.report.export'] as Action[])
    insert.run('FAKE-ADMIN','FAKE-SESSION','echo','FAKE-REPORT',action,1,1,7,3,5,11,17,19,2,100);
  let clock=50, loadCount=0, claimCount=0, onLoad: () => void = () => {}, onClaim: () => void = () => {};
  const proof = (req: RequestScope): Evidence | null => {
    const row = db.prepare('SELECT * FROM authority WHERE subject=? AND session=? AND app=? AND report=? AND action=?')
      .get(req.subjectId,req.sessionId,req.appId,req.reportId,req.action) as Record<string,unknown> | undefined;
    if (!row) return null;
    return { issuer:'starry-id', audience:'echo.private-statistics',
      subjectId:req.subjectId,sessionId:req.sessionId,appId:req.appId,reportId:req.reportId,action:req.action,
      active:row.active===1,approved:row.approved===1,sessionRevision:Number(row.session_rev),
      roleRevision:Number(row.role_rev),permissionRevision:Number(row.permission_rev),
      resourceRevision:Number(row.resource_rev),sourceRevision:Number(row.source_rev),
      revocationWatermark:Number(row.watermark),restoreEpoch:Number(row.restore_epoch),expiresAt:Number(row.expires)
    };
  };
  const ports: Ports = {
    now:()=>clock,
    check:async r=>proof(r),
    load:async r=>{
      loadCount++;
      const results=db.prepare('SELECT day,label,COUNT(DISTINCT member) AS members,COUNT(*) AS calls FROM events WHERE app=? GROUP BY day,label ORDER BY day,label').all(r.appId) as unknown as Row[];
      onLoad();return results;
    },
    claimOnce:async (r,prior)=>{
      claimCount++;
      db.exec('BEGIN IMMEDIATE');
      try {
        const current=proof(r);
        if(!current || current.active!==true || current.approved!==true ||
          JSON.stringify(current)!==JSON.stringify(prior) || clock>=current.expiresAt) {
          db.exec('ROLLBACK'); return false;
        }
        db.prepare('INSERT INTO claims VALUES(?,?,?,?)').run(r.appId,r.reportId,r.action,r.nonce);
        db.exec('COMMIT');onClaim();return true;
      } catch {db.exec('ROLLBACK');return false;}
    }
  };
  const add=(app:string,day:string,label:string,count:number,offset=0)=>{
    const q=db.prepare('INSERT INTO events VALUES (?,?,?,?,?)');
    for(let i=0;i<count;i++)q.run(app+':'+day+':'+label+':'+(i+offset),app,day,label,'FAKE-M-'+(i+offset));
  };
  return {db,ports,add,change:(sql:string)=>db.exec(sql),setClock:(v:number)=>clock=v,
    onLoad:(fn:()=>void)=>onLoad=fn,onClaim:(fn:()=>void)=>onClaim=fn,
    get reads(){return loadCount;},get claims(){return claimCount;}};
}
test('gate defaults OFF even with a valid SQL grant',async()=>{
  const f=fixture();f.add('echo','2026-10-21','aggregate',6);
  assert.deepEqual(await guardedStatistics(request('stats.private.read'),{...policy,enabled:false},f.ports),{status:'DENY',bytes:''});
  assert.equal(f.reads,0);f.db.close();
});
test('quota UNKNOWN denies before touching data',async()=>{
  const f=fixture();assert.equal((await guardedExport(request('stats.report.export'),{...policy,quotaKnown:false},f.ports)).status,'DENY');
  assert.equal(f.reads,0);assert.equal(f.claims,0);f.db.close();
});
test('read grant only does not authorize export',async()=>{
  const f=fixture();f.change("DELETE FROM authority WHERE action='stats.report.export'");
  assert.equal((await guardedExport(request('stats.report.export'),policy,f.ports)).status,'DENY');
  assert.equal(f.reads,0);f.db.close();
});
test('export grant only does not authorize read',async()=>{
  const f=fixture();f.change("DELETE FROM authority WHERE action='stats.private.read'");
  assert.equal((await guardedStatistics(request('stats.private.read'),policy,f.ports)).status,'DENY');
  assert.equal(f.reads,0);f.db.close();
});
test('App, subject and report are independently scoped',async()=>{
  const f=fixture();for(const change of [{appId:'download'},{subjectId:'FAKE-OTHER'},{reportId:'FAKE-OTHER'}]){
    assert.equal((await guardedStatistics({...request('stats.private.read'),...change} as RequestScope,policy,f.ports)).status,'DENY');
  }assert.equal(f.reads,0);f.db.close();
});
test('SQL authority revocation blocks before private database read',async()=>{
  const f=fixture();f.change("UPDATE authority SET active=0 WHERE action='stats.private.read'");
  assert.equal((await guardedStatistics(request('stats.private.read'),policy,f.ports)).status,'DENY');
  assert.equal(f.reads,0);f.db.close();
});
test('revocation during load blocks every output byte',async()=>{
  const f=fixture();f.add('echo','2026-10-21','aggregate',6);
  f.onLoad(()=>f.change("UPDATE authority SET active=0,permission_rev=permission_rev+1 WHERE action='stats.report.export'"));
  assert.deepEqual(await guardedExport(request('stats.report.export'),policy,f.ports),{status:'DENY',bytes:''});
  assert.equal(f.claims,0);f.db.close();
});
test('revocation after durable claim and before final proof still blocks bytes',async()=>{
  const f=fixture();f.add('echo','2026-10-21','aggregate',6);
  f.onClaim(()=>f.change("UPDATE authority SET active=0,permission_rev=permission_rev+1 WHERE action='stats.report.export'"));
  assert.deepEqual(await guardedExport(request('stats.report.export'),policy,f.ports),{status:'DENY',bytes:''});
  f.db.close();
});
test('stale role/permission/source/restore/watermark all cause deny after load',async()=>{
  for(const col of ['session_rev','role_rev','permission_rev','resource_rev','source_rev','watermark','restore_epoch']){
    const f=fixture();f.add('echo','2026-10-21','aggregate',6);
    f.onLoad(()=>f.change('UPDATE authority SET '+col+'='+col+"+1 WHERE action='stats.private.read'"));
    assert.equal((await guardedStatistics(request('stats.private.read'),policy,f.ports)).status,'DENY',col);
    f.db.close();
  }
});
test('session expiry and unavailable authority fail closed',async()=>{
  const f=fixture();f.setClock(100);
  assert.equal((await guardedStatistics(request('stats.private.read'),policy,f.ports)).status,'DENY');
  f.setClock(50);f.change('DELETE FROM authority');
  assert.equal((await guardedStatistics(request('stats.private.read'),policy,f.ports)).status,'DENY');f.db.close();
});
test('durable SQLite nonce claim forbids replay and allows new nonce',async()=>{
  const f=fixture();f.add('echo','2026-10-21','aggregate',6);
  const r=request('stats.report.export');
  assert.equal((await guardedExport(r,policy,f.ports)).status,'ALLOW');
  assert.equal((await guardedExport(r,policy,f.ports)).status,'DENY');
  assert.equal((await guardedExport(request('stats.report.export','SYNTHETIC-NONCE-2'),policy,f.ports)).status,'ALLOW');
  assert.equal((f.db.prepare('SELECT COUNT(*) as n FROM claims').get() as {n:number}).n,2);f.db.close();
});
test('small cell suppresses entire identifying row, keeps >=5 only',async()=>{
  const f=fixture();f.add('echo','2026-10-21','TOP-SECRET-ONE-PERSON',1);
  f.add('echo','2026-10-21','approved cohort',5);
  const r=await guardedStatistics(request('stats.private.read'),policy,f.ports);
  assert.equal(r.status,'ALLOW');assert.doesNotMatch(r.bytes,/TOP-SECRET/);
  assert.match(r.bytes,/approved cohort/);f.db.close();
});
test('cross App isolation holds under real SQLite query',async()=>{
  const f=fixture();f.add('download','2026-10-21','DOWNLOAD_PRIVATE',6);
  f.add('echo','2026-10-21','ECHO_OK',6);
  const r=await guardedStatistics(request('stats.private.read'),policy,f.ports);
  assert.equal(r.status,'ALLOW');assert.doesNotMatch(r.bytes,/DOWNLOAD_PRIVATE/);f.db.close();
});
test('CSV injection escapes whitespace prefix, @,+,-,= and quotes',async()=>{
  for(const str of ['=1+1','+SUM(A1)','@cmd','-3+2','\t=bad',' \n+bad']) assert.ok(encodeCsvCell(str).startsWith('"\''),str);
  assert.equal(encodeCsvCell('a"b'),'"a""b"');
  const f=fixture();f.add('echo','2026-10-21','=HYPERLINK("bad")',5);
  const r=await guardedExport(request('stats.report.export'),policy,f.ports);
  assert.equal(r.status,'ALLOW');assert.match(r.bytes,/"'=HYPERLINK/);f.db.close();
});
test('invalid count, large rows and unapproved policy deny whole response',async()=>{
  const f=fixture();f.add('echo','2026-10-21','a',6);
  assert.equal((await guardedStatistics(request('stats.private.read'),{...policy,minimumCohort:1},f.ports)).status,'DENY');
  assert.equal((await guardedStatistics(request('stats.private.read'),{...policy,maxRows:0},f.ports)).status,'DENY');
  f.db.close();
});
test('synthetic 2,000 members x 30 days: exact distinct count, NOT concurrency',()=>{
  const f=fixture();f.db.exec('BEGIN');
  const stmt=f.db.prepare('INSERT INTO events VALUES(?,?,?,?,?)');
  for(let d=0;d<30;d++)for(let i=0;i<2000;i++){
    stmt.run('SYN-'+d+'-'+i,i%2===0?'echo':'download','day-'+d,'cohort','FAKE-M-'+i);
  }
  f.db.exec('COMMIT');
  const r=f.db.prepare("SELECT COUNT(*) AS events,COUNT(DISTINCT member) AS unique_members FROM events WHERE app='echo'").get() as {events:number;unique_members:number};
  assert.deepEqual({...r},{events:30000,unique_members:1000});f.db.close();
});
