import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {guardEchoAppAccess} from '../worker/echoAppAccessGuard';

const read=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const main=read('worker/starryMainInlineLoginRouter.ts');
const auth=read('worker/authRouter.ts');

function fakeEnv(access: any,opts:{local?:boolean,mapping?:boolean}={}) {
  let localQueries=0,centralQueries=0;
  const appDB={
    prepare(sql:string){
      localQueries++;
      if(!sql.includes('auth_sessions')) throw new Error('unexpected Echo SQL');
      return {bind(){return {first:async()=>opts.local===false?null:{userId:'echo-user-1',expiresAt:253402300799999}};}};
    }
  };
  const centralDB={
    batch:async()=>[],
    prepare(sql:string){
      centralQueries++;
      return {bind(){return {first:async()=>{
        if(sql.includes('legacy_links'))return opts.mapping===false?null:{userId:'central-user-1'};
        if(sql.includes('FROM users u'))return {...access,status:access.status||'active',createdAt:access.createdAt??Date.parse('2026-01-01T00:00:00Z')};
        return null;
      }}}};
    }
  };
  return {env:{DB:appDB,STARRY_ID_DB:centralDB} as any,calls:()=>({localQueries,centralQueries})};
}
const TOKEN='A'.repeat(43);
function req(path:string,token=TOKEN,method='GET'){
  return new Request('https://echo.starry.phd'+path,{method,headers:token?{'Authorization':'Bearer '+token}:{}});
}

test('Visitors and anonymous audio never trigger unnecessary central permission queries',async()=>{
  const db=fakeEnv({decision:'deny'});
  assert.equal(await guardEchoAppAccess(req('/', ''),db.env),null);
  assert.equal(await guardEchoAppAccess(req('/api/tracks',TOKEN),db.env),null);
  assert.equal(await guardEchoAppAccess(req('/api/r2/file/song.mp3',TOKEN),db.env),null);
  assert.equal(await guardEchoAppAccess(req('/api/auth/logout',TOKEN,'POST'),db.env),null);
  assert.deepEqual(db.calls(),{localQueries:0,centralQueries:0});
});

test('Explicitly denied Echo member cannot reach root or private API',async()=>{
  const db=fakeEnv({decision:'deny',membershipStatus:'active'});
  const root=await guardEchoAppAccess(req('/'),db.env);
  assert.equal(root?.status,403);
  assert.match(await root!.text(),/您沒有使用權限/);
  const api=await guardEchoAppAccess(req('/api/users/profile'),db.env);
  assert.equal(api?.status,403);
  assert.equal((await api!.json() as any).code,'APP_ACCESS_DENIED');
});

test('Grandfathered active member continues to use Echo; newly registered member needs grant',async()=>{
  const old=fakeEnv({decision:null,createdAt:Date.parse('2026-01-01T00:00:00Z'),membershipStatus:'active'});
  assert.equal(await guardEchoAppAccess(req('/api/users/profile'),old.env),null);
  const recent=fakeEnv({decision:null,createdAt:Date.parse('2026-10-18T17:00:00Z'),membershipStatus:null});
  const denied=await guardEchoAppAccess(req('/api/users/profile'),recent.env);
  assert.equal(denied?.status,403);
  const permitted=fakeEnv({decision:'allow',createdAt:Date.parse('2026-10-18T17:00:00Z')});
  assert.equal(await guardEchoAppAccess(req('/api/users/profile'),permitted.env),null);
});

test('Unknown local session is handled downstream; missing central identity asks for re-login',async()=>{
  const missingLocal=fakeEnv({decision:'deny'},{local:false});
  assert.equal(await guardEchoAppAccess(req('/api/users/profile'),missingLocal.env),null);
  const missingCentral=fakeEnv({decision:'allow'},{mapping:false});
  const response=await guardEchoAppAccess(req('/api/users/profile'),missingCentral.env);
  assert.equal(response?.status,401);
  assert.match(await response!.text(),/請重新登入 Starry ID/);
});

test('All member entrypoints are guarded upstream; Google login honors central policy',()=>{
  assert.match(main,/await guardEchoAppAccess\(request,env\)/);
  assert.ok(main.indexOf('await guardEchoAppAccess(request,env)') < main.indexOf("isTranscriptV281Path(url.pathname)"));
  assert.match(auth,/const access = await checkStarryAppAccess\(\(env as any\)\.STARRY_ID_DB,centralId,'echostars'\)/);
  assert.match(auth,/if \(!access.allowed\) throw new EchoAppAccessDeniedError\(\)/);
  assert.match(auth,/denied \? 403/);
  assert.match(auth,/central_id_unavailable/);
});
