import { requestSafeRun, failSafeRun } from './transcriptP0Safety';
import { transcriptTargetConcurrency } from './starryAiManagement';

type Env={DB:any;TRANSCRIPT_WORKFLOW:any;[key:string]:any};
const getKey=(url:string)=>{
  const marker='/api/r2/file/';
  const i=String(url||'').indexOf(marker);
  if(i<0)return '';
  try{return decodeURIComponent(String(url).slice(i+marker.length));}
  catch{return '';}
};
/** Strictly separate pending new recordings from ready candidate re-listens.
 * The run reservation is atomic inside D1. NEVER requeue an unknown live run.
 */
export async function queueNextTranscriptGate2P0(env:Env){
  const now=Date.now(),target=Math.max(0,Math.min(5,Number(await transcriptTargetConcurrency(env))));
  // Populate at most five first-run intents per tick. No original ready row is touched.
  const unstarted:any=await env.DB.prepare(
    "SELECT i.trackId,t.audioUrl FROM transcript_index i JOIN tracks t ON t.id=i.trackId "+
    "WHERE i.status='pending' AND i.r2Key IS NULL AND t.audioUrl LIKE '%/api/r2/file/%' "+
    "AND NOT EXISTS(SELECT 1 FROM transcript_runs r WHERE r.trackId=i.trackId) "+
    "ORDER BY COALESCE(t.uploadDate,'') DESC,t.id LIMIT 5").all();
  for(const item of unstarted?.results||[]){
    const key=getKey(item.audioUrl);
    if(key)await requestSafeRun(env.DB,{trackId:String(item.trackId),intent:'first',
      sourceAudioKey:key,sourceAudioUrl:String(item.audioUrl),requestKey:'first:'+String(item.trackId)+':'+key});
  }
  const all:any=await env.DB.prepare(
    "UPDATE transcript_runs SET state='queued',updatedAt=? "+
    "WHERE runId IN(SELECT runId FROM transcript_runs WHERE state='pending' ORDER BY createdAt "+
    "LIMIT(SELECT MAX(0, ?-COUNT(*)) FROM transcript_runs WHERE state IN ('queued','processing'))) "+
    "RETURNING runId,trackId,intent,sourceAudioKey,generation").bind(now,target).all();
  const claimed:any[]=all?.results||[],started:any[]=[],failures:any[]=[];
  for(let i=0;i<claimed.length;i++){
    const run=claimed[i],trackId=String(run.trackId),runId=String(run.runId);
    if(run.intent==='first'){
      const index=await env.DB.prepare(
        "UPDATE transcript_index SET status='queued',updatedAt=? "+
        "WHERE trackId=? AND status='pending' AND r2Key IS NULL RETURNING trackId")
        .bind(now,trackId).first();
      if(!index){
        await env.DB.prepare("UPDATE transcript_runs SET state='failed',error='queue_claim_lost',updatedAt=? "+
          "WHERE runId=? AND state='queued'").bind(now,runId).run();
        failures.push({trackId,error:'queue claim lost'});
        continue;
      }
    }
    try{
      const safeId=trackId.replace(/[^A-Za-z0-9_-]/g,'_').slice(0,32);
      const instanceId='echo-gate2-'+safeId+'-'+runId.replace(/[^A-Za-z0-9_-]/g,'').slice(0,28);
      const result:any=await env.TRANSCRIPT_WORKFLOW.createBatch({
        instances:[{id:instanceId,params:{trackId,runId}}]
      });
      if(result?.errors?.length)throw new Error(String(result.errors[0]?.message||'queue error'));
      started.push({trackId,instanceId});
    }catch(error){
      await failSafeRun(env.DB,{...run,state:'queued'} as any,error);
      if(run.intent==='first')await env.DB.prepare(
        "UPDATE transcript_index SET status='failed',error='Workflow could not start',updatedAt=? "+
        "WHERE trackId=? AND status='queued' AND workingRunId IS NULL AND r2Key IS NULL")
        .bind(Date.now(),trackId).run();
      failures.push({trackId,error:'Workflow could not start'});
    }
  }
  const active=await env.DB.prepare("SELECT COUNT(*) AS n FROM transcript_runs WHERE state IN ('queued','processing')").first();
  const remaining=await env.DB.prepare("SELECT COUNT(*) AS n FROM transcript_runs WHERE state='pending'").first();
  const activeCount=Number(active?.n||0),remainingCount=Number(remaining?.n||0);
  return {queued:started.length,active:activeCount,targetConcurrency:target,
    remaining:remainingCount,failures,started,done:activeCount===0&&remainingCount===0};
}
