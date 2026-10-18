import { actor,isSuper } from './aiSpeakerQaRouter';
import { storyBatch,inferStoryBatch,STORY_AI_MODEL } from './aiSpeakerStoryInference';
import { splitSpeakerNames } from '../shared/speakers';
import {
  STORY_PROMPT_VERSION,SHARED_OWNER,UNKNOWN_OWNER,
  pilotSourceRevision,parseStoryClaims,expandedApprovedOwners,storyText
} from '../shared/storyAttribution';
import {markSpeakerBiosDirty} from './aiSpeakerProfileRouter';

type Env={DB:any;R2_BUCKET?:any;AI?:any;[key:string]:any};
const json=(v:any,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store'}});
const draftKey=(id:string)=>'transcripts/'+encodeURIComponent(id)+'/story-owner-draft-v1.json';
const approvedKey=(id:string)=>'transcripts/'+encodeURIComponent(id)+'/story-owner-approved-v1.json';
async function load(env:Env,key:string){
  const file=await env.R2_BUCKET?.get(key);
  if(!file)return null;
  return JSON.parse(await file.text());
}
async function put(env:Env,key:string,data:any){
  await env.R2_BUCKET.put(key,JSON.stringify(data),{httpMetadata:{contentType:'application/json; charset=utf-8'}});
}
async function pilot(env:Env,id:string){
  return env.DB.prepare("SELECT p.*,t.speaker,t.title,t.requiredRank,t.stickerUnlockCost,t.isPrivateVip,t.authorizedOnlyVisible,i.status AS transcriptStatus,i.r2Key AS transcriptR2Key,i.updatedAt AS transcriptUpdatedAt FROM ai_story_pilots p JOIN tracks t ON t.id=p.trackId LEFT JOIN transcript_index i ON i.trackId=p.trackId WHERE p.trackId=? LIMIT 1").bind(id).first();
}
function revision(row:any){
  return pilotSourceRevision(row.transcriptUpdatedAt,row.transcriptR2Key,row.speaker);
}
export async function handleStoryAttributionRequest(req:Request,env:Env):Promise<Response|null>{
  const url=new URL(req.url);
  if(!url.pathname.startsWith('/api/speaker-stories/'))return null;
  try{
    const user=await actor(req,env);
    if(!isSuper(user))return json({error:'只有超級管理員可以操作故事歸屬'},403);
    if(!env.DB||!env.R2_BUCKET)return json({error:'雲端儲存目前無法使用'},503);
    const path=url.pathname,method=req.method.toUpperCase();
    if(path==='/api/speaker-stories/admin'&&method==='GET'){
      const rows=await env.DB.prepare("SELECT p.*,t.title,t.speaker,i.status AS transcriptStatus,i.updatedAt AS transcriptUpdatedAt,i.r2Key AS transcriptR2Key,(SELECT COUNT(*) FROM ai_story_facts f WHERE f.trackId=p.trackId) AS approvedFacts FROM ai_story_pilots p JOIN tracks t ON t.id=p.trackId LEFT JOIN transcript_index i ON i.trackId=p.trackId ORDER BY t.title,p.trackId").all();
      const items=(rows.results||[]).map((r:any)=>({...r,stale:r.status==='approved'&&r.revision!==revision(r)}));
      const id=storyText(url.searchParams.get('trackId'));
      if(!id)return json({items});
      const selected=items.find((x:any)=>x.trackId===id);
      if(!selected)return json({error:'此音檔不在五場測試名單中'},404);
      const draft=await load(env,draftKey(id));
      return json({items,selected,draft:draft?.revision===revision(selected)?draft:null});
    }
    if(path==='/api/speaker-stories/analyze'&&method==='POST'){
      if(!env.AI)return json({error:'AI 尚未啟用'},503);
      const b:any=await req.json().catch(()=>null),id=storyText(b?.trackId);
      const row:any=id?await pilot(env,id):null;
      if(!row||row.transcriptStatus!=='ready'||!row.transcriptR2Key)return json({error:'找不到可分析的試點逐字稿'},404);
      if(splitSpeakerNames(row.speaker).length<2)return json({error:'這場錄音沒有設定兩位以上演講者'},400);
      if(row.status==='approved')return json({error:'已審核通過，如需重新分析請先使用重置功能'},409);
      const rev=revision(row);
      // Claim before consuming AI budget; double clicks cannot duplicate inference.
      const claimed=await env.DB.prepare("UPDATE ai_story_pilots SET status='processing',revision=?,cursor=CASE WHEN revision=? THEN cursor ELSE 0 END,error=NULL,updatedAt=? WHERE trackId=? AND status IN ('pending','failed','needs_review') RETURNING trackId,cursor").bind(rev,rev,Date.now(),id).first();
      if(!claimed)return json({error:'故事辨識正在執行，請稍候刷新'},409);
      try{
        const original=await load(env,row.transcriptR2Key);
        const segments=Array.isArray(original?.segments)?original.segments.filter((s:any)=>storyText(s.text)&&storyText(s.id)):[];
        if(!segments.length)throw Error('原始逐字稿缺少有效時間段落');
        const cursor=Number(claimed.cursor||0);
        const {part,snippets}=storyBatch(segments,cursor);
        let draft=cursor?await load(env,draftKey(id)):null;
        if(!draft||draft.revision!==rev||!Array.isArray(draft.items))draft={version:1,revision:rev,model:STORY_AI_MODEL,promptVersion:STORY_PROMPT_VERSION,trackId:id,items:[]};
        if(part.length){
          const facts=await inferStoryBatch(env.AI,part,row.speaker,snippets);
          const dedup=new Set(draft.items.map((x:any)=>x.segmentId+'|'+x.owner+'|'+x.summary));
          for(const fact of facts){const key=fact.segmentId+'|'+fact.owner+'|'+fact.summary;if(!dedup.has(key)){draft.items.push(fact);dedup.add(key);}}
        }
        const next=cursor+part.length,done=next>=segments.length;
        draft.done=done;draft.cursor=next;draft.total=segments.length;draft.updatedAt=Date.now();
        await put(env,draftKey(id),draft);
        await env.DB.prepare("UPDATE ai_story_pilots SET status=?,cursor=?,r2Key=?,updatedAt=?,error=NULL WHERE trackId=? AND status='processing' AND revision=?")
          .bind(done?'needs_review':'pending',next,draftKey(id),Date.now(),id,rev).run();
        return json({success:true,done,cursor:next,total:segments.length,candidates:draft.items.length,message:done?'全部分析完成，等待人工審核':'已分析一部分，請繼續分析下一段'});
      }catch(error){
        const msg=error instanceof Error?error.message:'辨識失敗';
        await env.DB.prepare("UPDATE ai_story_pilots SET status='failed',error=?,updatedAt=? WHERE trackId=? AND status='processing'").bind(msg.slice(0,230),Date.now(),id).run();
        return json({error:msg},503);
      }
    }
    if(path==='/api/speaker-stories/approve'&&method==='POST'){
      const b:any=await req.json().catch(()=>null),id=storyText(b?.trackId),decisions=b?.decisions;
      if(!Array.isArray(decisions)||decisions.length>200)return json({error:'請提供審核清單'},400);
      const row:any=id?await pilot(env,id):null;
      if(!row||row.status!=='needs_review'||revision(row)!==row.revision)return json({error:'請先完成最新逐字稿的分析'},409);
      const draft=await load(env,draftKey(id));
      if(!draft?.done||draft.revision!==row.revision)return json({error:'AI 分析結果尚不完整'},409);
      const byId=new Map((draft.items||[]).map((x:any)=>[x.id,x]));
      const speakers=splitSpeakerNames(row.speaker);
      const accepted:any[]=[];
      for(const choice of decisions){
        if(!choice?.include)continue;
        const entry:any=byId.get(storyText(choice.id));
        if(!entry)return json({error:'找不到指定的故事項目'},400);
        const owner=storyText(choice.owner)||entry.owner;
        if(owner!==SHARED_OWNER&&!speakers.includes(owner))return json({error:'不確定的故事不能發佈，請指定正確人物或取消勾選'},400);
        if(!storyText(entry.summary)||!storyText(entry.segmentId))return json({error:'來源資料不完整'},400);
        accepted.push({...entry,owner,kind:owner===SHARED_OWNER?'shared':entry.kind==='unknown'?'personal':entry.kind});
      }
      if(!accepted.length)return json({error:'請至少確認一項有證據的人物經歷'},400);
      const unique=new Set<string>();
      const statements=[env.DB.prepare('DELETE FROM ai_story_facts WHERE trackId=?').bind(id)];
      for(const x of accepted){
        for(const owner of expandedApprovedOwners(x.owner,row.speaker)){
          const key=x.id+':'+owner;
          if(unique.has(key))continue;unique.add(key);
          statements.push(env.DB.prepare('INSERT INTO ai_story_facts(trackId,factId,owner,kind,narrator,segmentId,text,start,sourceRevision) VALUES (?,?,?,?,?,?,?,?,?)')
            .bind(id,x.id,owner,x.kind,x.narrator,x.segmentId,x.summary,Number(x.start)||0,row.revision));
        }
      }
      const approvedDocument={version:1,trackId:id,revision:row.revision,reviewedBy:storyText(user.email),approvedAt:Date.now(),items:accepted};
      await put(env,approvedKey(id),approvedDocument);
      statements.push(env.DB.prepare("UPDATE ai_story_pilots SET status='approved',r2Key=?,reviewer=?,approvedAt=?,error=NULL,updatedAt=? WHERE trackId=? AND status='needs_review' AND revision=?")
        .bind(approvedKey(id),storyText(user.email),Date.now(),Date.now(),id,row.revision));
      await env.DB.batch(statements);
      await markSpeakerBiosDirty(env,id);
      return json({success:true,approved:accepted.length,message:'已確認歸屬，個人摘要將由共用資料更新'});
    }
    if(path==='/api/speaker-stories/reset'&&method==='POST'){
      const b:any=await req.json().catch(()=>null),id=storyText(b?.trackId),row:any=id?await pilot(env,id):null;
      if(!row)return json({error:'非試點錄音'},404);
      await env.DB.batch([
        env.DB.prepare('DELETE FROM ai_story_facts WHERE trackId=?').bind(id),
        env.DB.prepare("UPDATE ai_story_pilots SET status='pending',revision='',cursor=0,r2Key='',error=NULL,reviewer='',approvedAt=0,updatedAt=? WHERE trackId=?").bind(Date.now(),id)
      ]);
      await markSpeakerBiosDirty(env,id);
      return json({success:true,message:'已重置，原始逐字稿完全不受影響'});
    }
    return json({error:'找不到功能'},404);
  }catch(e){
    console.error('story attribution request error',e instanceof Error?e.message:'unknown');
    return json({error:'故事歸屬服務暫時無法使用'},503);
  }
}
