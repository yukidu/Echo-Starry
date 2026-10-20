/**
 * AI5 N1A-S3A: isolated, fake-only glue.
 * Shared #475 proof is a RESOURCE evidence prerequisite, not an F22 private
 * statistics permission. The common schema lacks statistics.private.read.
 * No Worker, D1, Starry ID, billing or external witness adapter is implemented.
 */
import type {DatabaseSync} from 'node:sqlite';
import {
  evaluateS3aFakeEnvelope,N1A_S3A_PRODUCTION_GATE,
  type S3aEnvelope,type S3aExpected,type S3aFakeReaders,type S3aDecision,
} from '../security-contract-v1/s3aEnvelope.ts';
import {
  FakePrivateStatsWitness, fakeStats, reserveFakeBatch,
  reserveFakeAcrossIsolatedDatabases,
  TEST_ONLY,productionAuthorized,F22_N1A_S1_GATE_ENABLED,
  type Period,type FakeEnvelope,type ReserveDecision,
} from '../f22-n1a-s1/offlineModel.ts';

export const S3A_AI5_PRIVATE_STATS_PRODUCTION_GATE=false as const;
export const MOCK_STATS_RESOURCE_ID='f22-private-statistics-fake' as const;
export type FakeReport=ReturnType<typeof fakeStats>;
export type FakeReadOutcome=Readonly<{
 simulatedAllowed:boolean; productionAuthorized:false;report:FakeReport|null;
 reason:string;checkedPhases:readonly string[];
 costEstimatedTwd:null;spendHeldTwd:null;costSettledActualTwd:null;
 d1RowsRead:null;d1RowsWritten:null;
}>;
const output=(reason:string,checkedPhases:string[],report:FakeReport|null=null):FakeReadOutcome=>({
 simulatedAllowed:reason==='FAKE_STATS_ONLY_CONSISTENT'&&report!==null,
 productionAuthorized:false, report,reason,checkedPhases,
 costEstimatedTwd:null,spendHeldTwd:null,costSettledActualTwd:null,
 d1RowsRead:null,d1RowsWritten:null,
});
export type FakeS3aStatisticsRead=Readonly<{
 db:DatabaseSync;witness:FakePrivateStatsWitness;admin:string;
 envelope:S3aEnvelope;expected:S3aExpected;readers:S3aFakeReaders;
 period:Period;asOfMs:number;track:string|null;
 /**
  * Fake-only test callback. Used to simulate revocation/rollback AFTER the
  * SQL read, BEFORE shared SEND and our second witness check.
  */
 betweenReadAndSend?:()=>void|Promise<void>;
}>;
/** Independently require CURRENT fake super-admin at EVERY shared proof re-read.
 * S3a verifier alone does not require this role for searchEvidence.
 */
function privateReaders(readers:S3aFakeReaders):S3aFakeReaders{
 return {
  ...readers,
  readMembership:async (subject,app)=>{
   const current=await readers.readMembership(subject,app);
   return current?.centralSuperAdmin===true?current:null;
  },
 };
}
/** Actual same-process import/use of #475 evaluateS3aFakeEnvelope + #471 fakeStats.
 * Not a real authorization path, never expose to Workers or production.
 * We reject mismatched action/resource rather than making a new shared action.
 */
export async function readSyntheticPrivateStatsWithS3a(
 args:FakeS3aStatisticsRead
):Promise<FakeReadOutcome>{
 const phases:string[]=[];
 if(!TEST_ONLY||productionAuthorized||F22_N1A_S1_GATE_ENABLED||
    N1A_S3A_PRODUCTION_GATE||S3A_AI5_PRIVATE_STATS_PRODUCTION_GATE)
  return output('PRODUCTION_GATE_MUST_STAY_OFF',phases);
 // Existing action means content evidence only, NEVER real F22 authorization.
 if(args.expected.action!=='transcript.searchEvidence'||
    args.envelope.action!=='transcript.searchEvidence'||
    args.expected.resourceIds.length!==1||
    args.expected.resourceIds[0]!==MOCK_STATS_RESOURCE_ID||
    args.envelope.resources.length!==1||
    args.envelope.resources[0]?.resourceId!==MOCK_STATS_RESOURCE_ID||
    args.expected.subjectId!==args.admin)
  return output('STATS_SHARED_ACTION_NOT_FORMALLY_AUTHORIZED',phases);
 const readers=privateReaders(args.readers);
 const check=async(phase:'T0'|'T1'|'T2'|'SEND'):Promise<S3aDecision>=>{
  phases.push(phase);
  return evaluateS3aFakeEnvelope(args.envelope,args.expected,readers,phase,args.asOfMs);
 };
 try{
  for(const phase of ['T0','T1','T2'] as const){
   const checked=await check(phase);
   if(!checked.simulatedAllowed||checked.productionAuthorized!==false)
    return output('FAKE_SHARED_'+phase+'_'+checked.reason,phases);
  }
  // Private witness enforces a sealed snapshot plus independently held
  // member tombstones. No actual signed external authority exists.
  const first=fakeStats(args.db,args.period,args.asOfMs,args.track,
   {witness:args.witness,admin:args.admin});
  await args.betweenReadAndSend?.();
  const send=await check('SEND');
  if(!send.simulatedAllowed||send.productionAuthorized!==false)
   return output('FAKE_SHARED_SEND_'+send.reason,phases);
  // A new private check at the simulated output boundary; invalidated
  // snapshot, removed admin or deleted member never gets the old result.
  const current=fakeStats(args.db,args.period,args.asOfMs,args.track,
   {witness:args.witness,admin:args.admin});
  if(JSON.stringify(first)!==JSON.stringify(current))
   return output('FAKE_STATS_CHANGED_BETWEEN_READ_AND_SEND',phases);
  return output('FAKE_STATS_ONLY_CONSISTENT',phases,current);
 }catch{
  return output('FAKE_STATS_WITNESS_OR_READER_UNAVAILABLE',phases);
 }
}
/** Version namespaces stay separate. An event counter is not an ETag. */
export function inspectSyntheticVersionBoundary(event:FakeEnvelope,envelope:S3aEnvelope){
 if(!Number.isSafeInteger(event.sourceRevision)||event.sourceRevision<1||
    !envelope.resources.some(x=>x.resourceId===MOCK_STATS_RESOURCE_ID))
  throw Error('FAKE_VERSION_BOUNDARY_INVALID');
 return {eventRevision:event.sourceRevision,
   resourceSourceRevision:envelope.resources[0]!.sourceRevision,
   distinctNamespaces:typeof event.sourceRevision==='number'&&
      typeof envelope.resources[0]!.sourceRevision==='string'} as const;
}
/** Single same DB handle: conservative fake transaction. Any independent DB:
 * UNSUPPORTED, with zero writes. Never confuse D1 quota with an AI cost hold.
 */
export function reserveSyntheticStatsBudget(
 primary:DatabaseSync,authority:DatabaseSync,
 request:{accountId:string;batchId:string;periodKey:string;now:number;reads:number;writes:number}
):ReserveDecision{
 if(primary!==authority)
  return reserveFakeAcrossIsolatedDatabases(primary,authority);
 return reserveFakeBatch(primary,request);
}
