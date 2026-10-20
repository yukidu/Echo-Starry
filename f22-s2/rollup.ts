/** F22-S2 / S45A: isolated fake-SQLite projection. No production imports/routes.
 * Never store member email, name, raw questions, cost guesses or tokens here.
 */
export type EventState='done'|'failed'|'pending';
export type Period='today'|'7d'|'30d'|'all';
export type Safety='safe'|'warning'|'stop'|'unknown';
export interface Mutation {
 eventKey:string;sourceVersion:number;payloadHash:string;memberKey:string;
 trackKey:string;occurredAtMs:number;state:EventState;active:boolean;
}
export interface AccountUsage {rowsRead:number|null;rowsWritten:number|null;observedAtMs:number|null;}
export interface Decision {safety:Safety;permitted:boolean;reason:string;readPct:number|null;writePct:number|null;}
export const READ_LIMIT=5_000_000,WRITE_LIMIT=100_000,READ_HALT=4_000_000,WRITE_HALT=80_000;
export const MAX_USAGE_AGE_MS=300_000,MAX_BATCH=256;
/** Deliberately padded FAKE planning bounds; not measured D1 cost. */
export const PREDICTED_READS=64,PREDICTED_WRITES=32;
const HEX=/^[a-f0-9]{64}$/,TRACK=/^[A-Za-z0-9:_-]{1,96}$/;
const DAY_MS=86_400_000,TZ_MS=28_800_000;
export function guardUsage(u:AccountUsage,reads=0,writes=0,now=Date.now()):Decision{
 const unknown:Decision={safety:'unknown',permitted:false,reason:'account_usage_unavailable',readPct:null,writePct:null};
 if(u.rowsRead===null||u.rowsWritten===null||u.observedAtMs===null||
 !Number.isSafeInteger(u.rowsRead)||!Number.isSafeInteger(u.rowsWritten)||
 u.rowsRead<0||u.rowsWritten<0||!Number.isFinite(u.observedAtMs)||
 u.observedAtMs>now+60_000||now-u.observedAtMs>MAX_USAGE_AGE_MS||
 !Number.isSafeInteger(reads)||!Number.isSafeInteger(writes)||reads<0||writes<0)return unknown;
 const r=u.rowsRead+reads,w=u.rowsWritten+writes;
 const p={readPct:Math.round(r/READ_LIMIT*1000)/10,writePct:Math.round(w/WRITE_LIMIT*1000)/10};
 if(r>=READ_LIMIT||w>=WRITE_LIMIT)return{...p,safety:'stop',permitted:false,reason:'account_limit_reached'};
 if(r>=READ_HALT||w>=WRITE_HALT)return{...p,safety:'warning',permitted:false,reason:'nonessential_jobs_paused'};
 return{...p,safety:'safe',permitted:true,reason:'within_fake_budget'};
}
export function taipeiDay(ms:number):string{
 if(!Number.isSafeInteger(ms)||ms<0||ms>8_640_000_000_000_000-TZ_MS)throw Error('invalid_event_time');
 return new Date(ms+TZ_MS).toISOString().slice(0,10);
}
export function windowDays(period:Period,now=Date.now()):{first:string;last:string}{
 const last=taipeiDay(now);
 if(period==='all')return{first:'0000-01-01',last};
 const days=period==='today'?1:period==='7d'?7:period==='30d'?30:0;
 if(!days)throw Error('bad_period');
 return{first:new Date(Date.parse(last+'T00:00:00Z')-(days-1)*DAY_MS).toISOString().slice(0,10),last};
}
function validate(m:Mutation){
 if(!HEX.test(m.eventKey)||!HEX.test(m.memberKey)||!HEX.test(m.payloadHash)||
 !TRACK.test(m.trackKey)||!Number.isSafeInteger(m.sourceVersion)||m.sourceVersion<1||
 !['done','failed','pending'].includes(m.state)||typeof m.active!=='boolean')throw Error('invalid_opaque_event');
 taipeiDay(m.occurredAtMs);
}
interface Stmt{get(...args:any[]):any;all(...args:any[]):any[];run(...args:any[]):unknown;}
export interface FakeSqlite{exec(sql:string):void;prepare(sql:string):Stmt;}
interface Stored {event_key:string;source_version:number;payload_hash:string;member_key:string;
 track_key:string;day:string;state:EventState;active:number;}
