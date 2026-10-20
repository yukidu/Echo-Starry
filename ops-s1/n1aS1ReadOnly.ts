/** N1A-S1: offline fixture-only GET endpoint; NEVER mount on production Worker. */
import { buildN1aMockDashboard } from './n1aS1Console.ts';
import type { MockPositiveCheck } from './n1aS1Console.ts';
import type { Observation } from './healthModel.ts';
import type { SyntheticInput } from './syntheticEvents.ts';
import { createMockSnapshotReader } from './syntheticEvents.ts';

export type FakeAdmin = { subject:string;centralSuperAdmin:boolean;starryIdCheckedInFixture:boolean;expiresAt:number };
export type MockConsoleDependencies = {
 now():number;
 checkFakeAdmin(request:Request):Promise<FakeAdmin|null>;
 readFakeCloud():Promise<readonly Observation[]>;
 readFakeEvents():Promise<readonly SyntheticInput[]>;
 /** Legacy injected fixture. Explicitly ignored: no trusted proof source is wired. */
 readFakePositiveChecks?():Promise<readonly MockPositiveCheck[]>;
 // Inject limiter in tests; no shared global network state or KV writes.
 mayRead(subject:string,now:number):boolean;
};
function respond(body:object,status=200):Response {
 return new Response(JSON.stringify(body),{status,headers:{
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer',
 }});
}
export function createN1aOfflineReadOnlyHandler(deps:MockConsoleDependencies) {
 const cloud=createMockSnapshotReader(deps.readFakeCloud);
 const events=createMockSnapshotReader(deps.readFakeEvents);
 return async (request:Request):Promise<Response>=>{
  const url=new URL(request.url);
  if(url.pathname!=='/admin/ops/n1a-s1-offline')return respond({error:'not_found'},404);
  if(request.method!=='GET')return respond({error:'read_only'},405);
  let actor:FakeAdmin|null=null;
  try{actor=await deps.checkFakeAdmin(request);}catch{actor=null;}
  const now=deps.now();
  // Always check identity first, even if metrics are cached; a revoked admin cannot reuse a snapshot.
  if(!actor?.subject||!actor.centralSuperAdmin||!actor.starryIdCheckedInFixture||
     !Number.isFinite(actor.expiresAt)||actor.expiresAt<=now)return respond({error:'access_denied'},403);
  if(!deps.mayRead(actor.subject,now))return respond({error:'refresh_too_frequent'},429);
  // No trusted approval adapter: never fetch/cache a caller's positive security claims.
  const [cloudResult,eventResult]=await Promise.allSettled([cloud(now),events(now)]);
  const payload=buildN1aMockDashboard(
   cloudResult.status==='fulfilled'?cloudResult.value:[],
   eventResult.status==='fulfilled'?eventResult.value:[],
   now,
   [],
   {
    cloudSourceAvailable:cloudResult.status==='fulfilled',
    eventSourceAvailable:eventResult.status==='fulfilled',
    positiveSourceAvailable:true, // empty positives: allow isolated warning/fault, never green
   },
  );
  return respond(payload);
 };
}
