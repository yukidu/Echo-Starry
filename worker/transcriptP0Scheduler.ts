import { requestSafeRun, failSafeRun, sourceRevision, queueSafeRun, quarantineExpiredRuns } from './transcriptP0Safety';
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
  const target=Math.max(0,Math.min(5,Number(await transcriptTargetConcurrency(env))));
  // Populate at most five first-run intents per tick. No original ready row is touched.
  const unstarted:any=await env.DB.prepare(
    "SELECT i.trackId,t.audioUrl FROM transcript_index i JOIN tracks t ON t.id=i.trackId "+
    "WHERE i.status='pending' AND i.r2Key IS NULL AND t.audioUrl LIKE '%/api/r2/file/%' "+
    "AND NOT EXISTS(SELECT 1 FROM transcript_runs r WHERE r.trackId=i.trackId) "+
    "ORDER BY COALESCE(t.uploadDate,'') DESC,t.id LIMIT 5").all();
  for(const item of unstarted?.results||[]){
    const key=getKey(item.audioUrl);
    if(key){
      // A candidate is bound to the source object content revision, not URL alone.
      const etag=await sourceRevision(env.R2_BUCKET,key).catch(()=>null);
      if(etag)await requestSafeRun(env.DB,{trackId:String(item.trackId),intent:'first',
        sourceAudioKey:key,sourceAudioUrl:String(item.audioUrl),sourceAudioEtag:etag,
        requestKey:'first:'+String(item.trackId)+':'+key+':'+etag});
    }
  }
  await quarantineExpiredRuns(env.DB);
  // Each first-run queue transition is transactional with transcript_index.
  const waiting:any=await env.DB.prepare("SELECT runId FROM transcript_runs WHERE state='pending' ORDER BY createdAt LIMIT 5").all();
  const claimed:any[]=[],started:any[]=[],failures:any[]=[];
  for(const entry of waiting?.results||[]){
    try{
      const queued=await queueSafeRun(env.DB,String(entry.runId),target);
      if(queued)claimed.push(queued);
    }catch{
      // A conflicting transition must roll back, not stop unrelated tracks.
      failures.push({runId:String(entry.runId),error:'Queue reservation refused; review state'});
    }
  }
  for(let i=0;i<claimed.length;i++){
    const run=claimed[i],trackId=String(run.trackId),runId=String(run.runId);
    try{
      const safeId=trackId.replace(/[^A-Za-z0-9_-]/g,'_').slice(0,32);
      const instanceId='echo-gate2-'+safeId+'-'+runId.replace(/[^A-Za-z0-9_-]/g,'').slice(0,28);
      const result:any=await env.TRANSCRIPT_WORKFLOW.createBatch({
        instances:[{id:instanceId,params:{trackId,runId}}]
      });
      if(result?.errors?.length)throw new Error(String(result.errors[0]?.message||'queue error'));
      started.push({trackId,instanceId});
    }catch(error){
      // Both new-audio failure states transition atomically in failSafeRun.
      // If that transaction fails, leave the queued lease for manual quarantine.
      try{
        await failSafeRun(env.DB,{...run,state:'queued'} as any,error);
        failures.push({trackId,error:'Workflow could not start; manual review required'});
      }catch{
        failures.push({trackId,error:'Workflow dispatch outcome uncertain; manual review required'});
      }
    }
  }
  const active=await env.DB.prepare("SELECT COUNT(*) AS n FROM transcript_runs WHERE state IN ('queued','processing')").first();
  const remaining=await env.DB.prepare("SELECT COUNT(*) AS n FROM transcript_runs WHERE state='pending'").first();
  const activeCount=Number(active?.n||0),remainingCount=Number(remaining?.n||0);
  return {queued:started.length,active:activeCount,targetConcurrency:target,
    remaining:remainingCount,failures,started,done:activeCount===0&&remainingCount===0};
}
