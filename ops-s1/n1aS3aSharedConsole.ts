/**
 * AI6 N1A-S3A offline integration. One shared AI2 verifier, actual invocation.
 * Never import this into a production router. No real Starry ID, Cloudflare,
 * persistent ledger, remote witness, Provider, restore or paid operation.
 */
import { evaluateS3aFakeEnvelope, N1A_S3A_PRODUCTION_GATE } from '../security-contract-v1/s3aEnvelope.ts';
import type { S3aEnvelope, S3aExpected, S3aFakeReaders, S3aPhase, S3aDecision } from '../security-contract-v1/s3aEnvelope.ts';
import { buildN1aMockDashboard } from './n1aS1Console.ts';
import type { N1aMockDashboard, DomainCard } from './n1aS1Console.ts';
import type { Observation } from './healthModel.ts';
import type { SyntheticInput } from './syntheticEvents.ts';
import { createMockSnapshotReader } from './syntheticEvents.ts';
import type { FakeAdmin } from './n1aS1ReadOnly.ts';

export type S3aFakeProofInput = Readonly<{
 envelope:S3aEnvelope;
 expected:S3aExpected;
 readers:S3aFakeReaders;
 phase:S3aPhase;
}>;
export type S3aProofSummary = Readonly<{
 state:'unknown'|'fake_consistent'|'fake_denied';
 label:string;
 reasonCode:string;
 phase:S3aPhase|'unknown';
 locked:true;
 realAuthority:false;
 productionAuthorized:false;
}>;
export type S3aConsoleOutput = N1aMockDashboard & Readonly<{
 sharedVerifierInvoked:true;
 proof:S3aProofSummary;
}>;

const DENIAL_REASONS:readonly string[]=[
 'WRONG_FAKE_SCHEMA','ACTION_SCOPE_MISMATCH','UNKNOWN_PHASE',
 'ACTION_PHASE_MISMATCH','RESOURCE_SCOPE_MISMATCH','APPROVAL_GRANT_REQUIRED',
 'INVALID_VERSION','KNOWN_CHECKPOINT_AHEAD','PROOF_EXPIRED_OR_FUTURE',
 'FAKE_ATTESTATION_MISSING','FAKE_ATTESTATION_NOT_IN_REGISTRY',
 'STARRY_ID_MEMBER_UNAVAILABLE','MEMBERSHIP_REVISION_MISMATCH',
 'CENTRAL_ADMIN_REQUIRED','WITNESS_UNKNOWN','WITNESS_INVALID_VERSION',
 'INDEPENDENT_WITNESS_CONFLICT','RESOURCE_NOT_CURRENTLY_ENTITLED',
 'INVALID_CURRENT_RESOURCE','RESOURCE_SOURCE_OR_PERMISSION_CHANGED',
 'AUTHORITY_UNREACHABLE'
];
const VALID_PHASES:readonly string[]=['T0','T1','T2','SEND','before_commit'];
function unknownCard(card:DomainCard, code:string):DomainCard {
 // An already confirmed in-domain fault remains red. Other status cannot be
 // promoted by a client-supplied proof or by the fake verifier's success.
 if(card.status==='fault'||card.status==='warning')return {
   ...card,locked:true,productionAuthorized:false
  }; // Preserve independently established fake incidents; only downgrade green.
 return {...card,status:'unknown',evidence:'missing',reasonCode:code,
   conflict:card.conflict||card.status!=='unknown',locked:true,productionAuthorized:false};
}
function outcome(decision:S3aDecision|null):S3aProofSummary {
 if(!decision||decision.productionAuthorized!==false||
    decision.irreversibleActionsAllowed!==false||decision.providerCalls!==0||
    decision.restoreWrites!==0||!VALID_PHASES.includes(decision.phase))return {
    state:'unknown',label:'假安全證明無法核實，維持鎖定',
    reasonCode:'S3A_PROOF_UNKNOWN',phase:'unknown',locked:true,realAuthority:false,productionAuthorized:false
  };
 if(decision.reason==='FAKE_EVIDENCE_CONSISTENT'&&decision.simulatedAllowed===true)return{
    state:'fake_consistent',label:'AI2 假資料核對一致；非真實授權',
    reasonCode:'FAKE_EVIDENCE_CONSISTENT_NOT_LIVE',phase:decision.phase,
    locked:true,realAuthority:false,productionAuthorized:false
  };
 if(decision.simulatedAllowed===false&&DENIAL_REASONS.includes(decision.reason))return{
    state:'fake_denied',label:'AI2 假資料安全檢查未通過，維持鎖定',
    reasonCode:decision.reason,phase:decision.phase,
    locked:true,realAuthority:false,productionAuthorized:false
  };
 return{
    state:'unknown',label:'假安全證明結果未知，維持鎖定',
    reasonCode:'S3A_PROOF_UNKNOWN',phase:'unknown',
    locked:true,realAuthority:false,productionAuthorized:false
  };
}

