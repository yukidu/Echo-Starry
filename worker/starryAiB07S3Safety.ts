/**
 * S3-B07: isolated, internal cost decision port. There is deliberately no
 * AI.run, fetch, public router, Cloudflare binding or provider credential here.
 * A "send ticket" is consumed permanently before provider networking begins.
 * Even an HTTP timeout or Worker crash MUST NOT grant a second ticket.
 */
import {b07Reserve,b07Complete,B07Error,type B07Quote,type B07Env} from './starryAiB07Budget';

type Db={prepare(sql:string):any};
export type S3Plan={segmentCount:number;maxAttemptsPerSegment:number;maxUnitsPerAttempt:number};
export type TrustedFreeMeter={verify:(q:{modelId:string;requiredUnits:number})=>
  Promise<{verified:boolean;accountRemaining:number;validUntil:number;provenance:string}>};
export type TrustedReviewAuthority={verify:(q:{firstReviewer:string;secondReviewer:string;
 evidenceSource:string;evidenceDigest:string;requestId:string})=>Promise<boolean>};
export type S3Env=B07Env&{
  /** Absent in production until a separately reviewed, account-wide meter exists. */
  B07_ACCOUNT_FREE_AUTHORITY?:TrustedFreeMeter;
  /** No customer form or ordinary admin can self-certify two independent reviewers. */
  B07_REVIEW_AUTHORITY?:TrustedReviewAuthority;
};
const hex64=/^[a-f0-9]{64}$/;
const keyId=/^b07-[a-f0-9-]{36}$/;
function check(condition:unknown,code:string,status=409):asserts condition{
  if(!condition)throw new B07Error(code,status);
}
function dbOf(env:S3Env):Db{
  check(env?.STARRY_ID_DB,'b07_central_database_unavailable',503);
  return env.STARRY_ID_DB as Db;
}
function integer(n:unknown,low:number,high:number):n is number{
  return typeof n==='number'&&Number.isSafeInteger(n)&&n>=low&&n<=high;
}
function checkPlan(plan:S3Plan){
  check(plan&&integer(plan.segmentCount,1,10000),'s3_invalid_segment_count');
  check(integer(plan.maxAttemptsPerSegment,1,5),'s3_invalid_attempt_limit');
  check(integer(plan.maxUnitsPerAttempt,1,1_000_000_000),'s3_invalid_units');
  const units=plan.segmentCount*plan.maxAttemptsPerSegment*plan.maxUnitsPerAttempt;
  check(Number.isSafeInteger(units)&&units<=1_000_000_000,'s3_units_overflow');
  return units;
}
function requireRequest(id:string){
  check(typeof id==='string'&&keyId.test(id),'s3_invalid_request_id');
}
type Reserved={requestId:string;state:string;duplicate:boolean;reservedMicroTwd:number;stagingOnly:true};
export async function reserveRunMax(env:S3Env,quote:B07Quote,plan:S3Plan):Promise<Reserved>{
  const db=dbOf(env),maxUnits=checkPlan(plan);
  check(quote?.maxUnits===maxUnits,'s3_plan_not_fully_funded');
  check(typeof quote.fingerprint==='string'&&hex64.test(quote.fingerprint),'s3_fingerprint_invalid');
  // The registry/tariff is checked again by b07Reserve's SQL-triggered hold.
  const tariff=await db.prepare('SELECT billing_class FROM starry_ai_b07_tariffs WHERE model_id=?')
    .bind(quote.modelId).first();
  check(tariff,'s3_tariff_unknown');
  if(tariff.billing_class==='free_verified'){
    const meter=env.B07_ACCOUNT_FREE_AUTHORITY;
    check(meter&&typeof meter.verify==='function','s3_official_free_balance_unknown');
    const evidence=await meter.verify({modelId:quote.modelId,requiredUnits:maxUnits});
    check(evidence?.verified===true&&
      Number.isSafeInteger(evidence.accountRemaining)&&evidence.accountRemaining>=maxUnits&&
      Number.isSafeInteger(evidence.validUntil)&&evidence.validUntil>Date.now()&&
      typeof evidence.provenance==='string'&&evidence.provenance.length>=8,
      's3_official_free_balance_unknown');
  }else check(tariff.billing_class==='priced','s3_tariff_unknown');
  const held=await b07Reserve(env,quote);
  // Failure to write the plan leaves a conservative orphan hold: never permit AI.
  const now=Date.now();
  try {
    await db.prepare('INSERT OR IGNORE INTO starry_ai_b07_s3_run_plans '+
      '(request_id,fingerprint,segment_count,max_attempts_per_segment,max_units_per_attempt,created_at) '+
      'VALUES(?,?,?,?,?,?)').bind(held.requestId,quote.fingerprint,plan.segmentCount,
        plan.maxAttemptsPerSegment,plan.maxUnitsPerAttempt,now).run();
  }catch{throw new B07Error('s3_plan_persist_failed_hold_retained',503)}
  const saved=await db.prepare('SELECT * FROM starry_ai_b07_s3_run_plans WHERE request_id=?')
    .bind(held.requestId).first();
  check(saved&&saved.fingerprint===quote.fingerprint&&saved.segment_count===plan.segmentCount&&
    saved.max_attempts_per_segment===plan.maxAttemptsPerSegment&&
    saved.max_units_per_attempt===plan.maxUnitsPerAttempt,'s3_plan_mismatch_hold_retained');
  return {requestId:held.requestId,state:held.state,duplicate:held.duplicate,
    reservedMicroTwd:held.reservedMicroTwd,stagingOnly:true};
}

