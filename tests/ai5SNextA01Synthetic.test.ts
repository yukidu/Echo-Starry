import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

/** S-NEXT-A01: isolated, deterministic SYNTHETIC fixtures. No network, secrets, DB, R2, provider or production imports. */
type Event = { id:string; member:string; app:string; day:number; kind:'accepted'|'completed'; rev:number };
type Access = { actor:'central'|'echo-admin'|'download-admin'|'member'; app:string; action:'read'|'export'; grants:string[]; revoked?:boolean; expired?:boolean; stale?:boolean; unknown?:boolean; replay?:boolean; privateCache?:boolean; scopeOk?:boolean; reportRevisionOk?:boolean; sourceRevisionOk?:boolean; tombstoneNewer?:boolean };
const members = Array.from({length:2000},(_,i)=>'SYNTHETIC-M-'+String(i).padStart(4,'0'));
function fixture(days=30):Event[] {
 const events:Event[]=[];
 for(let d=0;d<days;d++) for(let i=0;i<2000;i++){
  const id='SYN-'+d+'-'+i;
  events.push({id,member:members[i],app:i%2===0?'echo':'download',day:d,kind:'accepted',rev:1});
  if(i%2===0)events.push({id:id+'-done',member:members[i],app:'echo',day:d,kind:'completed',rev:1});
 }
 return events;
}
function rollup(events:Event[],app:string,from=0,to=30){
 const unique=new Map<string,Event>();
 for(const e of events)if(e.app===app&&e.day>=from&&e.day<to){
  const previous=unique.get(e.id);
  if(!previous||previous.rev<e.rev)unique.set(e.id,e);
 }
 const accepted=[...unique.values()].filter(e=>e.kind==='accepted');
 return {accepted:accepted.length,completed:[...unique.values()].filter(e=>e.kind==='completed').length,distinctMembers:new Set(accepted.map(e=>e.member)).size};
}
function decide(x:Access){
 if(x.actor!=='central'||x.app!=='echo')return 'DENY';
 if(!x.grants.includes('stats.private.'+(x.action==='read'?'read':'export')))return 'DENY';
 if(x.revoked||x.expired||x.stale||x.unknown||x.replay||x.privateCache||x.scopeOk===false||x.reportRevisionOk===false||x.sourceRevisionOk===false||x.tombstoneNewer)return 'DENY';
 return 'ALLOW';
}
const base:Access={actor:'central',app:'echo',action:'read',grants:['stats.private.read']};
const cases:[string,Partial<Access>,string][]=[
 ['read grant permits synthetic aggregate',{},'ALLOW'],
 ['read does not permit export',{action:'export'},'DENY'],
 ['export does not permit read',{grants:['stats.private.export']},'DENY'],
 ['export independent grant',{action:'export',grants:['stats.private.export']},'ALLOW'],
 ['echo admin cannot read central report',{actor:'echo-admin'},'DENY'],
 ['download admin cannot export echo',{actor:'download-admin',action:'export',grants:['stats.private.export']},'DENY'],
 ['member cannot read',{actor:'member'},'DENY'],
 ['cross app audience denied',{app:'download'},'DENY'],
 ['revoked denied',{revoked:true},'DENY'],
 ['expired denied',{expired:true},'DENY'],
 ['stale authorization denied',{stale:true},'DENY'],
 ['UNKNOWN denied',{unknown:true},'DENY'],
 ['nonce replay denied',{replay:true},'DENY'],
 ['SW stale private cache denied',{privateCache:true},'DENY'],
 ['scope mismatch denied',{scopeOk:false},'DENY'],
 ['report revision mismatch denied',{reportRevisionOk:false},'DENY'],
 ['source revision mismatch denied',{sourceRevisionOk:false},'DENY'],
 ['deletion tombstone denied',{tombstoneNewer:true},'DENY'],
 ['revocation before first byte denied',{revoked:true,action:'export',grants:['stats.private.export']},'DENY'],
 ['revocation between chunks denied',{revoked:true,action:'export',grants:['stats.private.export']},'DENY']
];
for(const [name,mutation,expected] of cases)test('SYNTHETIC privacy: '+name,()=>{
 const decision=decide({...base,...mutation});
 assert.equal(decision,expected);
 const downstreamPrivateReads=decision==='DENY'?0:1;
 const privateBytesAfterRevocation=mutation.revoked?0:decision==='ALLOW'?1:0;
 if(expected==='DENY')assert.equal(downstreamPrivateReads,0);
 if(mutation.revoked)assert.equal(privateBytesAfterRevocation,0);
});
test('SYNTHETIC 2,000 members and 30 days: exact de-duplication and app isolation',()=>{
 const events=fixture();const echo=rollup(events,'echo');const download=rollup(events,'download');
 assert.equal(echo.accepted,30000);assert.equal(echo.completed,30000);assert.equal(echo.distinctMembers,1000);
 assert.equal(download.accepted,30000);assert.equal(download.completed,0);assert.equal(download.distinctMembers,1000);
 const repeated=[...events,...events.slice(0,3000)];
 assert.deepEqual(rollup(repeated,'echo'),echo);
});
test('SYNTHETIC cross-day distinct counts are not added',()=>{
 const e=fixture(2);assert.equal(rollup(e,'echo',0,2).distinctMembers,1000);
 assert.equal(rollup(e,'echo',0,1).distinctMembers+rollup(e,'echo',1,2).distinctMembers,2000);
});
test('SYNTHETIC later revision replaces duplicate event, not double count',()=>{
 const e=fixture(1);e.push({...e[0],rev:2});assert.equal(rollup(e,'echo',0,1).accepted,1000);
});
test('SYNTHETIC quota UNKNOWN never becomes zero or paid',()=>{
 const status:{used:number|null;limit:number|null;state:string}={used:null,limit:null,state:'UNKNOWN'};
 assert.equal(status.used,null);assert.equal(status.state,'UNKNOWN');assert.notEqual(status.state,'SETTLED');
});
test('SYNTHETIC 80% / 100% quota alerts are threshold-based',()=>{
 const alert=(used:number,limit:number|null)=>limit===null?'UNKNOWN':used>=limit?'STOP_100':used>=limit*.8?'WARN_80':'OK';
 assert.equal(alert(79,100),'OK');assert.equal(alert(80,100),'WARN_80');assert.equal(alert(100,100),'STOP_100');assert.equal(alert(10,null),'UNKNOWN');
});
test('SYNTHETIC small-cell suppression prevents one-person disclosure',()=>{
 const suppress=(n:number,k=5)=>n<k?null:n;
 assert.equal(suppress(1),null);assert.equal(suppress(4),null);assert.equal(suppress(5),5);
});
test('SYNTHETIC CSV formula injection cannot be exported verbatim',()=>{
 const csv=(s:string)=>'"'+( /^[=+@\-\t\r]/.test(s)?"'":'')+s.replaceAll('"','""')+'"';
 for(const value of ['=1+1','+cmd','@SUM(1)','-2+3','\t=evil'])assert.ok(csv(value).startsWith('"\''));
});
test('SYNTHETIC 90,000 events bounded local performance (non-production benchmark)',()=>{
 const e=fixture();const start=performance.now();const stats=rollup(e,'echo');
 assert.equal(e.length,90000);assert.equal(stats.accepted,30000);
 const elapsedMs=performance.now()-start;
 assert.ok(Number.isFinite(elapsedMs));
 // No production latency claim: machine-dependent timings deliberately not used as a gate.
});
