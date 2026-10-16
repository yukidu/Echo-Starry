import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import worker from '../worker/privacyCrawlerRouter';
import stickerWorker from '../worker/stickerRouter';
import { testDatabase } from './helpers/database';
import { shouldDiscardSession, mergeMemberSession } from '../src/authSessionPolicy';
import { exchangeGoogleCredential } from '../src/googleCredentialExchange';
const audience = '400699489182-lb412nhvj4s6pu7v5gkg40hc646dq79.apps.googleusercontent.com';
let privateKey: CryptoKey;
const originalFetch = globalThis.fetch;
before(async () => {
  const pair = await generateKeyPair('RS256'); privateKey = pair.privateKey;
  const jwk = { ...await exportJWK(pair.publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' };
  globalThis.fetch = (async input => {
    assert.equal(String(input), 'https://www.googleapis.com/oauth2/v3/certs');
    return Response.json({ keys: [jwk] });
  }) as typeof fetch;
});
after(() => { globalThis.fetch = originalFetch; });
async function credential(email = 'member@example.com', subject = email, overrides: any = {}) {
  return new SignJWT({ email, email_verified: true, name: '測試會員', picture: 'https://example.com/avatar.png', ...overrides })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).setSubject(subject)
    .setIssuer('https://accounts.google.com').setAudience(audience).setIssuedAt().setExpirationTime('5m').sign(privateKey);
}
async function login(db: ReturnType<typeof testDatabase>, token: string) {
  return worker.fetch(new Request('https://test.example/api/users/google-sync', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential: token })
  }), { DB: db });
}
test('full Worker login verifies signed credential without touching tracks, stickers, comments or playback', async () => {
  const db = testDatabase(); db.forbidCatalog = true;
  const response = await login(db, await credential());
  assert.equal(response.status, 200);
  const data: any = await response.json();
  assert.equal(data.user.email, 'member@example.com');
  assert.ok(data.authToken);
  assert.equal(data.user.googleSubject, undefined);
  assert.match(response.headers.get('Set-Cookie') || '', /HttpOnly.*Secure.*SameSite=Lax/);
  assert.ok(db.queries.length < 35, `login ran ${db.queries.length} queries`);
  const session = await worker.fetch(new Request('https://test.example/api/auth/session', {
    headers: { Cookie: response.headers.get('Set-Cookie')!.split(';')[0] }
  }), { DB: db });
  assert.equal(session.status, 200);
  assert.equal((await session.json() as any).user.id, data.user.id);
});
test('cold login work does not grow with member count and retains existing profile and custom avatar', async () => {
  const first = testDatabase();
  const result: any = await (await login(first, await credential())).json();
  first.sqlite.prepare("UPDATE users SET name='原姓名',phone='123',avatar='custom',avatarUploadCount=1 WHERE id=?").run(result.user.id);
  for (let i = 0; i < 1000; i++) first.sqlite.prepare('INSERT INTO users(id,name,email) VALUES(?,?,?)').run('u'+i,'n','u'+i+'@example.com');
  const cold = testDatabase(first.sqlite, false); cold.forbidCatalog = true;
  const response: any = await (await login(cold, await credential())).json();
  assert.equal(response.user.id, result.user.id); assert.equal(response.user.name, '原姓名');
  assert.equal(response.user.phone, '123'); assert.equal(response.user.avatar, 'custom');
  assert.ok(cold.queries.length < 30, `cold login ran ${cold.queries.length} queries`);
});
test('invalid Google credentials are rejected without database work', async () => {
  const db = testDatabase();
  assert.equal((await login(db, 'forged.token.signature')).status, 401);
  assert.equal(db.queries.length, 0);
  assert.equal((await login(db, await credential('x@example.com', 'x', { email_verified: false }))).status, 401);
});
test('blocked member cannot create a new session and subject conflicts are rejected', async () => {
  const db = testDatabase(); const token = await credential();
  await login(db, token);
  db.sqlite.exec('UPDATE users SET isBlocked=1');
  const beforeCount = db.sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get()!.n;
  assert.equal((await login(db, token)).status, 403);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get()!.n, beforeCount);
  db.sqlite.exec('UPDATE users SET isBlocked=0');
  assert.equal((await login(db, await credential('member@example.com','different-subject'))).status, 409);
  assert.equal((await login(db, await credential('changed@example.com','member@example.com'))).status, 409);
});
test('database outages return a retryable service error, not a false credential rejection', async () => {
  const db = testDatabase(); db.fail = true;
  const response = await login(db, await credential());
  assert.equal(response.status, 503); assert.equal((await response.json() as any).code, 'LOGIN_SERVICE_UNAVAILABLE');
});
test('anonymous or expired session response cannot clear a concurrent new login cookie', async () => {
  const db = testDatabase();
  for (const headers of [{}, { Cookie: 'echostars_session='+'x'.repeat(40) }] as Record<string, string>[]) {
    const response = await worker.fetch(new Request('https://test.example/api/auth/session', { headers }), { DB: db });
    assert.equal(response.status, 401); assert.equal(response.headers.has('Set-Cookie'), false);
  }
});
test('iOS verified redirect propagates first-party cookie and rejects CSRF mismatch', async () => {
  const db = testDatabase(); const body = new URLSearchParams({ g_csrf_token:'csrf',credential:await credential() });
  const make = (cookie: string) => new Request('https://test.example/', { method:'POST', headers:{Cookie:cookie},body });
  assert.equal((await worker.fetch(make('g_csrf_token=wrong'),{DB:db})).status,403);
  const response = await worker.fetch(make('g_csrf_token=csrf'),{DB:db});
  assert.equal(response.status,200); assert.match(response.headers.get('Set-Cookie') || '', /echostars_session=/);
  assert.match(await response.text(),/登入完成/);
});
test('member directory and profiles protect contact fields and Google subject', async () => {
  const db = testDatabase(); const data:any=await (await login(db,await credential())).json();
  db.sqlite.exec("INSERT INTO users(id,name,email,phone) VALUES('other','其他','other@example.com','secret')");
  const get = (path:string,token='') => worker.fetch(new Request('https://test.example'+path,{headers:token?{Authorization:'Bearer '+token}:{}}),{DB:db});
  assert.equal((await get('/api/users')).status,401);
  const directory:any=await (await get('/api/users',data.authToken)).json();
  assert.equal(directory.find((u:any)=>u.id==='other').phone,undefined);
  assert.equal(directory.find((u:any)=>u.id==='other').email,undefined);
  assert.equal((await get('/api/users/profile?id=other',data.authToken)).status,403);
  assert.equal((await get('/api/users/profile?id='+data.user.id,data.authToken)).status,200);
});
test('completed sticker migration is reused by a cold database binding and new members still get initial stickers', async () => {
  const db=testDatabase(); const member:any=await (await login(db,await credential())).json();
  const request=(token:string)=>new Request('https://test.example/api/stickers/me',{headers:{Authorization:'Bearer '+token}});
  assert.equal((await stickerWorker.fetch(request(member.authToken),{DB:db})).status,200);
  const cold=testDatabase(db.sqlite,false);
  const newer:any=await (await login(cold,await credential('new@example.com'))).json();
  cold.queries.length=0;
  const data:any=await (await stickerWorker.fetch(request(newer.authToken),{DB:cold})).json();
  assert.equal(data.balance,6);
  assert.equal(cold.queries.some(sql=>sql==='SELECT id FROM users'),false);
  assert.equal(cold.queries.some(sql=>sql.includes('UPDATE sticker_transactions SET trackId')),false);
});
test('session policy keeps transient errors and newer sessions and preserves tokens only for the same member',()=>{
  assert.equal(shouldDiscardSession(503,'old','old'),false);
  assert.equal(shouldDiscardSession(401,'old','new'),false);
  assert.equal(shouldDiscardSession(401,'old','old'),true);
  const old={id:'a',_authToken:'secret',_sessionExpiresAt:123,name:'old'};
  assert.equal((mergeMemberSession(old,{id:'a',name:'new'}) as any)._authToken,'secret');
  assert.equal((mergeMemberSession(old,{id:'b',name:'new'}) as any)._authToken,undefined);
});
test('both browser login entry points share one exchange, reject a second account, and recover after failure',async()=>{
  let finishCentral:(r:Response)=>void=()=>{};
  const calls:string[]=[];
  const fetcher=(async(input: RequestInfo | URL)=>{
    calls.push(String(input));
    if(String(input)==='https://id.starry.phd/api/google-sync') {
      return new Promise<Response>(resolve=>{finishCentral=resolve;});
    }
    return Response.json({user:{id:'one'},authToken:'session'});
  }) as typeof fetch;
  const one=exchangeGoogleCredential('one',fetcher);const same=exchangeGoogleCredential('one',fetcher);
  await assert.rejects(exchangeGoogleCredential('two',fetcher),/上一個帳號/);
  assert.equal(calls.length,1);
  finishCentral(Response.json({success:true,user:{id:'central-one'}}));
  assert.equal((await one).user.id,'one');assert.equal(await one,await same);
  assert.deepEqual(calls,[
    'https://id.starry.phd/api/google-sync',
    '/api/users/google-sync'
  ]);
  await assert.rejects(exchangeGoogleCredential('bad',(async(input: RequestInfo | URL)=>
    String(input)==='https://id.starry.phd/api/google-sync'
      ? Response.json({error:'invalid'},{status:401})
      : Response.json({user:{id:'bad'},authToken:'bad'})
  ) as typeof fetch),/invalid/);
  const freshFetcher=(async(input: RequestInfo | URL)=>
    String(input)==='https://id.starry.phd/api/google-sync'
      ? Response.json({success:true,user:{id:'central-fresh'}})
      : Response.json({user:{id:'fresh'},authToken:'new'})
  ) as typeof fetch;
  assert.equal((await exchangeGoogleCredential('fresh',freshFetcher)).user.id,'fresh');
});