/**
 * Actual same-process call to the AI2 evaluator, then feed its returned
 * decision to the reviewed AI6 four-domain UI model. No caller-supplied
 * simulatedAllowed/status can substitute for this evaluator invocation.
 */
export async function evaluateS3aForMockConsole(
 platform:readonly Observation[],incidents:readonly SyntheticInput[],
 input:S3aFakeProofInput|null,nowMs:number,
 sourceState:{cloudAvailable?:boolean;incidentsAvailable?:boolean}={},
):Promise<S3aConsoleOutput> {
 let decision:S3aDecision|null=null;
 if(input){
  try{
   decision=await evaluateS3aFakeEnvelope(
    input.envelope,input.expected,input.readers,input.phase,nowMs
   );
  }catch{decision=null;}
 }
 const base=buildN1aMockDashboard(platform,incidents,nowMs,[],{
   cloudSourceAvailable:sourceState.cloudAvailable!==false,
   eventSourceAvailable:sourceState.incidentsAvailable!==false,
   // No positive check is supplied. This preserves independently observed
   // AI3 Hold/App/backup warnings while never creating a "normal" card.
   positiveSourceAvailable:true,
 });
 const proof=outcome(decision);
 const domains={
  app_security:unknownCard(base.domains.app_security,proof.reasonCode),
  ai_billing:base.domains.ai_billing, // AI3 hold/known failure is independent.
  backup_restore:unknownCard(base.domains.backup_restore,'S3A_WITNESS_NOT_LIVE'),
 };
 const result:S3aConsoleOutput={
  ...base,domains,proof,sharedVerifierInvoked:true,
  anyConfirmedFault:base.cloud.overall==='fault'||
    domains.app_security.status==='fault'||domains.ai_billing.status==='fault'||
    domains.backup_restore.status==='fault',
  anyUnknown:base.cloud.partialUnknown||
    domains.app_security.status==='unknown'||domains.ai_billing.status==='unknown'||
    domains.backup_restore.status==='unknown',
  actionsAllowed:false,retriesAllowed:false,
  newAiSpendingAllowed:false,restoreAllowed:false,productionAuthorized:false,
 };
 // Compile-time and runtime reminder: real gate is permanently false.
 if(N1A_S3A_PRODUCTION_GATE!==false)throw Error('offline gate changed');
 return result;
}
export type S3aOfflineDependencies=Readonly<{
 now():number;
 checkFakeAdmin(request:Request):Promise<FakeAdmin|null>;
 readFakeCloud():Promise<readonly Observation[]>;
 readFakeIncidents():Promise<readonly SyntheticInput[]>;
 /** Fake test fixture factory; nothing supplied by URL/body/frontend. */
 readFakeProof():Promise<S3aFakeProofInput|null>;
 mayRead(subject:string,now:number):boolean;
}>;
function json(body:object,status=200):Response{
 return new Response(JSON.stringify(body),{status,headers:{
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'
 }});
}
/**
 * Self-contained offline GET adapter, not attached to a real Worker.
 * Rechecks fake admin before any reader. Shared proof is evaluated freshly
 * on every allowed request; only non-sensitive platform/event fixtures may
 * coalesce in the same isolate.
 */
export function createS3aOfflineAdminHandler(deps:S3aOfflineDependencies){
 const cloud=createMockSnapshotReader(deps.readFakeCloud);
 const incidents=createMockSnapshotReader(deps.readFakeIncidents);
 return async(request:Request):Promise<Response>=>{
  const url=new URL(request.url);
  if(url.pathname!=='/admin/ops/n1a-s3a-offline')return json({error:'not_found'},404);
  if(request.method!=='GET')return json({error:'read_only'},405);
  let member:FakeAdmin|null=null;
  try{member=await deps.checkFakeAdmin(request);}catch{member=null;}
  const now=deps.now();
  if(!member?.subject||member.centralSuperAdmin!==true||
     member.starryIdCheckedInFixture!==true||
     !Number.isFinite(member.expiresAt)||member.expiresAt<=now)
   return json({error:'access_denied'},403);
  if(!deps.mayRead(member.subject,now))return json({error:'refresh_too_frequent'},429);
  // No trust in any request query/header/body as the result of AI2 verification.
  const [proofResult,cloudResult,incidentsResult]=await Promise.allSettled([
   deps.readFakeProof(),cloud(now),incidents(now)
  ]);
  const view=await evaluateS3aForMockConsole(
   cloudResult.status==='fulfilled'?cloudResult.value:[],
   incidentsResult.status==='fulfilled'?incidentsResult.value:[],
   proofResult.status==='fulfilled'?proofResult.value:null,now,
   {cloudAvailable:cloudResult.status==='fulfilled',
    incidentsAvailable:incidentsResult.status==='fulfilled'},
  );
  return json(view);
 };
}
