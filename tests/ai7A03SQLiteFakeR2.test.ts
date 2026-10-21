/**
 * AI7 S-NEXT-A03: isolated on-disk SQLite + fake-R2 end-to-end backup safety.
 * Test-only. All files live in mkdtemp; no Cloudflare, real R2/D1,
 * production restore, delete, cleanup, credentials or external network calls.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash, createHmac } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type Doc = { id:string; app:string; body:string; version:number };
type Backup = { id:string; app:string; kind:string; parent:string|null; seq:number; epoch:number; del:number; rev:number; sha:string };
type Seal = { id:string; app:string; sha:string; seq:number; epoch:number; signature:string };
type Approval = { human:string; request:string; target:string; headHash:string; epoch:number; scope:string; expires:number; active:boolean; signature:string };
const digest=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
const sign=(secret:string,x:object)=>createHmac('sha256',secret).update(JSON.stringify(x)).digest('hex');
const witnessBody=(x:Seal)=>({id:x.id,app:x.app,sha:x.sha,seq:x.seq,epoch:x.epoch});
const approvalBody=(x:Approval)=>({human:x.human,request:x.request,target:x.target,headHash:x.headHash,epoch:x.epoch,scope:x.scope,expires:x.expires});
const headSecret='FAKE_ONLY_NOT_A_REAL_CUSTODIAN_HEAD',floorSecret='FAKE_ONLY_NOT_A_REAL_CUSTODIAN_FLOOR';
const humanKeys:Record<string,string>={HUMAN_A:'FAKE_HUMAN_A_KEY',HUMAN_B:'FAKE_HUMAN_B_KEY'};
const reject=(code:string):never=>{throw new Error(code);};
const safeId=(id:string)=>/^[A-Za-z][A-Za-z0-9_-]*$/.test(id);

class Lab {
  dir:string; r2:string; source:DatabaseSync; backups:DatabaseSync; safety:DatabaseSync; recovered:DatabaseSync;
  head:Seal; floor:Seal; approvals:Approval[]=[];
  request='FAKE-REQ-0001'; target='D2'; scope='echo:restore'; online=true; writerCount=1; centralCopied=false; interrupt=false;
  constructor(){
    this.dir=mkdtempSync(join(tmpdir(),'ai7-a03-fake-'));this.r2=join(this.dir,'fake-r2');mkdirSync(this.r2);
    this.source=new DatabaseSync(join(this.dir,'fake-source.sqlite'));
    this.backups=new DatabaseSync(join(this.dir,'fake-manifest.sqlite'));
    this.safety=new DatabaseSync(join(this.dir,'fake-safety.sqlite'));
    this.recovered=new DatabaseSync(join(this.dir,'fake-recovery.sqlite'));
    this.source.exec('CREATE TABLE docs(id TEXT PRIMARY KEY,app TEXT,body TEXT,version INTEGER)');
    this.recovered.exec('CREATE TABLE docs(id TEXT PRIMARY KEY,app TEXT,body TEXT,version INTEGER)');
    this.backups.exec('CREATE TABLE backups(id TEXT PRIMARY KEY,app TEXT,kind TEXT,parent TEXT,seq INTEGER,epoch INTEGER,del INTEGER,rev INTEGER,sha TEXT)');
    this.safety.exec('CREATE TABLE fences(name TEXT PRIMARY KEY,value INTEGER); CREATE TABLE claims(request TEXT PRIMARY KEY)');
    for(const [k,v] of [['epoch',4],['deletion',20],['revocation',20]] as const)
      this.safety.prepare('INSERT INTO fences(name,value) VALUES(?,?)').run(k,v);
    this.source.prepare('INSERT INTO docs VALUES(?,?,?,?)').run('r1','echo','ORIGINAL',1);
    this.source.prepare('INSERT INTO docs VALUES(?,?,?,?)').run('r2','echo','SECOND',1);
    const initial=this.source.prepare('SELECT * FROM docs ORDER BY id').all() as Doc[];
    this.put('F1','FULL',null,10,{docs:initial});
    this.source.prepare('UPDATE docs SET body=?,version=? WHERE id=?').run('UPDATED',2,'r1');
    this.source.prepare('INSERT INTO docs VALUES(?,?,?,?)').run('r3','echo','THIRD',1);
    this.put('D2','DELTA','F1',11,{changes:[{id:'r1',app:'echo',body:'UPDATED',version:2},{id:'r3',app:'echo',body:'THIRD',version:1}]});
    this.head=this.sealWitness('D2',headSecret);
    this.floor=this.sealWitness('F1',floorSecret);
    this.approvals=[this.approve('HUMAN_A'),this.approve('HUMAN_B')];
    // SQLite ATTACH is restricted to a freshly allocated, local temp path.
    const recoveredPath=join(this.dir,'fake-recovery.sqlite').replace(/'/g,"''");
    this.safety.exec("ATTACH DATABASE '"+recoveredPath+"' AS sandbox");
  }
  put(id:string,kind:string,parent:string|null,seq:number,body:object){
    const obj={id,app:'echo',kind,parent,seq,epoch:4,...body};
    const bytes=Buffer.from(JSON.stringify(obj),'utf8');
    writeFileSync(join(this.r2,id+'.json'),bytes);
    this.backups.prepare('INSERT INTO backups VALUES(?,?,?,?,?,?,?,?,?)').run(id,'echo',kind,parent,seq,4,20,20,digest(bytes));
  }
  rec(id:string):Backup{
    const row=this.backups.prepare('SELECT * FROM backups WHERE id=?').get(id) as Backup|undefined;
    if(!row)reject('CHAIN_MISSING');return row!;
  }
  sealWitness(id:string,secret:string):Seal{
    const r=this.rec(id);
    const body={id:r.id,app:r.app,sha:r.sha,seq:r.seq,epoch:r.epoch};
    return {...body,signature:sign(secret,body)};
  }
  approve(human:string):Approval {
    const x={human,request:this.request,target:this.target,headHash:this.head.sha,epoch:4,scope:this.scope,expires:Date.now()+3600000,active:true};
    return {...x,signature:sign(humanKeys[human]||'INVALID',x)};
  }
  fence(k:string):number {return Number((this.safety.prepare('SELECT value FROM fences WHERE name=?').get(k) as {value:number}|undefined)?.value??-1);}
  setFence(k:string,value:number){this.safety.prepare('UPDATE fences SET value=? WHERE name=?').run(value,k);}
  readChain():Doc[]{
    if(!this.online||this.writerCount!==1)reject('CUTOVER');
    if(this.centralCopied||this.scope!=='echo:restore')reject('ISOLATION');
    if(!this.head||!this.floor)reject('WITNESS');
    if(sign(headSecret,witnessBody(this.head))!==this.head.signature||sign(floorSecret,witnessBody(this.floor))!==this.floor.signature)reject('WITNESS');
    if(this.head.id!==this.target||this.head.app!=='echo'||this.floor.app!=='echo'||this.floor.seq>this.head.seq)reject('WITNESS');
    if(this.head.epoch!==this.fence('epoch')||this.floor.epoch!==this.fence('epoch'))reject('EPOCH');
    if(this.approvals.length!==2||new Set(this.approvals.map(x=>x.human)).size!==2)reject('TWO_HUMANS');
    for(const a of this.approvals){
      if(!a.active||a.expires<=Date.now()||!humanKeys[a.human]||a.request!==this.request||a.target!==this.target||
         a.headHash!==this.head.sha||a.epoch!==this.fence('epoch')||a.scope!==this.scope||
         sign(humanKeys[a.human],approvalBody(a))!==a.signature)reject('TWO_HUMANS');
    }
    const rows=this.backups.prepare('SELECT * FROM backups').all() as Backup[];
    const byId=new Map(rows.map(r=>[r.id,r]));
    if(byId.size!==rows.length||!byId.has(this.target))reject('CHAIN_MISSING');
    const ancestors:Backup[]=[];const seen=new Set<string>();let cursor:string|null=this.target;let previous=Infinity;
    while(cursor){
      if(!safeId(cursor)||seen.has(cursor))reject('CHAIN_CYCLE');seen.add(cursor);
      const r=byId.get(cursor);
      if(!r||r.app!=='echo'||r.seq>=previous)reject('CHAIN_MISSING');
      if(r.epoch!==this.fence('epoch'))reject('EPOCH');
      if(r.del<this.fence('deletion')||r.rev<this.fence('revocation'))reject('REVOCATION');
      ancestors.push(r);previous=r.seq;
      if(r.kind==='FULL'){if(r.parent!==null)reject('CHAIN_PARENT');break;}
      if(r.kind!=='DELTA'||!r.parent)reject('CHAIN_PARENT');
      cursor=r.parent;
    }
    if(ancestors.at(-1)?.kind!=='FULL'||ancestors.length!==rows.length)reject('CHAIN_ORPHAN');
    if(this.head.sha!==ancestors[0].sha||this.head.seq!==ancestors[0].seq)reject('WITNESS');
    const floorNode=ancestors.find(x=>x.id===this.floor.id);
    if(!floorNode||this.floor.seq!==floorNode.seq||this.floor.sha!==floorNode.sha)reject('WITNESS');
    const state=new Map<string,Doc>();
    for(const r of ancestors.reverse()){
      let raw:Buffer;
      try {raw=readFileSync(join(this.r2,r.id+'.json'));} catch {return reject('CHAIN_MISSING_FILE');}
      if(digest(raw)!==r.sha)reject('CHAIN_HASH');
      let data:any;
      try {data=JSON.parse(raw.toString('utf8'));}catch{return reject('CHAIN_FORMAT');}
      if(data.id!==r.id||data.app!==r.app||data.kind!==r.kind||data.parent!==r.parent||data.seq!==r.seq||data.epoch!==r.epoch)reject('CHAIN_FORMAT');
      const changes=r.kind==='FULL'?data.docs:data.changes;
      if(!Array.isArray(changes))reject('CHAIN_FORMAT');
      const batch=new Set<string>();
      for(const x of changes){
        if(!x||typeof x.id!=='string'||!safeId(x.id)||batch.has(x.id)||x.app!=='echo'||!Number.isInteger(x.version)||x.version<=0||typeof x.body!=='string')reject('CHAIN_FORMAT');
        batch.add(x.id);
        const old=state.get(x.id);
        if(old&&x.version<=old.version)reject('CHAIN_REVISION');
        state.set(x.id,{id:x.id,app:x.app,body:x.body,version:x.version});
      }
    }
    return [...state.values()].sort((a,b)=>a.id.localeCompare(b.id));
  }
  restoreSandboxOnly():Doc[]{
    if(this.safety.prepare('SELECT request FROM claims WHERE request=?').get(this.request))reject('REPLAY');
    const docs=this.readChain();
    this.safety.exec('BEGIN IMMEDIATE');
    try{
      this.safety.prepare('INSERT INTO claims(request) VALUES(?)').run(this.request);
      this.safety.exec('DELETE FROM sandbox.docs');
      for(const d of docs) this.safety.prepare('INSERT INTO sandbox.docs VALUES(?,?,?,?)').run(d.id,d.app,d.body,d.version);
      if(this.interrupt)reject('INJECTED_CRASH');
      this.safety.exec('COMMIT');
    }catch(e){this.safety.exec('ROLLBACK');throw e;}
    return this.recovered.prepare('SELECT * FROM docs ORDER BY id').all() as Doc[];
  }
  clean(){
    for(const db of [this.source,this.backups,this.recovered,this.safety])try{db.close();}catch{}
    rmSync(this.dir,{recursive:true,force:true});
  }
}
const run=(name:string,mutate:(lab:Lab)=>void,expected:string)=>{
 test('AI7 A03 SQLITE+FAKE-R2 '+name,t=>{
   const lab=new Lab();t.after(()=>lab.clean());
   mutate(lab);assert.throws(()=>lab.restoreSandboxOnly(),new RegExp(expected));
   assert.equal((lab.recovered.prepare('SELECT COUNT(*) AS n FROM docs').get() as {n:number}).n,0,'denied operation must write zero recovery rows');
   assert.equal((lab.safety.prepare('SELECT COUNT(*) AS n FROM claims').get() as {n:number}).n,0,'denied operation must consume zero claims');
 });
};
test('AI7 A03 verified Full -> Delta restores bytes into disposable SQLite only',t=>{
 const lab=new Lab();t.after(()=>lab.clean());
 const rows=lab.restoreSandboxOnly();
 assert.deepEqual(rows.map(x=>[x.id,x.body,x.version]),[['r1','UPDATED',2],['r2','SECOND',1],['r3','THIRD',1]]);
 assert.equal(lab.fence('epoch'),4);
 assert.equal((lab.safety.prepare('SELECT COUNT(*) AS n FROM claims').get() as {n:number}).n,1);
 assert.equal((lab.source.prepare('SELECT body FROM docs WHERE id=?').get('r1') as {body:string}).body,'UPDATED');
});
run('missing FULL disk object',lab=>unlinkSync(join(lab.r2,'F1.json')),'CHAIN_MISSING_FILE');
run('missing DELTA disk object',lab=>unlinkSync(join(lab.r2,'D2.json')),'CHAIN_MISSING_FILE');
run('corrupted FULL bytes',lab=>writeFileSync(join(lab.r2,'F1.json'),'MUTATED'),'CHAIN_HASH');
run('corrupted DELTA bytes',lab=>writeFileSync(join(lab.r2,'D2.json'),'MUTATED'),'CHAIN_HASH');
run('missing FULL manifest parent',lab=>lab.backups.prepare('DELETE FROM backups WHERE id=?').run('F1'),'CHAIN_MISSING');
run('cycle in delta links',lab=>lab.backups.prepare('UPDATE backups SET parent=? WHERE id=?').run('D2','D2'),'CHAIN_CYCLE');
run('nonmonotonic sequence',lab=>lab.backups.prepare('UPDATE backups SET seq=? WHERE id=?').run(9,'D2'),'CHAIN_MISSING');
run('orphan backup metadata',lab=>lab.backups.prepare('INSERT INTO backups VALUES(?,?,?,?,?,?,?,?,?)').run('ORPHAN','echo','DELTA','F1',12,4,20,20,digest('ORPHAN')),'CHAIN_ORPHAN');
run('cross App manifest',lab=>lab.backups.prepare('UPDATE backups SET app=? WHERE id=?').run('download','F1'),'CHAIN_MISSING');
run('backup version/epoch rollback',lab=>lab.backups.prepare('UPDATE backups SET epoch=? WHERE id=?').run(3,'D2'),'EPOCH');
run('restoreEpoch authority advanced',lab=>lab.setFence('epoch',5),'EPOCH');
run('newer deletion tombstone blocks restore',lab=>lab.setFence('deletion',21),'REVOCATION');
run('newer permission revocation blocks restore',lab=>lab.setFence('revocation',21),'REVOCATION');
run('head signature tampered',lab=>{lab.head.signature='invalid'},'WITNESS');
run('head latest id mismatched',lab=>{lab.head.id='F1'},'WITNESS');
run('head hash does not match manifest',lab=>{lab.head.sha='wrong'},'WITNESS');
run('floor signature tampered',lab=>{lab.floor.signature='invalid'},'WITNESS');
run('floor missing',lab=>{lab.floor=null as unknown as Seal},'WITNESS');
run('floor ahead of head',lab=>{lab.floor.seq=12;lab.floor.signature=sign(floorSecret,witnessBody(lab.floor))},'WITNESS');
run('single approver rejected',lab=>{lab.approvals.pop()},'TWO_HUMANS');
run('same human twice rejected',lab=>{lab.approvals[1]={...lab.approvals[0]}},'TWO_HUMANS');
run('approval expires',lab=>{lab.approvals[1].expires=Date.now()-1},'TWO_HUMANS');
run('approval revoked',lab=>{lab.approvals[1].active=false},'TWO_HUMANS');
run('approval wrong request',lab=>{lab.request='FAKE-REQ-DIFFERENT'},'TWO_HUMANS');
run('approval wrong scope',lab=>{lab.approvals[1].scope='download:restore'},'TWO_HUMANS');
run('claim request modified signature',lab=>{lab.approvals[1].signature='bad'},'TWO_HUMANS');
run('central identity/ledger copy forbidden',lab=>{lab.centralCopied=true},'ISOLATION');
run('cross-App scope forbidden',lab=>{lab.scope='download:restore'},'ISOLATION');
run('authority unreachable',lab=>{lab.online=false},'CUTOVER');
run('two concurrent writers',lab=>{lab.writerCount=2},'CUTOVER');
test('AI7 A03 durable claim refuses replay after completed sandbox restore',t=>{
 const lab=new Lab();t.after(()=>lab.clean());lab.restoreSandboxOnly();
 assert.throws(()=>lab.restoreSandboxOnly(),/REPLAY/);
 assert.equal((lab.safety.prepare('SELECT COUNT(*) AS n FROM claims').get() as {n:number}).n,1);
});
test('AI7 A03 crash in attached SQLite transaction rolls back data and claim',t=>{
 const lab=new Lab();t.after(()=>lab.clean());lab.interrupt=true;
 assert.throws(()=>lab.restoreSandboxOnly(),/INJECTED_CRASH/);
 assert.equal((lab.recovered.prepare('SELECT COUNT(*) AS n FROM docs').get() as {n:number}).n,0);
 assert.equal((lab.safety.prepare('SELECT COUNT(*) AS n FROM claims').get() as {n:number}).n,0);
 lab.interrupt=false;assert.equal(lab.restoreSandboxOnly().length,3,'safe retry allowed after rollback');
});
test('AI7 A03 safety DB fence is external to snapshot and remains authoritative',t=>{
 const lab=new Lab();t.after(()=>lab.clean());lab.setFence('deletion',25);
 assert.throws(()=>lab.restoreSandboxOnly(),/REVOCATION/);
 assert.equal(lab.fence('deletion'),25);
 assert.equal((lab.safety.prepare('SELECT COUNT(*) AS n FROM claims').get() as {n:number}).n,0);
});
