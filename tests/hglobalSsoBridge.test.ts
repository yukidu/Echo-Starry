import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {handleStarryEcosystemSso} from '../worker/starryEcosystemSsoRouter';

const c=globalThis.crypto??webcrypto;
const secret='hglobal-test-only-bridge-secret-please-rotate-0001';
const code='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
async function request(bodyCode=code,{timestamp=Date.now(),key=secret,signature}:{timestamp?:number;key?:string;signature?:string}={}){
 const t=String(timestamp);
 let sig=signature;
 if(!sig){
  const k=await c.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=await c.subtle.sign('HMAC',k,new TextEncoder().encode('hglobal-v1\n'+t+'\n'+bodyCode));
  sig=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
 }
 return new Request('https://id.starry.phd/api/apps/hglobal/exchange',{
  method:'POST',
  headers:{'Content-Type':'application/json','X-HGlobal-Timestamp':t,'X-HGlobal-Signature':sig},
  body:JSON.stringify({code:bodyCode})
 });
}
function fakeDb(){
 let used=false,consumes=0;
 return {
  get consumes(){return consumes},
  prepare(sql:string){
    return {
      bind(...args:any[]){
        return {
          async first(){
            if(sql.includes('DELETE FROM starry_app_auth_codes')){
              consumes++;
              if(used)return null;
              used=true;
              return {userId:'member-1'};
            }
            if(sql.includes('FROM app_memberships'))return {status:'active'};
            if(sql.includes('FROM users u')||sql.includes('FROM users\n'))return {
              userId:'member-1',primaryEmail:'member@example.com',status:'active',
              name:'會員姓名',avatar:'https://example.test/avatar.png',
              googleAvatar:'',rank:'3%',approvedRank:'3%',rankApproved:1
            };
            return null;
          }
        };
      },
      async run(){return {success:true}}
    };
  }
 };
}
async function call(req:Request,env:any){
 const res=await handleStarryEcosystemSso(req,env,{},async()=>new Response('unexpected',{status:500}));
 assert.ok(res,'H-Global endpoint must be handled');
 return res;
}
test('H-Global SSO exchange fails closed without independently provisioned secret',async()=>{
 const result=await call(await request(),{STARRY_ID_DB:fakeDb()});
 assert.equal(result?.status,503);
});
test('H-Global bridge validates signed time and consumes central ticket exactly once',async()=>{
 const db=fakeDb(),env={STARRY_ID_DB:db,HGLOBAL_SSO_EXCHANGE_SECRET:secret};
 const invalid=await call(await request(code,{key:'wrong-secret-xxx-xxxxxxxxxxxxxxxxxx'}),env);
 assert.equal(invalid?.status,401);
 assert.equal(db.consumes,0);
 const expired=await call(await request(code,{timestamp:Date.now()-120000}),env);
 assert.equal(expired?.status,401);
 assert.equal(db.consumes,0);
 const first=await call(await request(),env);
 assert.equal(first?.status,200);
 const body=await first?.json() as any;
 assert.equal(body.subject,'member-1');
 assert.equal(body.authenticated,true);
 assert.equal(body.email,undefined);
 assert.equal(db.consumes,1);
 const replay=await call(await request(),env);
 assert.equal(replay?.status,401);
 assert.equal(db.consumes,2);
});