function same(r:Stored,m:Mutation,d:string){return r.payload_hash===m.payloadHash&&r.member_key===m.memberKey&&
 r.track_key===m.trackKey&&r.day===d&&r.state===m.state&&r.active===Number(m.active);}
function countDelta(db:FakeSqlite,day:string,g:string,state:EventState,delta:number){
 const values=[state==='done'?delta:0,state==='failed'?delta:0,state==='pending'?delta:0];
 if(delta===1){
  db.prepare('INSERT INTO f22_s2_counts(day,group_key,calls,done,failed,pending) VALUES(?,?,?,?,?,?) '+
   'ON CONFLICT(day,group_key) DO UPDATE SET calls=calls+1,done=done+excluded.done,'+
   'failed=failed+excluded.failed,pending=pending+excluded.pending').run(day,g,delta,...values);
 }else{
  const r=db.prepare('UPDATE f22_s2_counts SET calls=calls-1,done=done+?,failed=failed+?,pending=pending+? '+
   'WHERE day=? AND group_key=? AND calls>0').run(...values,day,g) as {changes:number};
  if(r.changes!==1)throw Error('count_invariant_failed');
  db.prepare('DELETE FROM f22_s2_counts WHERE day=? AND group_key=? AND calls=0').run(day,g);
 }
}
function presenceDelta(db:FakeSqlite,day:string,g:string,member:string,delta:number){
 if(delta===1){db.prepare('INSERT INTO f22_s2_presence(period_day,group_key,member_key,refs) VALUES(?,?,?,1) '+
 'ON CONFLICT(period_day,group_key,member_key) DO UPDATE SET refs=refs+1').run(day,g,member);}
 else {
  const x=db.prepare('UPDATE f22_s2_presence SET refs=refs-1 '+
   'WHERE period_day=? AND group_key=? AND member_key=? AND refs>0').run(day,g,member) as {changes:number};
  if(x.changes!==1)throw Error('presence_invariant_failed');
  db.prepare('DELETE FROM f22_s2_presence WHERE period_day=? AND group_key=? AND member_key=? AND refs=0').run(day,g,member);
 }
}
function adjust(db:FakeSqlite,r:{day:string;track_key:string;member_key:string;state:EventState},delta:number){
 for(const g of ['*',r.track_key]){
  countDelta(db,r.day,g,r.state,delta);
  for(const day of [r.day,'ALL'])presenceDelta(db,day,g,r.member_key,delta);
 }
}
/** Local SQLite transaction; NOT a Cloudflare D1 adapter. D1 transactions,
 * actual rows-read/written, multi-worker contention still require another gate.
 */
