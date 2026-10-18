import { normalizeSpeakerName, splitSpeakerNames } from '../shared/speakers';
import { resolveSpeakerBiographyStatus } from '../shared/speakerBiographyStatus';
import { actor, isSuper, mayUseTranscript } from './aiSpeakerQaRouter';
import { pilotReady } from '../shared/storyAttribution';
export type SpeakerEnv={DB:any;AI?:any;R2_BUCKET?:any;[key:string]:any};
export const speakerText=(v:any)=>String(v??'').trim();
export const speakerKey=(name:string)=>normalizeSpeakerName(name).replace(/\s+/g,'').toLocaleLowerCase('zh-Hant');
const result=(v:any,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store'}});
export const publiclyReadable=(r:any)=>!Number(r.isPrivateVip)&&!Number(r.authorizedOnlyVisible)&&!Number(r.stickerUnlockCost)&&(!speakerText(r.requiredRank)||['無','公開'].includes(speakerText(r.requiredRank)))&&(!r.storyPilotStatus||pilotReady({status:r.storyPilotStatus,revision:r.storyPilotRevision},r.updatedAt,r.r2Key,r.speaker));
export async function getSpeakerProfile(env:SpeakerEnv,name:string,create=true){
  name=normalizeSpeakerName(name);
  if(!name||name.length>100)return null;
  const key=speakerKey(name);
  let row:any=await env.DB.prepare('SELECT * FROM ai_speaker_profiles WHERE nameKey=?').bind(key).first();
  if(!row&&create){
    await env.DB.prepare("INSERT OR IGNORE INTO ai_speaker_profiles(id,nameKey,displayName,bioStatus,updatedAt) VALUES (?,?,?,'pending',?)")
      .bind('sp-'+crypto.randomUUID(),key,name,Date.now()).run();
    row=await env.DB.prepare('SELECT * FROM ai_speaker_profiles WHERE nameKey=?').bind(key).first();
  }
  return row;
}
export async function publicSpeakerSources(env:SpeakerEnv,name:string){
  const rows=await env.DB.prepare("SELECT t.id,t.title,t.speaker,t.speakerRank,t.requiredRank,t.isPrivateVip,t.authorizedOnlyVisible,t.stickerUnlockCost,i.r2Key,i.updatedAt,p.status AS storyPilotStatus,p.revision AS storyPilotRevision,p.approvedAt AS storyPilotApprovedAt FROM track_speakers ts JOIN tracks t ON t.id=ts.trackId JOIN transcript_index i ON i.trackId=t.id AND i.status='ready' AND i.r2Key IS NOT NULL LEFT JOIN ai_story_pilots p ON p.trackId=t.id WHERE ts.speakerName=? ORDER BY i.updatedAt DESC LIMIT 120").bind(name).all();
  const sources=(rows.results||[]).filter(publiclyReadable);
  const revision=sources.map((r:any)=>r.id+':'+r.updatedAt+(r.storyPilotStatus?':reviewed:'+r.storyPilotApprovedAt+':'+r.storyPilotRevision:'')).sort().join('|');
  return {sources,revision};
}
export async function speakerNeedsStoryReview(env:SpeakerEnv,name:string){
  const rows=await env.DB.prepare("SELECT p.status,p.revision,t.speaker,i.updatedAt,i.r2Key FROM ai_story_pilots p JOIN tracks t ON t.id=p.trackId JOIN track_speakers ts ON ts.trackId=t.id LEFT JOIN transcript_index i ON i.trackId=t.id WHERE ts.speakerName=? LIMIT 10").bind(name).all();
  return (rows.results||[]).some((r:any)=>!pilotReady(r,r.updatedAt,r.r2Key,r.speaker));
}
export async function markSpeakerBiosDirty(env:SpeakerEnv,trackId:string){
  const row:any=await env.DB.prepare('SELECT speaker FROM tracks WHERE id=? LIMIT 1').bind(trackId).first();
  for(const name of splitSpeakerNames(row?.speaker)){
    const p=await getSpeakerProfile(env,name,true);
    if(p)await env.DB.prepare("UPDATE ai_speaker_profiles SET bioStatus='pending',error=NULL,updatedAt=? WHERE id=?")
      .bind(Date.now(),p.id).run();
  }
}
export async function speakerSummaryOptions(env:SpeakerEnv){
  const r=await env.DB.prepare('SELECT key,value FROM ai_speaker_summary_settings').all();
  const map=new Map<string,string>((r.results||[]).map((r:any)=>[speakerText(r.key),speakerText(r.value)]));
  return {
    keywords:map.get('keywords')||'',
    direction:map.get('direction')||'只根據演講逐字稿整理客觀人物摘要',
    maxChars:Math.max(50,Math.min(3000,Number(map.get('maxChars')||500)))
  };
}
export async function handleSpeakerProfileRequest(req:Request,env:SpeakerEnv):Promise<Response|null>{
  const url=new URL(req.url),path=url.pathname,method=req.method.toUpperCase();
  if(!path.startsWith('/api/speaker-profiles/'))return null;
  try{
    const u=await actor(req,env).catch(()=>null);
    if(path==='/api/speaker-profiles/view'&&method==='GET'){
      const name=normalizeSpeakerName(url.searchParams.get('name')||'');
      if(!name||name.length>100)return result({error:'請指定演講者'},400);
      const sample=await env.DB.prepare('SELECT trackId FROM track_speakers WHERE speakerName=? LIMIT 1').bind(name).first();
      if(!sample)return result({error:'沒有這位演講者的錄音'},404);
      const p=await getSpeakerProfile(env,name,true);
      const offset=Math.min(5000,Math.max(0,Number(url.searchParams.get('offset')||0)||0));
      const data=await env.DB.prepare("SELECT t.* FROM track_speakers ts JOIN tracks t ON t.id=ts.trackId WHERE ts.speakerName=? ORDER BY t.uploadDate DESC,t.id LIMIT 60 OFFSET ?").bind(name,offset).all();
      const tracks=[];
      for(const track of data.results||[]){
        if(await mayUseTranscript(env,u,track))tracks.push({id:track.id,title:track.title,speakerRank:track.speakerRank,speakerAvatar:track.speakerAvatar,uploadDate:track.uploadDate,requiredRank:track.requiredRank,durationSeconds:track.durationSeconds});
      }
      const replyOffset=Math.min(5000,Math.max(0,Number(url.searchParams.get('replyOffset')||0)||0));
      const q=offset===0?await env.DB.prepare("SELECT a.id AS answerId,a.content AS answer,a.trackId,a.createdAt,q.id AS questionId,q.content AS question,q.authorName AS asker,t.title,t.speakerRank,t.requiredRank,t.isPrivateVip,t.authorizedOnlyVisible,t.stickerUnlockCost FROM track_speakers ts JOIN tracks t ON t.id=ts.trackId JOIN comments a ON a.trackId=t.id AND a.authorBadge='AI_SPEAKER' AND a.id LIKE 'qa-%' JOIN comments q ON q.id=a.replyToId WHERE ts.speakerName=? ORDER BY a.createdAt DESC LIMIT 40 OFFSET ?").bind(name,replyOffset).all():{results:[]};
      const replies=[];
      for(const item of q.results||[]){
        if(await mayUseTranscript(env,u,item))replies.push({answerId:item.answerId,questionId:item.questionId,trackId:item.trackId,title:item.title,rank:item.speakerRank,asker:item.asker,question:item.question,answer:item.answer,createdAt:item.createdAt});
      }
      const needsReview=await speakerNeedsStoryReview(env,name);
      const safeBio=needsReview?'':speakerText(p.biography);
      const safeStatus=needsReview?'review_required':resolveSpeakerBiographyStatus(p.bioStatus,!!safeBio);
      return result({speaker:{id:p.id,name:p.displayName,avatar:tracks.find(x=>x.speakerAvatar)?.speakerAvatar||'',biography:safeBio,bioStatus:safeStatus,bioUpdatedAt:safeBio?p.bioUpdatedAt||0:0},tracks,hasMore:(data.results||[]).length===60,nextOffset:offset+60,replies,hasMoreReplies:(q.results||[]).length===40,nextReplyOffset:replyOffset+40});
    }
    if(!isSuper(u))return result({error:'只有超級管理員可以設定演講者摘要'},403);
    if(path==='/api/speaker-profiles/admin'&&method==='GET'){
      const names=await env.DB.prepare('SELECT speakerName AS name,COUNT(*) AS recordings FROM track_speakers GROUP BY speakerName ORDER BY speakerName LIMIT 500').all();
      const profiles=await env.DB.prepare("SELECT id,displayName,bioStatus,bioUpdatedAt,error, CASE WHEN length(trim(COALESCE(biography,'')))>0 THEN 1 ELSE 0 END AS hasBiography FROM ai_speaker_profiles ORDER BY displayName LIMIT 500").all();
      const underReview=await env.DB.prepare('SELECT DISTINCT ts.speakerName FROM ai_story_pilots p JOIN tracks t ON t.id=p.trackId JOIN track_speakers ts ON ts.trackId=t.id LEFT JOIN transcript_index i ON i.trackId=t.id').all();
      const namesWithReview=new Set<string>();
      for(const x of underReview.results||[]){if(await speakerNeedsStoryReview(env,x.speakerName))namesWithReview.add(x.speakerName);}
      const safeProfiles=(profiles.results||[]).map(({hasBiography,...profile}:any)=>({
        ...profile,
        bioStatus:namesWithReview.has(profile.displayName)?'review_required':resolveSpeakerBiographyStatus(profile.bioStatus,Boolean(hasBiography)),
        bioUpdatedAt:hasBiography?profile.bioUpdatedAt:0
      }));
      return result({speakers:names.results||[],profiles:safeProfiles,settings:await speakerSummaryOptions(env)});
    }
    if(path==='/api/speaker-profiles/settings'&&method==='PUT'){
      const b:any=await req.json().catch(()=>null);
      const maxChars=Number(b?.maxChars);
      // Ignore dailyLimit from an older cached client; the daily cap has been retired.
      if(!b||!Number.isInteger(maxChars)||maxChars<50||maxChars>3000||speakerText(b.keywords).length>800||speakerText(b.direction).length>1200)return result({error:'摘要字數限50～3000字'},400);
      await env.DB.batch([
        env.DB.prepare("INSERT INTO ai_speaker_summary_settings(key,value) VALUES ('keywords',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(speakerText(b.keywords)),
        env.DB.prepare("INSERT INTO ai_speaker_summary_settings(key,value) VALUES ('direction',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(speakerText(b.direction)),
        env.DB.prepare("INSERT INTO ai_speaker_summary_settings(key,value) VALUES ('maxChars',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(maxChars))
      ]);
      return result({success:true});
    }
    if(path==='/api/speaker-profiles/refresh'&&method==='POST'){
      const b:any=await req.json().catch(()=>null),name=normalizeSpeakerName(b?.name||'');
      if(!name||name.length>100)return result({error:'請選擇演講者'},400);
      const exists=await env.DB.prepare('SELECT trackId FROM track_speakers WHERE speakerName=? LIMIT 1').bind(name).first();
      if(!exists)return result({error:'找不到演講者'},404);
      const p=await getSpeakerProfile(env,name,true);
      const {sources}=await publicSpeakerSources(env,name);
      if(await speakerNeedsStoryReview(env,name))return result({success:false,error:'相關多人演講仍需管理員確認故事歸屬'},409);
      if(!sources.length){
        await env.DB.prepare("UPDATE ai_speaker_profiles SET biography='',bioStatus='waiting_sources',bioUpdatedAt=0,sourceRevision='',error=NULL,updatedAt=? WHERE id=?").bind(Date.now(),p.id).run();
        return result({success:true,status:'waiting_sources',message:'目前沒有可使用的公開逐字稿，不會執行 AI 摘要'});
      }
      await env.DB.prepare("UPDATE ai_speaker_profiles SET bioStatus='pending',sourceRevision='',error=NULL,updatedAt=? WHERE id=?").bind(Date.now(),p.id).run();
      return result({success:true,message:'已排入摘要更新，系統將依序處理'});
    }
    return result({error:'找不到功能'},404);
  }catch(e){
    console.error('speaker profile error',e instanceof Error?e.message:'unknown');
    return result({error:'演講者資料暫時無法使用'},503);
  }
}
