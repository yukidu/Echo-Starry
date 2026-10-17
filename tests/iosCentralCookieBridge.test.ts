import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { successPage } from '../worker/iosGoogleRedirectRouter';

async function simulate(centralOk: boolean, echoOk = true) {
  const html = await successPage({
    id: 'echo-b', email: 'b@example.com', _authToken: 'b'.repeat(43), _sessionExpiresAt: 12345
  }, 'one-time-handoff-code').text();
  const script = html.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
  assert.ok(script);
  const storage = (initial: Record<string,string> = {}) => {
    const map = new Map(Object.entries(initial));
    return { getItem: (key: string) => map.get(key) || null,
      setItem: (key: string, value: string) => {map.set(key, value);},
      removeItem: (key: string) => {map.delete(key);} };
  };
  const local = storage({ sq_current_user_v1: JSON.stringify({id:'echo-a',email:'a@example.com'}) });
  const session = storage({ echostars_auth_return_v1: JSON.stringify({url:'/track/2',scrollY:15}) });
  const redirects: string[] = [];
  const requests: string[] = [];
  const errorEl={textContent:''}; const progressEl={textContent:''}; const retryEl={style:{display:'none'}};
  const fetcher = async (input: string, options: any) => {
    requests.push(String(input));
    if (String(input).includes('id.starry.phd')) {
      assert.equal(options.credentials, 'include');
      return Response.json(centralOk
        ? {success:true,user:{id:'central-b',email:'b@example.com'}}
        : {error:'temp'},{status:centralOk?200:503});
    }
    assert.equal(String(input), '/api/auth/session');
    assert.equal(options.headers.Authorization,'Bearer '+'b'.repeat(43));
    return Response.json(echoOk?{authenticated:true,user:{id:'echo-b'}}:{authenticated:false},{status:echoOk?200:503});
  };
  runInNewContext(script, {
    localStorage:local, sessionStorage:session, fetch:fetcher,
    window:{location:{replace:(url:string)=>redirects.push(url)}},
    document:{getElementById:(id:string)=>id==='login-error'?errorEl:id==='login-progress'?progressEl:retryEl},
    Date, JSON, String
  });
  await new Promise(resolve=>setImmediate(resolve));
  await new Promise(resolve=>setImmediate(resolve));
  return { local, session, redirects, requests, errorEl, retryEl, html };
}

test('iOS redirect completes central and Echo sessions before publishing identity', async () => {
  const result=await simulate(true);
  assert.deepEqual(result.requests,['https://id.starry.phd/api/mobile-login/complete','/api/auth/session']);
  assert.deepEqual(result.redirects,['/track/2']);
  const user=JSON.parse(result.local.getItem('sq_current_user_v1')||'{}');
  assert.equal(user.id,'echo-b');
  assert.equal(user._starryUserId,'central-b');
  assert.ok(result.session.getItem('echostars_auth_restore_v1'));
  assert.equal(result.session.getItem('echostars_auth_return_v1'),null);
  assert.doesNotMatch(result.html,/\/auth\/callback\?code=/);
  assert.doesNotMatch(result.html,/google\.credential\.signed/);
  assert.match(result.html,/one-time-handoff-code/);
});

test('iOS central error keeps the previous identity and offers safe recovery', async () => {
  const result=await simulate(false);
  assert.deepEqual(result.requests,['https://id.starry.phd/api/mobile-login/complete']);
  assert.deepEqual(result.redirects,[]);
  assert.equal(JSON.parse(result.local.getItem('sq_current_user_v1')||'{}').id,'echo-a');
  assert.equal(result.retryEl.style.display,'inline-block');
  assert.match(result.errorEl.textContent,/中央會員/);
});

test('iOS Echo cookie refresh failure does not publish a partly completed identity',async()=>{
  const result=await simulate(true,false);
  assert.deepEqual(result.redirects,[]);
  assert.equal(JSON.parse(result.local.getItem('sq_current_user_v1')||'{}').id,'echo-a');
  assert.equal(result.retryEl.style.display,'inline-block');
});

test('iOS central handoff is short-lived, consumed once and bound to Echo origin',()=>{
  const central=readFileSync(new URL('../worker/starryIdCentralRouter.ts',import.meta.url),'utf8');
  const redirect=readFileSync(new URL('../worker/iosGoogleRedirectRouter.ts',import.meta.url),'utf8');
  assert.match(central,/IOS_HANDOFF_TTL_MS = 90 \* 1000/);
  assert.match(central,/issueEchoIosLoginHandoff/);
  assert.match(central,/verifyGoogleCredential\(env, credential\)/);
  assert.match(central,/syncVerifiedIdentity\(env, identity, 'echostars'\)/);
  assert.match(central,/DELETE FROM ios_login_handoffs[\s\S]*?RETURNING userId/);
  assert.match(central,/request\.headers\.get\('Origin'\) !== IOS_HANDOFF_ORIGIN/);
  assert.match(central,/Set-Cookie': sessionCookie\(session\.token, session\.expiresAt\)/);
  assert.match(redirect,/issueEchoIosLoginHandoff\(env, credential\)/);
  assert.doesNotMatch(redirect,/serializedCredential/);
});