export type S3AttemptClaim={
  requestId:string;segmentIndex:number;attemptOrdinal:number;
  /**
   * Trusted AI2 server adapter must have JUST checked session/authorization,
   * run generation, lease, source revision and permission/restore epoch.
   * This is NOT a public body parameter. There is no live adapter in S3.
   */
  runAuthority:{verified:boolean;expiresAt:number;revision:string};
};
export type S3ClaimResult={allowed:false;reason:string}|{
  allowed:true;attemptKey:string;mayHaveReachedProvider:true;
  maxUnits:number;providerCallsMadeByThisModule:0;
};
export async function claimProviderAttempt(env:S3Env,input:S3AttemptClaim):Promise<S3ClaimResult>{
  const db=dbOf(env);
  requireRequest(input?.requestId);
  const a=input.runAuthority;
  check(a?.verified===true&&integer(a.expiresAt,Date.now()+1,Number.MAX_SAFE_INTEGER)&&
    typeof a.revision==='string'&&a.revision.length>=8,'s3_run_authority_unverified');
  check(integer(input.segmentIndex,0,9999)&&integer(input.attemptOrdinal,0,4),
    's3_invalid_attempt');
  const plan=await db.prepare('SELECT * FROM starry_ai_b07_s3_run_plans WHERE request_id=?')
    .bind(input.requestId).first();
  if(!plan)return {allowed:false,reason:'s3_no_run_hold'};
  if(input.segmentIndex>=plan.segment_count||input.attemptOrdinal>=plan.max_attempts_per_segment)
    return {allowed:false,reason:'s3_attempt_outside_plan'};
  const attemptKey='s3:'+input.requestId+':'+input.segmentIndex+':'+input.attemptOrdinal;
  try{
    const result=await db.prepare('INSERT OR IGNORE INTO starry_ai_b07_s3_attempts '+
      '(attempt_key,request_id,segment_index,attempt_ordinal,max_units,status,created_at,updated_at) '+
      "VALUES(?,?,?,?,?,'may_have_sent',?,?)")
      .bind(attemptKey,input.requestId,input.segmentIndex,input.attemptOrdinal,
        plan.max_units_per_attempt,Date.now(),Date.now()).run();
    if(Number(result?.meta?.changes)===1)
      return {allowed:true,attemptKey,mayHaveReachedProvider:true,
        maxUnits:plan.max_units_per_attempt,providerCallsMadeByThisModule:0};
    return {allowed:false,reason:'s3_duplicate_attempt'};
  }catch{
    // A timeout/503 may mean INSERT committed. An unknown ticket NEVER retries.
    return {allowed:false,reason:'s3_duplicate_or_central_unavailable'};
  }
}

export async function completeOrHoldUncertain(env:S3Env,input:{
 requestId:string;attemptKey:string;kind:'confirmed_used'|'unknown';
 actualUnits?:number;receiptDigest?:string
}){
  const db=dbOf(env);requireRequest(input?.requestId);
  check(typeof input.attemptKey==='string'&&input.attemptKey.startsWith('s3:'+input.requestId+':'),
    's3_attempt_key_invalid');
  const old=await db.prepare('SELECT * FROM starry_ai_b07_s3_attempts WHERE attempt_key=? AND request_id=?')
    .bind(input.attemptKey,input.requestId).first();
  check(old,'s3_attempt_not_found',404);
  const status=input.kind==='confirmed_used'?'settled':'uncertain';
  const actual=status==='settled'?input.actualUnits:0;
  const receipt=status==='settled'?input.receiptDigest:'';
  check(status==='uncertain'||integer(actual,0,old.max_units),'s3_actual_above_hold');
  check(status==='uncertain'||typeof receipt==='string'&&hex64.test(receipt),
    's3_provider_receipt_missing');
  if(old.status!=='may_have_sent'){
    check(old.status===status&&old.actual_units===actual&&old.receipt_digest===receipt,
      's3_conflicting_terminal_outcome');
    return {state:status,idempotent:true,heldOnUnknown:status==='uncertain'};
  }
  const update=await db.prepare('UPDATE starry_ai_b07_s3_attempts '+
    'SET status=?,actual_units=?,receipt_digest=?,updated_at=? '+
    "WHERE attempt_key=? AND request_id=? AND status='may_have_sent'")
    .bind(status,actual,receipt,Date.now(),input.attemptKey,input.requestId).run();
  check(Number(update?.meta?.changes)===1,'s3_outcome_race');
  if(status==='uncertain'){
    // Idempotent original B07 terminal leaves ENTIRE original hold in place.
    await b07Complete(env,input.requestId,'uncertain');
  }
  return {state:status,idempotent:false,heldOnUnknown:status==='uncertain'};
}