export function applyFakeBatch(db:FakeSqlite,items:Mutation[],usage:AccountUsage,now=Date.now()){
 if(!Array.isArray(items)||items.length>MAX_BATCH)throw Error('fake_batch_too_large');
 for(const m of items){validate(m);if(m.occurredAtMs>now)throw Error('future_event_not_allowed');}
 const baseline=guardUsage(usage,0,0,now);
 if(!baseline.permitted)return{applied:0,duplicates:0,stale:0,guard:baseline};
 let applied=0,duplicates=0,stale=0;
 db.exec('BEGIN IMMEDIATE');
 try {
  const future=new Map<string,Stored|null>();
  const effective:{m:Mutation;day:string}[]=[];
  // Inspect entire batch first; this also supports multiple versions of the
  // same event in one transaction, without double-applying equal revisions.
  for(const m of items){
   const day=taipeiDay(m.occurredAtMs);
   const old=future.has(m.eventKey)?future.get(m.eventKey):
    db.prepare('SELECT * FROM f22_s2_events WHERE event_key=?').get(m.eventKey) as Stored|undefined;
   if(old&&m.sourceVersion<old.source_version){stale++;continue;}
   if(old&&m.sourceVersion===old.source_version){
    if(!same(old,m,day))throw Error('conflicting_same_revision');
    duplicates++;continue;
   }
   future.set(m.eventKey,{event_key:m.eventKey,source_version:m.sourceVersion,payload_hash:m.payloadHash,
    member_key:m.memberKey,track_key:m.trackKey,day,state:m.state,active:Number(m.active)});
   effective.push({m,day});
  }
  const guard=guardUsage(usage,effective.length*PREDICTED_READS,
   effective.length*PREDICTED_WRITES,now);
  if(!guard.permitted){db.exec('ROLLBACK');return{applied:0,duplicates,stale,guard};}
  for(const {m,day} of effective){
   const old=db.prepare('SELECT * FROM f22_s2_events WHERE event_key=?').get(m.eventKey) as Stored|undefined;
   if(old&&old.active)adjust(db,old,-1);
   db.prepare('INSERT INTO f22_s2_events(event_key,source_version,payload_hash,member_key,track_key,day,state,active) '+
    'VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(event_key) DO UPDATE SET '+
    'source_version=excluded.source_version,payload_hash=excluded.payload_hash,member_key=excluded.member_key,'+
    'track_key=excluded.track_key,day=excluded.day,state=excluded.state,active=excluded.active').run(
    m.eventKey,m.sourceVersion,m.payloadHash,m.memberKey,m.trackKey,day,m.state,Number(m.active));
   if(m.active)adjust(db,{day,track_key:m.trackKey,member_key:m.memberKey,state:m.state},1);
   applied++;
  }
  db.exec('COMMIT');
  return{applied,duplicates,stale,guard};
 }catch(e){db.exec('ROLLBACK');throw e;}
}
/** Exact members across dates come from member presence, not summed daily distinct. */
export function statsFake(db:FakeSqlite,period:Period,trackKey:string|null,now=Date.now()){
 if(trackKey!==null&&(!TRACK.test(trackKey)))throw Error('bad_track');
 const w=windowDays(period,now),g=trackKey??'*';
 const x=db.prepare('SELECT COALESCE(SUM(calls),0) calls,COALESCE(SUM(done),0) done,'+
 'COALESCE(SUM(failed),0) failed,COALESCE(SUM(pending),0) pending FROM f22_s2_counts '+
 'WHERE group_key=? AND day BETWEEN ? AND ?').get(g,w.first,w.last);
 const members=period==='all'?
  db.prepare('SELECT COUNT(*) n FROM f22_s2_presence WHERE group_key=? AND period_day=?').get(g,'ALL')?.n:
  db.prepare('SELECT COUNT(*) n FROM (SELECT member_key FROM f22_s2_presence '+
   'WHERE group_key=? AND period_day BETWEEN ? AND ? GROUP BY member_key)').get(g,w.first,w.last)?.n;
 return{period,trackKey,window:w,calls:x.calls,members,done:x.done,failed:x.failed,pending:x.pending,
  actualTwd:null,estimatedTwd:null,tokenCount:null,responseMs:null,fallbackCalls:null,
  repeat5:null,repeat30:null,repeat60:null,costState:'not_metered' as const};
}
/** Fake Starry ID authority injected only in local tests; never trust UI role. */
export function readPrivateFake(db:FakeSqlite,
 auth:{verified:boolean;active:boolean;centralRole:string;fresh:boolean},
 period:Period,trackKey:string|null,now=Date.now()){
 if(!auth.verified||!auth.active||auth.centralRole!=='super-admin'||!auth.fresh)
  throw Error('central_super_admin_required');
 return statsFake(db,period,trackKey,now);
}
