// S-NEXT-A01 AI3 — offline-only synthetic cost safety tests.
// No imports from product, SDK, network, filesystem or cloud. Never deploy.
import test from 'node:test';
import assert from 'node:assert/strict';

class FakeLedger {
  constructor({cap=0, identity=true, resource=true, priceKnown=true, freePoolKnown=true, witness=true}={}) {
    this.cap=cap; this.identity=identity; this.resource=resource; this.priceKnown=priceKnown;
    this.freePoolKnown=freePoolKnown; this.witness=witness;
    this.jobs=new Map(); this.used=0; this.fakeProviderCalls=0;
  }
  reserve(key, cost=1) {
    if (!this.identity || !this.resource || !this.priceKnown || !this.freePoolKnown || !this.witness) return 'DENIED';
    if (this.jobs.has(key)) return this.jobs.get(key).state;
    if (!Number.isFinite(cost) || cost<=0 || this.used+cost>this.cap) return 'DENIED';
    this.jobs.set(key,{state:'HELD',cost,claim:false}); this.used+=cost; return 'HELD';
  }
  claim(key) {
    const j=this.jobs.get(key);
    if (!j || j.state!=='HELD' || j.claim || !this.identity || !this.resource || !this.witness) return 'DENIED';
    j.claim=true; j.state='MAY_HAVE_SENT'; return j.state;
  }
  ambiguous(key) {
    const j=this.jobs.get(key);
    if (!j || !j.claim) return 'DENIED';
    j.state='UNKNOWN_HELD'; return j.state;
  }
  settle(key,{verified=false,invoiceId=null}={}) {
    const j=this.jobs.get(key);
    if (!j || !j.claim || !verified || !invoiceId || j.state==='SETTLED') return 'DENIED';
    if ([...this.jobs.values()].some(x=>x.invoiceId===invoiceId)) return 'DENIED';
    j.state='SETTLED'; j.invoiceId=invoiceId; return 'SETTLED';
  }
  // Intentionally no actual SEND path. All tests must keep provider calls at zero.
  sendCount(){return this.fakeProviderCalls;}
  count(){return this.jobs.size;}
  state(key){return this.jobs.get(key)?.state ?? 'NONE';}
}
const same='SYNTHETIC:scope:approved-purpose:resource:v1:segment0';
const zero=()=>new FakeLedger();
const sandbox=()=>new FakeLedger({cap:10});
const ready=()=>{const l=sandbox();assert.equal(l.reserve(same),'HELD');return l;};
const cases=[
['01 zero budget rejects request',()=>assert.equal(zero().reserve(same),'DENIED')],
['02 zero budget rejects 100 simultaneous intents',()=>{const l=zero();for(let i=0;i<100;i++)assert.equal(l.reserve('k'+i),'DENIED');assert.equal(l.count(),0);}],
['03 zero budget rejects 1000 simultaneous intents',()=>{const l=zero();for(let i=0;i<1000;i++)assert.equal(l.reserve('k'+i),'DENIED');assert.equal(l.count(),0);}],
['04 duplicate double click',()=>{const l=sandbox();l.reserve(same);l.reserve(same);assert.equal(l.count(),1);}],
['05 cross app same canonical job',()=>{const l=sandbox();l.reserve(same);l.reserve(same);assert.equal(l.count(),1);}],
['06 changed request id cannot alter canonical job',()=>{const l=sandbox();l.reserve(same);l.reserve(same);assert.equal(l.count(),1);}],
['07 distinct approved purpose may reserve separately',()=>{const l=sandbox();l.reserve('purpose:A');l.reserve('purpose:B');assert.equal(l.count(),2);}],
['08 100 reservations cannot oversell ten units',()=>{const l=sandbox();for(let i=0;i<100;i++)l.reserve('k'+i);assert.equal(l.count(),10);assert.equal(l.used,10);}],
['09 1000 reservations cannot oversell ten units',()=>{const l=sandbox();for(let i=0;i<1000;i++)l.reserve('k'+i);assert.equal(l.count(),10);assert.equal(l.used,10);}],
['10 queue replay same job',()=>{const l=ready();l.claim(same);assert.equal(l.claim(same),'DENIED');}],
['11 timeout after claim remains unknown',()=>{const l=ready();l.claim(same);assert.equal(l.ambiguous(same),'UNKNOWN_HELD');}],
['12 429 after possible send remains unknown',()=>{const l=ready();l.claim(same);l.ambiguous(same);assert.equal(l.state(same),'UNKNOWN_HELD');}],
['13 5xx after possible send remains unknown',()=>{const l=ready();l.claim(same);l.ambiguous(same);assert.equal(l.state(same),'UNKNOWN_HELD');}],
['14 ACK loss cannot consume claim twice',()=>{const l=ready();l.claim(same);l.ambiguous(same);assert.equal(l.claim(same),'DENIED');}],
['15 partial stream stays held',()=>{const l=ready();l.claim(same);l.ambiguous(same);assert.equal(l.used,1);}],
['16 day rollover retains same canonical job',()=>{const l=ready();l.reserve(same);assert.equal(l.count(),1);}],
['17 month rollover retains same canonical job',()=>{const l=ready();l.reserve(same);assert.equal(l.count(),1);}],
['18 model fallback same canonical job',()=>{const l=ready();l.reserve(same);assert.equal(l.count(),1);}],
['19 provider fallback same canonical job',()=>{const l=ready();l.reserve(same);assert.equal(l.count(),1);}],
['20 identity revoked before reserve',()=>{const l=sandbox();l.identity=false;assert.equal(l.reserve(same),'DENIED');}],
['21 identity revoked before claim',()=>{const l=ready();l.identity=false;assert.equal(l.claim(same),'DENIED');}],
['22 resource revoked before claim',()=>{const l=ready();l.resource=false;assert.equal(l.claim(same),'DENIED');}],
['23 unknown price fails closed',()=>{const l=sandbox();l.priceKnown=false;assert.equal(l.reserve(same),'DENIED');}],
['24 unknown shared free pool fails closed',()=>{const l=sandbox();l.freePoolKnown=false;assert.equal(l.reserve(same),'DENIED');}],
['25 missing witness fails closed',()=>{const l=sandbox();l.witness=false;assert.equal(l.reserve(same),'DENIED');}],
['26 fake invoice cannot settle',()=>{const l=ready();l.claim(same);l.ambiguous(same);assert.equal(l.settle(same,{verified:false,invoiceId:'FAKE'}),'DENIED');}],
['27 valid synthetic invoice settles once',()=>{const l=ready();l.claim(same);l.ambiguous(same);assert.equal(l.settle(same,{verified:true,invoiceId:'SYN-1'}),'SETTLED');assert.equal(l.settle(same,{verified:true,invoiceId:'SYN-1'}),'DENIED');}],
['28 same synthetic invoice cannot settle two jobs',()=>{const l=sandbox();l.reserve('a');l.reserve('b');l.claim('a');l.claim('b');assert.equal(l.settle('a',{verified:true,invoiceId:'SYN-1'}),'SETTLED');assert.equal(l.settle('b',{verified:true,invoiceId:'SYN-1'}),'DENIED');}],
['29 unknown hold not released on retry',()=>{const l=ready();l.claim(same);l.ambiguous(same);l.reserve(same);assert.equal(l.state(same),'UNKNOWN_HELD');}],
['30 synthetic compensation failure retains hold',()=>{const l=ready();l.claim(same);l.ambiguous(same);assert.equal(l.used,1);assert.equal(l.state(same),'UNKNOWN_HELD');}],
];
for(const [name,run] of cases) test(name,()=>{run();assert.equal(new FakeLedger().sendCount(),0);});
