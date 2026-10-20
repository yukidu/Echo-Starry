/**
 * C09/C10 durable and bounded rebuild queue.
 * The migration's SQLite triggers enqueue the same track in the SAME D1
 * transaction as a transcript correction or permissions change.
 *
 * Both scheduling paths (post-mutation waitUntil and existing 5-minute cron)
 * are gated OFF by default. No schema creation, historical backfill, AI calls,
 * or original R2 modifications are performed by this worker.
 */
import { rebuildQaSearchAfterMutation } from './qaTranscriptSearchIndex';

type Env={DB:any;R2_BUCKET?:any;QA_CHINESE_SEARCH_WRITE_ENABLED?:string};
type Job={trackId:string;requestedRevision:number;attempts:number};
const MAX_PER_TICK=2;
const MAX_ATTEMPTS=5;
const LEASE_MS=120_000;
const rows=(x:any):any[]=>Array.isArray(x?.results)?x.results:[];

export function qaSearchRetryDelayMs(attempts:number):number{
  return Math.min(60*60_000, Math.max(1,attempts)**2*60_000);
}

async function claim(db:any,trackId:string,revision:number,now:number):Promise<Job|null>{
  // Compare-and-swap: only one worker can claim a given revision while lease
  // valid; stale leases can be reclaimed after worker termination.
  const job:any=await db.prepare(
    "UPDATE qa_search_rebuild_jobs SET status='running',leaseUntil=?,attempts=attempts+1,updatedAt=? "+
    "WHERE trackId=? AND requestedRevision=? AND nextAttemptAt<=? "+
    "AND (status IN ('pending','retry') OR (status='running' AND leaseUntil<=?)) "+
    'RETURNING trackId,requestedRevision,attempts'
  ).bind(now+LEASE_MS,now,trackId,revision,now,now).first();
  return job?{trackId:String(job.trackId),requestedRevision:Number(job.requestedRevision),attempts:Number(job.attempts)}:null;
}

async function runJob(env:Env,job:Job,now:number):Promise<void>{
  let error='';
  try{
    const result=await rebuildQaSearchAfterMutation(env,job.trackId,job.requestedRevision);
    if(result.indexed || result.reason==='deleted_track'){
      await env.DB.prepare(
        "UPDATE qa_search_rebuild_jobs SET status='done',lastError=NULL,leaseUntil=0,nextAttemptAt=0,updatedAt=? "+
        "WHERE trackId=? AND requestedRevision=? AND status='running'"
      ).bind(now,job.trackId,job.requestedRevision).run();
      return;
    }
    error=String(result.reason||'not_indexed');
  }catch(e){
    error=e instanceof Error?e.message:'unknown_error';
  }
  const terminal=job.attempts>=MAX_ATTEMPTS;
  const retryAt=terminal?0:now+qaSearchRetryDelayMs(job.attempts);
  await env.DB.prepare(
    "UPDATE qa_search_rebuild_jobs SET status=?,lastError=?,leaseUntil=0,nextAttemptAt=?,updatedAt=? "+
    "WHERE trackId=? AND requestedRevision=? AND status='running'"
  ).bind(terminal?'failed':'retry',error.slice(0,160),retryAt,now,job.trackId,job.requestedRevision).run();
  // Failed jobs stay invalidated; no unsafe original-text fallback.
}

export async function drainQaSearchRebuildQueue(env:Env,limit=MAX_PER_TICK):Promise<number>{
  if(env.QA_CHINESE_SEARCH_WRITE_ENABLED!=='true'||!env.DB||!env.R2_BUCKET)return 0;
  const take=Math.min(MAX_PER_TICK,Math.max(0,Math.floor(limit)));
  if(!take)return 0;
  const now=Date.now();
  const candidates=rows(await env.DB.prepare(
    "SELECT trackId,requestedRevision FROM qa_search_rebuild_jobs "+
    "WHERE nextAttemptAt<=? AND (status IN ('pending','retry') "+
    "OR (status='running' AND leaseUntil<=?)) ORDER BY updatedAt,trackId LIMIT ?"
  ).bind(now,now,take).all());
  let claimed=0;
  // Sequential processing to avoid concurrent R2/FTS bursts and keep free-tier usage low.
  for(const item of candidates){
    const job=await claim(env,String(item.trackId),Number(item.requestedRevision),Date.now());
    if(!job)continue;
    claimed++;
    await runJob(env,job,Date.now());
  }
  return claimed;
}

export async function qaSearchRebuildStatus(db:any):Promise<{
  waiting:number;processing:number;retrying:number;failed:number;lastError:string
}>{
  const result=rows(await db.prepare(
    "SELECT status,COUNT(*) total FROM qa_search_rebuild_jobs GROUP BY status"
  ).all());
  const counts=new Map(result.map(r=>[String(r.status),Number(r.total)]));
  const last:any=await db.prepare(
    "SELECT lastError FROM qa_search_rebuild_jobs WHERE status='failed' "+
    "ORDER BY updatedAt DESC LIMIT 1"
  ).first();
  return {waiting:counts.get('pending')||0,processing:counts.get('running')||0,
    retrying:counts.get('retry')||0,failed:counts.get('failed')||0,
    lastError:String(last?.lastError||'').slice(0,100)};
}

/** Super-admin only caller: manually reset an exhausted job after fixing its cause.
 * Does not rebuild immediately and cannot expand to a bulk operation.
 */
export async function retryFailedQaSearchRebuild(db:any,trackId:string):Promise<boolean>{
  if(!trackId||trackId.length>128)return false;
  const row:any=await db.prepare(
    "UPDATE qa_search_rebuild_jobs SET status='pending',attempts=0,nextAttemptAt=0,leaseUntil=0,"+
    "requestedRevision=(SELECT changeRevision FROM qa_search_state WHERE trackId=?),lastError=NULL,updatedAt=? "+
    "WHERE trackId=? AND status='failed' AND EXISTS ("+
    "SELECT 1 FROM qa_search_state s WHERE s.trackId=? AND s.invalidated=1) RETURNING trackId"
  ).bind(trackId,Date.now(),trackId,trackId).first();
  return Boolean(row?.trackId);
}