export async function finalizeRunMax(env:S3Env,requestId:string){
  const db=dbOf(env);requireRequest(requestId);
  const plan=await db.prepare('SELECT * FROM starry_ai_b07_s3_run_plans WHERE request_id=?')
    .bind(requestId).first();
  check(plan,'s3_run_plan_missing');
  const totals=await db.prepare('SELECT COUNT(*) AS count,'+
    "SUM(CASE WHEN status='settled' THEN 1 ELSE 0 END) AS settled_count,"+
    'COALESCE(SUM(actual_units),0) AS used_units FROM starry_ai_b07_s3_attempts WHERE request_id=?')
    .bind(requestId).first();
  check(totals&&totals.count===plan.segment_count&&
    totals.settled_count===plan.segment_count,'s3_run_not_fully_accounted');
  const settled=await b07Complete(env,requestId,'settled',Number(totals.used_units));
  return {state:'settled',settledMicroTwd:settled.settledMicroTwd};
}
export async function cancelNeverSentRun(env:S3Env,requestId:string){
  const db=dbOf(env);requireRequest(requestId);
  const count=await db.prepare('SELECT COUNT(*) AS count FROM starry_ai_b07_s3_attempts WHERE request_id=?')
    .bind(requestId).first();
  check(Number(count?.count)===0,'s3_provider_may_have_been_called');
  return b07Complete(env,requestId,'void');
}
export async function reconcileByProof(env:S3Env,input:{
 requestId:string;evidenceSource:'provider_invoice'|'account_meter_verified';
 evidenceDigest:string;firstReviewer:string;secondReviewer:string;actualUnits:number
}){
  const db=dbOf(env);requireRequest(input?.requestId);
  check(['provider_invoice','account_meter_verified'].includes(input.evidenceSource)&&
    hex64.test(input.evidenceDigest),'s3_unverifiable_invoice');
  check(typeof input.firstReviewer==='string'&&input.firstReviewer.length>=8&&
    typeof input.secondReviewer==='string'&&input.secondReviewer.length>=8&&
    input.firstReviewer!==input.secondReviewer,'s3_two_independent_reviewers_required');
  check(integer(input.actualUnits,0,1_000_000_000),'s3_invalid_actual_units');
  check(env.B07_REVIEW_AUTHORITY&&typeof env.B07_REVIEW_AUTHORITY.verify==='function',
    's3_review_authority_unavailable');
  check(await env.B07_REVIEW_AUTHORITY.verify({
    requestId:input.requestId,firstReviewer:input.firstReviewer,secondReviewer:input.secondReviewer,
    evidenceSource:input.evidenceSource,evidenceDigest:input.evidenceDigest
  }),'s3_review_not_authorized',403);
  const old=await db.prepare('SELECT * FROM starry_ai_b07_calls WHERE id=?')
    .bind(input.requestId).first();
  check(old?.status==='uncertain','s3_invoice_requires_uncertain_call');
  check(input.actualUnits<=old.max_units,'s3_invoice_above_hold');
  const actual=old.unit_micro_twd*input.actualUnits;
  check(Number.isSafeInteger(actual)&&actual<=old.held_micro_twd,
    's3_invoice_cost_outside_hold');
  const existing=await db.prepare('SELECT * FROM starry_ai_b07_s3_reconciliations WHERE request_id=?')
    .bind(input.requestId).first();
  if(existing){
    check(existing.actual_units===input.actualUnits&&
      existing.evidence_digest===input.evidenceDigest&&
      existing.evidence_source===input.evidenceSource,'s3_invoice_conflict');
    return {id:existing.id,idempotent:true,settledMicroTwd:existing.settled_micro_twd};
  }
  const id='s3rec:'+input.requestId;
  try{
    const result=await db.prepare('INSERT OR IGNORE INTO starry_ai_b07_s3_reconciliations '+
      '(id,request_id,evidence_source,evidence_digest,first_reviewer,second_reviewer,'+
      'actual_units,settled_micro_twd,released_micro_twd,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .bind(id,input.requestId,input.evidenceSource,input.evidenceDigest,
        input.firstReviewer,input.secondReviewer,input.actualUnits,actual,
        old.held_micro_twd-actual,Date.now()).run();
    if(Number(result?.meta?.changes)===1)
      return {id,idempotent:false,settledMicroTwd:actual};
  }catch{
    // May be a committed INSERT with a lost acknowledgement.
  }
  const race=await db.prepare('SELECT * FROM starry_ai_b07_s3_reconciliations WHERE request_id=?')
    .bind(input.requestId).first();
  check(race&&race.evidence_digest===input.evidenceDigest&&
    race.actual_units===input.actualUnits&&race.evidence_source===input.evidenceSource,
    's3_invoice_persist_unknown',503);
  return {id:race.id,idempotent:true,settledMicroTwd:race.settled_micro_twd};
}
