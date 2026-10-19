import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,UploadCloud,Library,Users,FileText,MessageCircleQuestion,Mic} from 'lucide-react';
import {UploadModal} from './UploadModal';
import {AudioTrackList} from './AudioTrackList';
import {TranscriptQaAdmin} from './TranscriptQaAdmin';
import {AiQuestionSettingsAdmin} from './AiQuestionSettingsAdmin';
import {AiSpeakerAdmin} from './AiSpeakerAdmin';
import type {Track,UserProfile} from '../types';
import '../audioWorkspace.css';

/** Exactly one React navigation owner; all six panels are real siblings. */
export type AudioWorkspaceTab='upload'|'manage'|'community'|'transcript'|'ai-question'|'speaker';
export const AUDIO_WORKSPACE_TABS=[
 {id:'upload',name:'上傳音檔',icon:UploadCloud},
 {id:'manage',name:'管理音檔',icon:Library},
 {id:'community',name:'網友音檔',icon:Users,superOnly:true},
 {id:'transcript',name:'逐字稿',icon:FileText,superOnly:true},
 {id:'ai-question',name:'AI問問題',icon:MessageCircleQuestion,superOnly:true},
 {id:'speaker',name:'AI演講者',icon:Mic,superOnly:true}
] as const;
type Props={
 currentUser:UserProfile|null;isAdmin:boolean;tracks:Track[];
 initialEditTrack?:Track|null;
 onClose:()=>void;
 onSaved:(track:Track,wasEditing:boolean)=>void;
 onEditCancelled?:()=>void;
 onDeleted?:(id:string)=>void;
 onCategoriesUpdated?:(categories?:string[],change?:{oldName:string;newName?:string})=>void;
};
const admin=(user:UserProfile|null)=>Boolean(user&&(user.role==='超級管理員'||user.id==='u-admin'||user.email?.trim().toLowerCase()==='yukidu@gmail.com'));
export const AudioWorkspacePage:React.FC<Props>=({currentUser,isAdmin,tracks,initialEditTrack,onClose,onSaved,onEditCancelled,onDeleted,onCategoriesUpdated})=>{
 const superAdmin=admin(currentUser);
 const [active,setActive]=useState<AudioWorkspaceTab>('upload');
 const [editing,setEditing]=useState<Track|null>(initialEditTrack||null);
 const [dirty,setDirty]=useState(false);
 const editRef=useRef<Track|null>(editing),dirtyRef=useRef(dirty);
 editRef.current=editing;dirtyRef.current=dirty;
 const tabs=useMemo(()=>AUDIO_WORKSPACE_TABS.filter(t=>!('superOnly' in t&&t.superOnly)||superAdmin),[superAdmin]);
 const switchTab=(tab:AudioWorkspaceTab)=>{
   if(editRef.current)return;
   if(tab==='community'||tab==='transcript'||tab==='ai-question'||tab==='speaker'){if(!superAdmin)return;}
   setActive(tab);
   window.requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'auto'}));
 };
 const discard=()=>!dirtyRef.current||window.confirm('目前有尚未儲存的音檔資料，確定放棄變更嗎？');
 const editBack=useCallback(()=>{
   if(!discard())return;
   setEditing(null);editRef.current=null;setDirty(false);onEditCancelled?.();
   setActive('manage');
   if(window.history.state?.audioEditorTrackId)window.history.back();
   window.requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'auto'}));
 },[onEditCancelled]);
 const openEdit=(track:Track)=>{
   setEditing(track);editRef.current=track;setDirty(false);
   window.history.pushState({...window.history.state,audioEditorTrackId:track.id},'',window.location.href);
   window.scrollTo({top:0,behavior:'auto'});
 };
 useEffect(()=>{if(initialEditTrack){setEditing(initialEditTrack);editRef.current=initialEditTrack;setDirty(false);}},[initialEditTrack?.id]);
 useEffect(()=>{
   const onPop=(event:PopStateEvent)=>{
     if(!editRef.current)return;
     if(event.state?.audioEditorTrackId===editRef.current.id)return;
     if(dirtyRef.current&&!window.confirm('音檔編輯尚未儲存，確定返回管理頁面嗎？')){
       window.history.pushState({...window.history.state,audioEditorTrackId:editRef.current.id},'',window.location.href);
       return;
     }
     editRef.current=null;setEditing(null);setDirty(false);onEditCancelled?.();
   };
   window.addEventListener('popstate',onPop);
   return ()=>window.removeEventListener('popstate',onPop);
 },[onEditCancelled]);
 useEffect(()=>{
   const onUnload=(event:BeforeUnloadEvent)=>{
     if(!dirtyRef.current)return;
     event.preventDefault();event.returnValue='';
   };
   window.addEventListener('beforeunload',onUnload);
   return ()=>window.removeEventListener('beforeunload',onUnload);
 },[]);
 const saved=(track:Track,wasEditing:boolean)=>{
   setDirty(false);dirtyRef.current=false;
   onSaved(track,wasEditing);
   if(wasEditing){
     setEditing(null);editRef.current=null;onEditCancelled?.();setActive('manage');
     if(window.history.state?.audioEditorTrackId)window.history.replaceState({...window.history.state,audioEditorTrackId:undefined},'',window.location.href);
   }else{
     // Preserve existing upload behavior: return to the playlist after saving.
     onClose();
   }
 };
 const closeWorkspace=()=>{if(discard())onClose();};
 if(!currentUser)return <section role="alert" className="p-4">請先登入才能使用音檔管理。</section>;
 return <section className="audio-workspace" aria-label="音檔管理獨立頁面">
  {editing?(
   <div data-audio-workspace-page="editor">
    <div className="px-3 py-3 border-b border-slate-600 flex items-center gap-2">
     <button type="button" onClick={editBack} className="rounded-lg border px-3 py-2 inline-flex items-center gap-2"><ArrowLeft size={16}/>返回音檔管理</button>
     <h1 className="font-black text-sm truncate">編輯音檔 · {editing.title}</h1>
    </div>
    <UploadModal key={'edit-'+editing.id} isOpen presentation="page" currentUser={currentUser} isAdmin={isAdmin} trackToEdit={editing} tracks={tracks} onClose={editBack} onDirtyChange={setDirty} onCategoriesUpdated={onCategoriesUpdated} onSuccess={track=>saved(track,true)}/>
   </div>
  ):(
   <div data-audio-workspace-page="index">
    <header className="px-3 py-3 border-b border-slate-700">
     <div className="flex items-center justify-between gap-2">
      <h1 className="text-lg font-black">音檔管理</h1>
      <button type="button" className="border rounded-lg px-3 py-2 text-sm" onClick={closeWorkspace}>返回首頁</button>
     </div>
    </header>
    <div className="audio-workspace-tabs" role="tablist" aria-label="音檔管理六個子分頁">
     {tabs.map(t=><button key={t.id} type="button" role="tab" aria-selected={active===t.id} aria-controls={'audio-workspace-panel-'+t.id} className="audio-workspace-tab" onClick={()=>switchTab(t.id)}>
       <t.icon size={16} aria-hidden="true"/><span>{t.name}</span>
      </button>)}
    </div>
    <div id={'audio-workspace-panel-'+active} role="tabpanel" className="audio-workspace-panel" aria-label={tabs.find(x=>x.id===active)?.name}>
     {active==='upload'&&<UploadModal key="audio-upload-create" isOpen presentation="page" currentUser={currentUser} isAdmin={isAdmin} tracks={tracks} onClose={closeWorkspace} onDirtyChange={setDirty} onCategoriesUpdated={onCategoriesUpdated} onSuccess={track=>saved(track,false)}/>}
     {active==='manage'&&<AudioTrackList key="mine" mode="mine" currentUser={currentUser} onEditTrack={openEdit} onDeleted={onDeleted}/>}
     {superAdmin&&active==='community'&&<AudioTrackList key="community" mode="community" currentUser={currentUser} onEditTrack={openEdit} onDeleted={onDeleted}/>}
     {superAdmin&&active==='transcript'&&<TranscriptQaAdmin/>}
     {superAdmin&&active==='ai-question'&&<AiQuestionSettingsAdmin/>}
     {superAdmin&&active==='speaker'&&<AiSpeakerAdmin/>}
    </div>
   </div>
  )}
 </section>;
};
