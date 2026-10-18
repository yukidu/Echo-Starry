import {mayStartAiBackground} from './starryAiManagement';
import {markSpeakerBiosDirty} from './aiSpeakerProfileRouter';
import {inferStoryBatch,storyBatch,STORY_AI_MODEL} from './aiSpeakerStoryInference';
import {splitSpeakerNames} from '../shared/speakers';
import {STORY_PROMPT_VERSION,SHARED_OWNER,UNKNOWN_OWNER,expandedApprovedOwners,pilotSourceRevision,storyText} from '../shared/storyAttribution';

type Env={DB:any;AI?:any;R2_BUCKET?:any;[key:string]:any};
type DraftFact={id:string;segmentId:string;owner:string;narrator:string;kind:string;summary:string;evidence:string;start:number;end:number};
export const STORY_PILOT_IDS=[
  't-8465a416-0985-4e47-ade8-d1ba8f2f8661',
  't-aaca6f2a-cb05-493e-ab19-b915773812c4',
  't-7f537dd2-38f2-4d47-8f0b-ff15f3f22d95',
  't-a8db1b4f-6dfa-4c0b-9f3e-e3a49c15af6a',
  't-31a78e3b-4334-49b0-bb74-23aef4113817'
] as const;
export const isStoryPilotId=(id:string)=>STORY_PILOT_IDS.some(x=>x===id);
export const storyDraftKey=(id:string)=>'transcripts/'+encodeURIComponent(id)+'/story-owner-draft-v1.json';
export const storyApprovedKey=(id:string)=>'transcripts/'+encodeURIComponent(id)+'/story-owner-approved-v1.json';
export async function storyLoad(env:Env,key:string):Promise<any|null>{
  const item=await env.R2_BUCKET?.get(key);
  return item?JSON.parse(await item.text()):null;
}
export async function storyPut(env:Env,key:string,body:any){
  await env.R2_BUCKET.put(key,JSON.stringify(body),{httpMetadata:{contentType:'application/json; charset=utf-8'}});
}
export async function storyPilot(env:Env,id:string){
  if(!isStoryPilotId(id))return null;
  return env.DB.prepare("SELECT p.*,t.speaker,t.title,i.status AS transcriptStatus,i.r2Key AS transcriptR2Key,i.updatedAt AS transcriptUpdatedAt FROM ai_story_pilots p JOIN tracks t ON t.id=p.trackId LEFT JOIN transcript_index i ON i.trackId=p.trackId WHERE p.trackId=? LIMIT 1").bind(id).first();
}
export const storyRevision=(row:any)=>pilotSourceRevision(row.transcriptUpdatedAt,row.transcriptR2Key,row.speaker);
/** All verified owners are indexed; unknown statements are stored in R2 but never published. */
export function effectiveStoryFacts(draft:any,overrides:Map<string,string>,speakersField:string){
  const allowed=splitSpeakerNames(speakersField);
  const out:{id:string;owner:string;kind:string;narrator:string;segmentId:string;text:string;start:number}[]=[];
  const seen=new Set<string>();
  for(const item of (Array.isArray(draft?.items)?draft.items:[]) as DraftFact[]){
    const override=overrides.get(item.segmentId);
    const owner=override??item.owner;
    if(owner===UNKNOWN_OWNER||(!allowed.includes(owner)&&owner!==SHARED_OWNER))continue;
    if(!item.id||!item.segmentId||!storyText(item.summary))continue;
    const kind=owner===SHARED_OWNER?'shared':item.kind==='unknown'?'personal':item.kind;
    for(const person of expandedApprovedOwners(owner,speakersField)){
      const key=item.id+':'+person;
      if(seen.has(key))continue;
      seen.add(key);
      out.push({id:item.id,owner:person,kind,narrator:item.narrator||UNKNOWN_OWNER,segmentId:item.segmentId,text:item.summary,start:Number(item.start)||0});
    }
  }
  return out;
}
async function publishStory(env:Env,row:any,draft:any,extraOverride?:{segmentId:string;owner:string;actor:string;factId:string;oldOwner:string}){
  const rev=storyRevision(row);
  if(row.revision!==rev||draft.revision!==rev||!draft.done)throw Error('逐字稿已改變或分析尚未完成，不可發布');
  const existing=await env.DB.prepare('SELECT segmentId,owner FROM ai_story_manual_overrides WHERE trackId=?').bind(row.trackId).all();
  const overrides=new Map<string,string>((existing.results||[]).map((r:any)=>[r.segmentId,r.owner]));
  if(extraOverride)overrides.set(extraOverride.segmentId,extraOverride.owner);
  const facts=effectiveStoryFacts(draft,overrides,row.speaker);
  const now=Date.now(),version=storyApprovedKey(row.trackId);
  // R2 document is an immutable-source derived copy, never replaces the transcript.
  const document={version:2,trackId:row.trackId,revision:rev,publishedAt:now,method:extraOverride?'manual-override':'automatic-evidence-only',promptVersion:STORY_PROMPT_VERSION,items:draft.items,overrides:[...overrides.entries()]};
  await storyPut(env,version,document);
  const statements:any[]=[];
  if(extraOverride){
    statements.push(env.DB.prepare("INSERT INTO ai_story_manual_overrides(trackId,segmentId,owner,editedBy,editedAt) VALUES(?,?,?,?,?) ON CONFLICT(trackId,segmentId) DO UPDATE SET owner=excluded.owner,editedBy=excluded.editedBy,editedAt=excluded.editedAt")
      .bind(row.trackId,extraOverride.segmentId,extraOverride.owner,extraOverride.actor,now));
    statements.push(env.DB.prepare('INSERT INTO ai_story_owner_edits(id,trackId,segmentId,factId,oldOwner,newOwner,editedBy,editedAt) VALUES(?,?,?,?,?,?,?,?)')
      .bind('edit-'+crypto.randomUUID(),row.trackId,extraOverride.segmentId,extraOverride.factId,extraOverride.oldOwner,extraOverride.owner,extraOverride.actor,now));
  }
  statements.push(env.DB.prepare('DELETE FROM ai_story_facts WHERE trackId=?').bind(row.trackId));
  for(const f of facts)statements.push(env.DB.prepare('INSERT INTO ai_story_facts(trackId,factId,owner,kind,narrator,segmentId,text,start,sourceRevision) VALUES(?,?,?,?,?,?,?,?,?)')
    .bind(row.trackId,f.id,f.owner,f.kind,f.narrator,f.segmentId,f.text,f.start,rev));
  // Approval timestamp invalidates old AI replies; quota/entitlement checks remain unchanged.
  statements.push(env.DB.prepare("UPDATE ai_story_pilots SET status='approved',autoRun=0,r2Key=?,reviewer=?,approvedAt=?,error=NULL,updatedAt=? WHERE trackId=? AND revision=?")
    .bind(version,extraOverride?extraOverride.actor:'AI（自動歸屬）',now,now,row.trackId,rev));
  await env.DB.batch(statements);
  await markSpeakerBiosDirty(env,row.trackId);
  return {published:facts.length,unconfirmed:(draft.items||[]).filter((f:any)=>!overrides.has(f.segmentId)&&f.owner===UNKNOWN_OWNER).length};
}
export async function editStoryOwner(env:Env,id:string,factId:string,owner:string,actor:string){
  const row:any=await storyPilot(env,id);
  if(!row||row.status!=='approved'||row.revision!==storyRevision(row))throw Error('此場錄音尚未完成或逐字稿已更新');
  const people=splitSpeakerNames(row.speaker);
  if(owner!==UNKNOWN_OWNER&&owner!==SHARED_OWNER&&!people.includes(owner))throw Error('請選擇現有演講者、共同經歷或無法確認');
  const draft=await storyLoad(env,storyDraftKey(id));
  const fact=(draft?.items||[]).find((x:any)=>x.id===factId);
  if(!fact)throw Error('找不到指定的故事來源');
  const overrides=await env.DB.prepare('SELECT owner FROM ai_story_manual_overrides WHERE trackId=? AND segmentId=?').bind(id,fact.segmentId).first();
  const prior=overrides?.owner||fact.owner;
  if(prior===owner)return {unchanged:true};
  const result=await publishStory(env,row,draft,{segmentId:fact.segmentId,owner,actor,factId,oldOwner:prior});
  return {...result,success:true};
}
/** One 25-segment batch per cron event: bounded AI cost; stops when five test recordings are finished. */
export async function runNextStoryAttribution(env:Env){
  if(!env.DB||!env.AI||!env.R2_BUCKET)return {status:'unavailable'};
  if(!await mayStartAiBackground(env as any,'echo.bio'))return {status:'priority_deferred'};
  const now=Date.now();
  // Recover a crashed Worker after 20 minutes without restarting successful batches.
  await env.DB.prepare("UPDATE ai_story_pilots SET status='pending' WHERE autoRun=1 AND status='processing' AND updatedAt<?")
    .bind(now-20*60_000).run();
  const rows=await env.DB.prepare("SELECT trackId FROM ai_story_pilots WHERE autoRun=1 AND status='pending' ORDER BY updatedAt ASC LIMIT 5").all();
  for(const candidate of rows.results||[]){
    const id=storyText(candidate.trackId);
    if(!isStoryPilotId(id))continue;
    const current:any=await storyPilot(env,id);
    if(!current||current.transcriptStatus!=='ready'||!current.transcriptR2Key)continue;
    const revision=storyRevision(current);
    // Atomic claim prevents any simultaneous cron or manual trigger from spending AI twice.
    const claim:any=await env.DB.prepare("UPDATE ai_story_pilots SET status='processing',revision=?,cursor=CASE WHEN revision=? THEN cursor ELSE 0 END,error=NULL,updatedAt=? WHERE trackId=? AND autoRun=1 AND status='pending' RETURNING trackId,cursor")
      .bind(revision,revision,now,id).first();
    if(!claim)continue;
    try{
      const original=await storyLoad(env,current.transcriptR2Key);
      const segments=Array.isArray(original?.segments)?original.segments.filter((s:any)=>storyText(s.text)&&storyText(s.id)):[];
      if(!segments.length)throw Error('逐字稿缺少有效段落');
      const cursor=Math.max(0,Number(claim.cursor)||0);
      const {part,snippets}=storyBatch(segments,cursor);
      let draft=cursor?await storyLoad(env,storyDraftKey(id)):null;
      if(!draft||draft.revision!==revision||!Array.isArray(draft.items)){
        if(cursor)throw Error('原先分析草稿缺失，為保護已完成進度已暫停，請手動重置');
        draft={version:2,revision,model:STORY_AI_MODEL,promptVersion:STORY_PROMPT_VERSION,trackId:id,items:[]};
      }
      if(part.length){
        const facts=await inferStoryBatch(env.AI,part,current.speaker,snippets);
        const seen=new Set(draft.items.map((x:any)=>x.segmentId+'|'+x.owner+'|'+x.summary));
        for(const fact of facts){
          const key=fact.segmentId+'|'+fact.owner+'|'+fact.summary;
          if(!seen.has(key)){seen.add(key);draft.items.push(fact);}
        }
      }
      draft.cursor=cursor+part.length;draft.total=segments.length;draft.done=draft.cursor>=draft.total;draft.updatedAt=Date.now();
      await storyPut(env,storyDraftKey(id),draft);
      const verify:any=await storyPilot(env,id);
      if(!verify||storyRevision(verify)!==revision){
        await env.DB.prepare("UPDATE ai_story_pilots SET status='pending',revision='',cursor=0,error=NULL,updatedAt=? WHERE trackId=? AND status='processing'").bind(Date.now(),id).run();
        return {status:'source_changed',trackId:id};
      }
      if(draft.done){
        // Do not call the former human-review gate; only evidence-backed claims are indexed.
        const result=await publishStory(env,{...verify,revision},draft);
        return {status:'approved',trackId:id,cursor:draft.cursor,total:draft.total,...result};
      }
      await env.DB.prepare("UPDATE ai_story_pilots SET status='pending',cursor=?,r2Key=?,updatedAt=?,error=NULL WHERE trackId=? AND status='processing' AND revision=?")
        .bind(draft.cursor,storyDraftKey(id),Date.now(),id,revision).run();
      return {status:'progress',trackId:id,cursor:draft.cursor,total:draft.total};
    }catch(e){
      const msg=e instanceof Error?e.message:'AI 分析暫時失敗';
      await env.DB.prepare("UPDATE ai_story_pilots SET status='failed',autoRun=0,error=?,updatedAt=? WHERE trackId=? AND status='processing'")
        .bind(msg.slice(0,230),Date.now(),id).run().catch(()=>null);
      return {status:'failed',trackId:id,error:msg};
    }
  }
  return {status:'idle'};
}
