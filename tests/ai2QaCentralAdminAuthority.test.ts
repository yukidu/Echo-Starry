import test from 'node:test';
import assert from 'node:assert/strict';
import { actor, isSuper, resolveQaCentralSuperAdmin } from '../worker/aiSpeakerQaRouter';

const echoUser = {
  id: 'echo-test-member', email: 'test-admin@example.test',
  role: '超級管理員', isBlocked: 0, expiresAt: Date.now() + 600_000
};
const allowed = {
  userStatus: 'active', centralEmail: 'test-admin@example.test',
  centralMembershipStatus: 'active', centralRole: 'super-admin',
  echoMembershipStatus: 'active', echoAccessDecision: null
};

function centralDb(row: Record<string, unknown> | null = allowed, userId = 'starry-test-member') {
  const proof: { mode?: string; lookups: string[]; bound: unknown[][] } = { lookups: [], bound: [] };
  const db = {
    withSession(mode: string) {
      proof.mode = mode;
      return {
        prepare(sql: string) {
          proof.lookups.push(sql);
          return {
            bind(...args: unknown[]) {
              proof.bound.push(args);
              return {
                async first() {
                  return sql.includes('FROM legacy_links') ? {userId} : row;
                }
              };
            }
          };
        }
      };
    }
  };
  return { db, proof };
}

test('AI2 security: Echo local role or email alone has no central super-admin authority', async () => {
  assert.equal(isSuper(echoUser), false);
  assert.equal(isSuper({...echoUser,verifiedCentralSuperAdmin:false}), false);
  assert.equal(isSuper(null), false);
  assert.equal(await resolveQaCentralSuperAdmin({} as never, echoUser), false);
  assert.equal(await resolveQaCentralSuperAdmin({STARRY_ID_DB:{prepare(){throw Error('unsupported')}}} as never,echoUser),false);
});

test('AI2 security: verified live central admin requires primary D1 session and both App memberships', async () => {
  const {db,proof} = centralDb();
  const good = await resolveQaCentralSuperAdmin({STARRY_ID_DB:db} as never,echoUser);
  assert.equal(good,true);
  assert.equal(proof.mode,'first-primary');
  assert.deepEqual(proof.bound,[['echo-test-member'],['starry-test-member']]);
  assert.ok(proof.lookups[0].includes('legacy_links'));
  assert.ok(proof.lookups[1].includes("cm.appId='starry-id'"));
  assert.ok(proof.lookups[1].includes("em.appId='echostars'"));
  assert.ok(proof.lookups[1].includes('starry_app_access_decisions'));
});

test('AI2 security: any central revocation, inactive membership or identity mismatch denies admin', async () => {
  const invalid = [
    {userStatus:'blocked'},
    {centralMembershipStatus:'inactive'},
    {centralRole:'member'},
    {echoMembershipStatus:'blocked'},
    {echoAccessDecision:'deny'},
    {centralEmail:'someone-else@example.test'}
  ];
  for (const change of invalid) {
    const {db} = centralDb({...allowed,...change});
    assert.equal(await resolveQaCentralSuperAdmin({STARRY_ID_DB:db} as never,echoUser),false,JSON.stringify(change));
  }
});

test('AI2 security: outage, invalid mapping and missing central membership all deny', async () => {
  const bad = centralDb({...allowed});
  const outage = {withSession(){throw Error('central DB unavailable')}};
  assert.equal(await resolveQaCentralSuperAdmin({STARRY_ID_DB:outage} as never,echoUser),false);
  assert.equal(await resolveQaCentralSuperAdmin({STARRY_ID_DB:centralDb(null).db} as never,echoUser),false);
  assert.equal(await resolveQaCentralSuperAdmin({STARRY_ID_DB:centralDb(allowed,'not valid id').db} as never,echoUser),false);
  assert.ok(bad.db.withSession('first-primary'));
});

test('AI2 security: only a current Echo session linked to active central authority receives verified flag', async () => {
  const {db} = centralDb();
  const env = {
    DB: {
      prepare(sql: string) {
        assert.match(sql,/auth_sessions/);
        return {
          bind(hash: string) {
            assert.match(hash,/^[0-9a-f]{64}$/);
            return { first:async()=>({...echoUser}) };
          }
        };
      }
    },
    STARRY_ID_DB: db
  };
  const token='a'.repeat(48);
  const request=new Request('https://echo.starry.phd/api/qa/status',{headers:{Cookie:'echostars_session='+token}});
  const result=await actor(request,env as never);
  assert.equal(result?.verifiedCentralSuperAdmin,true);
  assert.equal(isSuper(result),true);
  assert.equal(isSuper({...result,verifiedCentralSuperAdmin:false}),false);
});

test('AI2 security: invalid, blocked or expired Echo session cannot gain central authority', async () => {
  const {db,proof}=centralDb();
  const env = {
    DB:{prepare(){return {bind(){return {first:async()=>({...echoUser,isBlocked:1})}}};}},
    STARRY_ID_DB:db
  };
  const req=new Request('https://echo.starry.phd/api/qa/status',{headers:{Cookie:'echostars_session='+'b'.repeat(48)}});
  assert.equal(await actor(req,env as never),null);
  assert.equal(proof.lookups.length,0);
  assert.equal(await actor(new Request('https://echo.starry.phd/api/qa/status'),env as never),null);
  const expired={
    ...env,
    DB:{prepare(){return {bind(){return {first:async()=>({...echoUser,isBlocked:0,expiresAt:Date.now()-5000})}}};}}
  };
  assert.equal(await actor(req,expired as never),null);
});
