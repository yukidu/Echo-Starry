import test from 'node:test';
import assert from 'node:assert/strict';
import { renderStarryIdMemberCenterPage } from '../worker/starryIdMemberCenterPage';
import {readFileSync} from 'node:fs';

async function guestScript(){
  const response=renderStarryIdMemberCenterPage('test-client.apps.googleusercontent.com');
  const html=await response.text();
  const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script,'Member UI should include a runnable manager script');
  assert.doesNotThrow(()=>new Function(script),'Generated browser script must be valid JS');
  return {html,script};
}

function guestReader(source:string,fetcher:(path:string,options:any)=>Promise<any>,shortMs?:number) {
  const start=source.indexOf('    const GUEST_READ_TIMEOUT_MS=');
  const end=source.indexOf('    async function loadGuestAccess(){',start);
  assert.ok(start>=0&&end>start,'Use actual production guest GET implementation');
  let segment=source.slice(start,end);
  assert.match(segment,/const GUEST_READ_TIMEOUT_MS=8000;/);
  assert.match(segment,/clearTimeout\(timeout\)/);
  assert.match(segment,/signal:controller.signal/);
  if(shortMs)segment=segment.replace('GUEST_READ_TIMEOUT_MS=8000','GUEST_READ_TIMEOUT_MS='+shortMs);
  return new Function('fetch','AbortController','setTimeout','clearTimeout',segment+'; return guestRead;')(
    fetcher,AbortController,setTimeout,clearTimeout
  ) as (path:string,signal?:AbortSignal)=>Promise<any>;
}

test('Guest GET returns authorization catalog immediately without writes or automatic retries',async()=>{
  const {html,script}=await guestScript();
  assert.match(html,/id="guestAccessRetryBtn"/);
  assert.match(html,/id="guestAccessLoadError"/);
  assert.match(html,/role="alert"/);
  assert.match(html,/全選目前篩選的真正會員（不含訪客）/);
  assert.match(script,/guestAccessRetryBtn'\)\.addEventListener\('click'/);
  assert.doesNotMatch(script,/setInterval\([^)]*loadGuestAccess/);
  let calls=0;
  const read=guestReader(script,async(path,options)=>{
    calls++;
    assert.equal(path,'/api/admin/app-access/guest');
    assert.equal(options.method,'GET');
    assert.equal(options.cache,'no-store');
    assert.ok(options.signal instanceof AbortSignal);
    return {ok:true,status:200,json:async()=>({principal:'guest',apps:[],countedAsMember:false})};
  });
  const data=await read('/api/admin/app-access/guest');
  assert.equal(data.principal,'guest');
  assert.equal(calls,1);
});

test('Hanging guest GET aborts after 8-second production threshold; error offers manual retry only',async()=>{
  const {script}=await guestScript();
  let calls=0;
  const read=guestReader(script,async(_,options)=>{
    calls++;
    return new Promise((_,reject)=>{
      options.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});
    });
  },25); // Clock is shortened ONLY in the test; production remains 8000ms.
  await assert.rejects(read('/api/admin/app-access/guest'),/讀取超過 8 秒，請按「重新讀取」/);
  assert.equal(calls,1,'Never retry without a new explicit click');
});

test('Server-side unauthorized status is surfaced instead of infinite loading',async()=>{
  const {script}=await guestScript();
  const read=guestReader(script,async()=>({
    ok:false,status:403,json:async()=>({error:'只有 Starry ID 超級管理員可以設定 App 權限'})
  }));
  await assert.rejects(read('/api/admin/app-access/guest'),/只有 Starry ID 超級管理員/);
});

test('Malformed guest API JSON yields bounded and actionable failure',async()=>{
  const {script}=await guestScript();
  const read=guestReader(script,async()=>({
    ok:true,status:200,json:async()=>{throw Error('bad json');}
  }));
  await assert.rejects(read('/api/admin/app-access/guest'),/資料異常/);
});

test('No request-time guest schema creation or silent retries are present in the manager',()=>{
  const guest=readFileSync(new URL('../worker/starryGuestAppAccess.ts',import.meta.url),'utf8');
  const begin=guest.indexOf('export async function handleGuestAppPolicyAdmin');
  assert.ok(begin>=0);
  const handler=guest.slice(begin);
  assert.doesNotMatch(handler,/ensureGuestPolicySchema|CREATE TABLE|db\.batch\(/);
  assert.match(handler,/catalog\(db,env\)/);
});
