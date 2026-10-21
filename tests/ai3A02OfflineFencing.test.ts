// AI3 S-NEXT-A02: deterministic, isolated synthetic tests. NOT production billing proof.
// Runs under existing tests/*.test.ts regression workflow. No network, SDK, secrets or provider.
import test from 'node:test';
import assert from 'node:assert/strict';

type State='RESERVED'|'MAY_HAVE_SENT'|'UNKNOWN_HELD'|'SETTLED';
type Job={state:State; cost:number; epoch:number; claimCount:number; receipt?:string};
class FakeAuthority {
  private jobs=new Map<string,Job>();
  private invoices=new Set<string>();
  private cap:number;
  private epoch=1;
  private used=0;
  private available=true;
  private authorized=true;
  private sendAttempts=0;
  constructor(cap:number){this.cap=cap;}
  setOnline(x:boolean){this.available=x;}
  setAuthorized(x:boolean){this.authorized=x;}
  fence(){this.epoch++;}
  reserve(key:string,cost:number,observedEpoch=this.epoch):string {
    if(!this.available||!this.authorized||observedEpoch!==this.epoch) return 'DENIED';
    if(this.jobs.has(key)) return this.jobs.get(key)!.state;
    if(!Number.isSafeInteger(cost)||cost<=0||this.used+cost>this.cap) return 'DENIED';
    this.jobs.set(key,{state:'RESERVED',cost,epoch:this.epoch,claimCount:0});this.used+=cost;return 'RESERVED';
  }
  claim(key:string,observedEpoch=this.epoch):string {
    const j=this.jobs.get(key);
    if(!this.available||!this.authorized||!j||j.state!=='RESERVED'||j.claimCount!==0||j.epoch!==this.epoch||observedEpoch!==this.epoch) return 'DENIED';
    j.claimCount=1;j.state='MAY_HAVE_SENT';return j.state;
  }
  uncertain(key:string):string {
    const j=this.jobs.get(key);
    if(!j||j.claimCount!==1||j.state==='SETTLED')return 'DENIED';
    j.state='UNKNOWN_HELD';return j.state;
  }
  settle(key:string,receipt:string,verified:boolean):string {
    const j=this.jobs.get(key);
    if(!j||!verified||!receipt||this.invoices.has(receipt)||j.claimCount!==1||j.state==='SETTLED')return 'DENIED';
    j.receipt=receipt;j.state='SETTLED';this.invoices.add(receipt);return 'SETTLED';
  }
  get held(){return this.used;}
  get size(){return this.jobs.size;}
  get claims(){return [...this.jobs.values()].reduce((a,j)=>a+j.claimCount,0);}
  get providerCalls(){return this.sendAttempts;} // There is intentionally no send method.
  get currentEpoch(){return this.epoch;}
  state(key:string){return this.jobs.get(key)?.state??'NONE';}
}
const key='approved-purpose:owner:resource:source:v1:segment:0';
const cases:Array<[string,()=>void]>=[
['zero cost ceiling denies all new grants',()=>{const a=new FakeAuthority(0);assert.equal(a.reserve(key,1),'DENIED');assert.equal(a.providerCalls,0);}],
['single reservation consumes held ceiling',()=>{const a=new FakeAuthority(2);assert.equal(a.reserve(key,2),'RESERVED');assert.equal(a.held,2);}],
['same canonical key is deduplicated',()=>{const a=new FakeAuthority(2);a.reserve(key,1);assert.equal(a.reserve(key,1),'RESERVED');assert.equal(a.size,1);assert.equal(a.held,1);}],
['different approved purposes respect total ceiling',()=>{const a=new FakeAuthority(2);a.reserve('a',1);a.reserve('b',1);assert.equal(a.reserve('c',1),'DENIED');assert.equal(a.size,2);}],
['1000 deterministic contending reservations never oversell',()=>{const a=new FakeAuthority(17);for(let i=0;i<1000;i++)a.reserve('k'+i,1);assert.equal(a.size,17);assert.equal(a.held,17);}],
['1000 repeated intents never create second reservation',()=>{const a=new FakeAuthority(1);for(let i=0;i<1000;i++)a.reserve(key,1);assert.equal(a.size,1);assert.equal(a.held,1);}],
['duplicate SEND claim denied after first',()=>{const a=new FakeAuthority(1);a.reserve(key,1);assert.equal(a.claim(key),'MAY_HAVE_SENT');assert.equal(a.claim(key),'DENIED');assert.equal(a.claims,1);}],
['1000 deterministic claim contenders yield one claim',()=>{const a=new FakeAuthority(1);a.reserve(key,1);let wins=0;for(let i=0;i<1000;i++)if(a.claim(key)==='MAY_HAVE_SENT')wins++;assert.equal(wins,1);assert.equal(a.claims,1);}],
['ACK lost leaves unknown and blocks re-send',()=>{const a=new FakeAuthority(1);a.reserve(key,1);a.claim(key);a.uncertain(key);assert.equal(a.claim(key),'DENIED');assert.equal(a.state(key),'UNKNOWN_HELD');}],
['timeout leaves full cost held',()=>{const a=new FakeAuthority(1);a.reserve(key,1);a.claim(key);a.uncertain(key);assert.equal(a.held,1);}],
['429 uncertainty does not refund',()=>{const a=new FakeAuthority(1);a.reserve(key,1);a.claim(key);a.uncertain(key);assert.equal(a.reserve('other',1),'DENIED');}],
['5xx uncertainty does not retry',()=>{const a=new FakeAuthority(1);a.reserve(key,1);a.claim(key);a.uncertain(key);assert.equal(a.claim(key),'DENIED');}],
['partial stream uncertainty does not retry',()=>{const a=new FakeAuthority(1);a.reserve(key,1);a.claim(key);a.uncertain(key);assert.equal(a.claims,1);}],
['recovery of unknown requires verified unique receipt',()=>{const a=new FakeAuthority(1);a.reserve(key,1);a.claim(key);a.uncertain(key);assert.equal(a.settle(key,'invoice-1',false),'DENIED');assert.equal(a.state(key),'UNKNOWN_HELD');assert.equal(a.settle(key,'invoice-1',true),'SETTLED');}],
['duplicate verified invoice rejected',()=>{const a=new FakeAuthority(2);a.reserve('a',1);a.reserve('b',1);a.claim('a');a.claim('b');assert.equal(a.settle('a','receipt',true),'SETTLED');assert.equal(a.settle('b','receipt',true),'DENIED');}],
['recovery cannot make settled job claimable',()=>{const a=new FakeAuthority(1);a.reserve(key,1);a.claim(key);a.settle(key,'receipt',true);assert.equal(a.claim(key),'DENIED');}],
['stale authority epoch rejects reserve',()=>{const a=new FakeAuthority(2);const old=a.currentEpoch;a.fence();assert.equal(a.reserve(key,1,old),'DENIED');}],
['stale authority epoch rejects SEND claim',()=>{const a=new FakeAuthority(2);const old=a.currentEpoch;a.reserve(key,1);a.fence();assert.equal(a.claim(key,old),'DENIED');}],
['fence invalidates pre-existing reserved grant',()=>{const a=new FakeAuthority(2);a.reserve(key,1);a.fence();assert.equal(a.claim(key),'DENIED');assert.equal(a.held,1);}],
['offline authority fails closed',()=>{const a=new FakeAuthority(2);a.setOnline(false);assert.equal(a.reserve(key,1),'DENIED');}],
['authority offline before SEND fails closed',()=>{const a=new FakeAuthority(2);a.reserve(key,1);a.setOnline(false);assert.equal(a.claim(key),'DENIED');}],
['revocation before reserve fails closed',()=>{const a=new FakeAuthority(2);a.setAuthorized(false);assert.equal(a.reserve(key,1),'DENIED');}],
['revocation before SEND fails closed',()=>{const a=new FakeAuthority(2);a.reserve(key,1);a.setAuthorized(false);assert.equal(a.claim(key),'DENIED');}],
['invalid zero or negative cost denied',()=>{const a=new FakeAuthority(2);assert.equal(a.reserve('a',0),'DENIED');assert.equal(a.reserve('b',-1),'DENIED');}],
['fractional and overflow cost denied',()=>{const a=new FakeAuthority(2);assert.equal(a.reserve('a',0.5),'DENIED');assert.equal(a.reserve('b',Number.MAX_VALUE),'DENIED');}],
['no Provider SEND API exists in fake authority',()=>{const a=new FakeAuthority(1);a.reserve(key,1);a.claim(key);assert.equal(a.providerCalls,0);}],
];
for(const [name,run] of cases)test('AI3 A02 '+name,()=>{run();});