test('valid signatures with wrong audience, issuer or expired time cannot create a member', async () => {
  const db = testDatabase();
  for (const [aud, iss, exp] of [
    ['another-app', 'https://accounts.google.com', '5m'],
    [audience, 'https://attacker.example', '5m'],
    [audience, 'https://accounts.google.com', '-1m']
  ]) {
    const token = await new SignJWT({ email: 'member@example.com', email_verified: true })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).setSubject('member')
      .setIssuer(iss).setAudience(aud).setExpirationTime(exp).sign(privateKey);
    assert.equal((await login(db, token)).status, 401);
  }
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM users').get()!.n, 0);
});
test('parallel first logins create one member and each receives a valid session', async () => {
  const db = testDatabase(); const token = await credential();
  const responses = await Promise.all([login(db, token), login(db, token)]);
  assert.deepEqual(responses.map(r => r.status), [200, 200]);
  const data: any[] = await Promise.all(responses.map(r => r.json()));
  assert.equal(data[0].user.id, data[1].user.id);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM users').get()!.n, 1);
});
test('cross-origin cookie mutation and login are rejected before database access', async () => {
  const db = testDatabase();
  for (const path of ['/api/users/google-sync', '/api/users/member']) {
    const response = await worker.fetch(new Request('https://test.example'+path, {
      method: 'POST', headers: { Origin: 'https://another.example', Cookie: 'echostars_session='+ 'x'.repeat(40) },
      body: '{}'
    }), { DB: db });
    assert.equal(response.status, 403);
  }
  assert.equal(db.queries.length, 0);
});
