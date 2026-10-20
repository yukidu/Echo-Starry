/**
 * B07 LOCAL-only HTTP pressure rehearsal: 2,000 distinct fake users, <=96 sockets.
 * No production URL, credentials, provider traffic, Cloudflare account or billable AI.
 *
 * This is NOT proof of 2,000 simultaneous connections on Cloudflare/D1.
 * The server is loopback and DB is a temporary file containing fake data.
 * Uses the exact new B07 SQLite schema/triggers, not an in-memory mock.
 */
import assert from 'node:assert/strict';
import { createServer, request as httpRequest, Agent } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

const temporary=mkdtempSync(join(tmpdir(),'b07-local-'));
const dbPath=join(temporary,'fake-b07.sqlite');
const child=spawn('python3',['-u','tests/b07-offline-http-sqlite-worker.py',dbPath],{
  cwd:process.cwd(),env:{PATH:process.env.PATH||'/usr/bin:/bin',PYTHONDONTWRITEBYTECODE:'1'},
  stdio:['pipe','pipe','pipe']
});
let nextId=0,outBuffer='',backendError='',serverPending=0,maxServerPending=0;
const pending=new Map();
child.stderr.on('data',d=>{backendError+=String(d).slice(0,2000)});
child.stdout.on('data',d=>{
  outBuffer+=String(d);
  let end;
  while((end=outBuffer.indexOf('\n'))!==-1){
    const line=outBuffer.slice(0,end);outBuffer=outBuffer.slice(end+1);
    if(!line)continue;
    try{
      const result=JSON.parse(line),job=pending.get(result.id);
      if(job){pending.delete(result.id);job.resolve(result)}
    }catch(e){for(const job of pending.values())job.reject(e);pending.clear()}
  }
});
child.on('exit',(code)=>{
  for(const job of pending.values())job.reject(new Error('local SQLite process exited '+code+': '+backendError.slice(0,500)));
  pending.clear();
});
function toSQLite(command){
  return new Promise((resolve,reject)=>{
    if(child.exitCode!==null){reject(new Error('SQLite worker stopped: '+backendError.slice(0,500)));return}
    const id=++nextId;
    pending.set(id,{resolve,reject});
    child.stdin.write(JSON.stringify({id,...command})+'\n',err=>{if(err){pending.delete(id);reject(err)}});
  });
}
const server=createServer(async(req,res)=>{
  let source='';
  try{
    if(req.method!=='POST'||!['/simulate/reserve','/simulate/summary'].includes(req.url))throw new Error('invalid_local_route');
    for await(const part of req){source+=String(part);if(source.length>1500)throw new Error('too_large')}
    const input=JSON.parse(source||'{}');
    serverPending++;maxServerPending=Math.max(maxServerPending,serverPending);
    let result;
    try{result=await toSQLite({...input,action:req.url==='/simulate/reserve'?'reserve':'summary'})}
    finally{serverPending--}
    res.writeHead(result.error?500:200,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify(result.error?{error:'local_simulation_failed'}:result));
  }catch{
    res.writeHead(400,{'Content-Type':'application/json'});
    res.end(JSON.stringify({error:'invalid_local_request'}))
  }
});
const agent=new Agent({keepAlive:true,maxSockets:96,maxFreeSockets:96});
const startedAt=performance.now();
let assigned=0,maxAssigned=0;
const latencies=[];
let port=0;
function localPost(path,body){
  const begun=performance.now();
  return new Promise((resolve,reject)=>{
    const req=httpRequest({
      hostname:'127.0.0.1',port,path,method:'POST',agent,
      headers:{'Content-Type':'application/json'},timeout:20_000
    },res=>{
      let text='';
      res.on('data',d=>{text+=String(d)});
      res.on('end',()=>{
        latencies.push(performance.now()-begun);
        if(res.statusCode!==200){reject(new Error('local HTTP '+res.statusCode+': '+text.slice(0,180)));return}
        try{resolve(JSON.parse(text))}catch(e){reject(e)}
      })
    });
    req.on('socket',()=>{assigned++;maxAssigned=Math.max(maxAssigned,assigned);
      req.once('close',()=>{assigned--})});
    req.on('timeout',()=>req.destroy(new Error('local_only_timeout')));
    req.on('error',reject);
    req.end(JSON.stringify(body));
  });
}
function p(list,percent){
  const s=[...list].sort((a,b)=>a-b);
  return Number((s[Math.min(s.length-1,Math.floor((s.length-1)*percent))]||0).toFixed(2))
}
try{
  // Hard-bind to localhost only. No remote URL is accepted by this harness.
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
  port=server.address().port;
  const submissions=Array.from({length:2000},(_,i)=>({
    user:'fake-member-'+i,requestKey:'local-'+String(i).padStart(8,'0'),mode:'free'
  }));
  // 2,000 fake people submit requests at once from this single local machine.
  // Agent intentionally queues sockets at <=96 to avoid exhausting CI resources.
  const outcomes=await Promise.all(submissions.map(q=>localPost('/simulate/reserve',q)));
  assert.equal(outcomes.length,2000);
  assert.equal(outcomes.filter(x=>x.accepted).length,300,'verified free units hard cap');
  assert.equal(outcomes.filter(x=>x.error).length,0);
  const first=outcomes.findIndex(x=>x.accepted);
  assert.ok(first>=0);
  const duplicates=await Promise.all(Array.from({length:80},()=>localPost('/simulate/reserve',submissions[first])));
  assert.ok(duplicates.every(x=>!x.accepted&&x.duplicate===true),'all duplicate calls must be idempotent');
  const deniedPaid=await Promise.all(Array.from({length:40},(_,i)=>localPost('/simulate/reserve',{
    user:'fake-member-paid-'+i,requestKey:'local-paid-'+i,mode:'paid'
  })));
  assert.ok(deniedPaid.every(x=>!x.accepted),'NT$0 must block paid model');
  const deniedUnknown=await localPost('/simulate/reserve',{
    user:'fake-member-unknown',requestKey:'local-unknown-0001',mode:'unknown'
  });
  assert.equal(deniedUnknown.accepted,false,'unknown model fails closed');
  const summary=await localPost('/simulate/summary',{});
  assert.equal(summary.rows,300,'unique reservation count');
  assert.equal(summary.events,300,'each accepted reservation has 1 immutable event');
  for(const scope of ['global','app:echostars','task:echostars:echo.qa']){
    assert.equal(summary.scopes[scope].calls,300,scope);
    assert.equal(summary.scopes[scope].held,0,scope);
  }
  assert.equal(summary.scopes['free:@cf/fake/offline-free'].freeUnits,300);
  assert.ok(maxAssigned<=96,'hard socket ceiling');
  console.log('B07_OFFLINE_HTTP_FAKE_USERS_OK '+JSON.stringify({
    fakeIdentities:2000,submittedHTTP:2000,
    concurrentSocketLimit:96,peakClientAssignedSockets:maxAssigned,
    peakServerPendingSQLite:maxServerPending,
    uniqueFreeReservations:300,repeatHTTP:80,paidBlocked:40,unknownBlocked:1,
    trueCloudflareUsersMeasured:0,cloudflareRequests:0,paidProviderCalls:0,
    p50ms:p(latencies,.50),p95ms:p(latencies,.95),p99ms:p(latencies,.99),
    elapsedMs:Number((performance.now()-startedAt).toFixed(1))
  }));
}finally{
  agent.destroy();
  await new Promise(resolve=>server.close(resolve));
  child.stdin.end();child.kill();
  rmSync(temporary,{force:true,recursive:true});
}
