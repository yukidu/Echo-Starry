import { splitSpeakerNames } from './speakers';

export type StoryKind = 'personal' | 'retold' | 'shared' | 'unknown';
export type StoryClaim = {
  id: string;
  segmentId: string;
  owner: string;
  narrator: string;
  kind: StoryKind;
  summary: string;
  evidence: string;
  start: number;
  end: number;
};
export const storyText=(x:unknown)=>String(x??'').trim();
export const STORY_PROMPT_VERSION='story-owner-v1';
export const UNKNOWN_OWNER='unknown';
export const SHARED_OWNER='shared';

export function pilotSourceRevision(updatedAt:unknown,r2Key:unknown,speaker:unknown){
  return [String(updatedAt||0),storyText(r2Key),splitSpeakerNames(speaker).join('&')].join(':');
}
export function pilotReady(p:any,updatedAt:unknown,r2Key:unknown,speaker:unknown){
  return !!p && p.status==='approved' && p.revision===pilotSourceRevision(updatedAt,r2Key,speaker);
}
export function parseStoryClaims(raw:string,segments:any[],speakerField:string):StoryClaim[]{
  const speakers=splitSpeakerNames(speakerField);
  const byId=new Map(segments.map(s=>[storyText(s.id),s]));
  const value=storyText(raw).replace(/^\x60\x60\x60(?:json)?\s*/i,'').replace(/\s*\x60\x60\x60$/,'');
  let items:any[];
  try{
    const parsed=JSON.parse(value);
    items=Array.isArray(parsed)?parsed:Array.isArray(parsed?.claims)?parsed.claims:[];
  }catch{throw Error('AI 故事分析格式不完整，未儲存本次內容');}
  if(items.length>30)throw Error('AI 回傳過多項目，請縮小單次分析範圍');
  const seen=new Set<string>(),out:StoryClaim[]=[];
  for(const x of items){
    const segmentId=storyText(x?.segmentId),s=byId.get(segmentId);
    if(!s)throw Error('AI 提供不存在的逐字稿段落');
    const owner=storyText(x?.owner)||UNKNOWN_OWNER;
    if(owner!==UNKNOWN_OWNER&&owner!==SHARED_OWNER&&!speakers.includes(owner))throw Error('AI 提供不在這場演講名單的人物');
    const narrator=storyText(x?.narrator)||UNKNOWN_OWNER;
    if(narrator!==UNKNOWN_OWNER&&!speakers.includes(narrator))throw Error('AI 提供不存在的說話者');
    const kind=storyText(x?.kind) as StoryKind;
    if(!['personal','retold','shared','unknown'].includes(kind))throw Error('AI 故事種類無效');
    const summary=storyText(x?.summary);
    if(!summary||summary.length>280)throw Error('AI 人物經歷文字不符合限制');
    if((owner===SHARED_OWNER)!==(kind==='shared'))throw Error('共同經歷分類不一致');
    if(kind==='unknown'&&owner!==UNKNOWN_OWNER)throw Error('不確定的故事不可歸屬特定人物');
    const unique=segmentId+':'+owner+':'+summary;
    if(seen.has(unique))continue;
    seen.add(unique);
    out.push({id:'fact-'+crypto.randomUUID(),segmentId,owner,narrator,kind,summary,evidence:storyText(s.text).slice(0,950),start:Number(s.start)||0,end:Number(s.end)||0});
  }
  return out;
}
/** The human-approved ownership is authoritative; the AI draft never is. */
export function expandedApprovedOwners(owner:string,speakerField:string){
  if(owner===UNKNOWN_OWNER)return [];
  const people=splitSpeakerNames(speakerField);
  if(owner===SHARED_OWNER)return people;
  return people.includes(owner)?[owner]:[];
}
export function selectQaSpeaker(question:string,speakerField:string){
  const speakers=splitSpeakerNames(speakerField);
  if(speakers.length<2)return speakers[0]||'';
  const value=storyText(question);
  const matched=speakers.filter(s=>value.startsWith('@'+s+' ')||value.startsWith('＠'+s+' ')||value==='@'+s||value==='＠'+s);
  return matched.length===1?matched[0]:'';
}
export function completeSentence(text:string,maxChars:number){
  const chars=Array.from(storyText(text));
  if(chars.length<=maxChars && /[。！？!?]$/.test(chars.join('')))return chars.join('');
  const capped=chars.slice(0,maxChars).join('');
  const ends=[...capped.matchAll(/[。！？!?]/g)].map(x=>x.index!+1);
  return ends.length?capped.slice(0,ends[ends.length-1]).trim():'';
}
