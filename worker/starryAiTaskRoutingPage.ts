/**
 * A04-01 responsive admin-only CONTROL PLANE UI.
 * No provider inference and no connection to current app runtime.
 */
export function renderStarryAiTaskRoutingPage():Response {
  const nonce=crypto.randomUUID().replace(/-/g,'');
  const html=`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>各 App AI 模型選型｜Starry ID</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#0d192c;color:#eff5ff;font:15px system-ui,-apple-system,"Noto Sans TC",sans-serif}
main{max-width:1070px;margin:0 auto;padding:16px 13px 70px}h1{font-size:25px;margin:17px 0 5px}h2{font-size:19px;margin:0 0 12px}
p{line-height:1.65}.muted,small{color:#bdcee5}.notice{background:#342d21;color:#f9e4ba;padding:13px;border-left:3px solid #deb86b;border-radius:8px}
.grid{display:grid;grid-template-columns:minmax(270px,1fr) minmax(270px,1fr);gap:15px}.card{padding:17px;background:#172b45;border:1px solid #405875;border-radius:15px;min-width:0}
label{font-weight:650;display:block;margin:12px 0 6px}select{display:block;width:100%;background:#0e1e34;color:#eaf3ff;border:1px solid #7390b2;border-radius:10px;padding:11px;font:inherit}
button{background:#336db1;color:white;border:1px solid #7da9e2;border-radius:10px;padding:11px 14px;font:inherit;cursor:pointer}
button:disabled{opacity:.44;cursor:not-allowed}.row{display:flex;gap:9px;flex-wrap:wrap;align-items:center;margin:12px 0}.row>*{flex:1}
.history{display:block;width:100%;text-align:left;margin:6px 0;background:#273f5e}.badge{display:inline-block;padding:4px 9px;border-radius:12px;background:#30415d;font-size:12px}
#result{white-space:pre-wrap;overflow-wrap:anywhere;min-height:25px;color:#a5ebd6}code{overflow-wrap:anywhere}
@media(max-width:730px){.grid{grid-template-columns:1fr}h1{font-size:22px}.card{padding:14px}}
</style></head><body><main>
<a href="/ai-models">← 返回 AI 模型資料庫</a><h1>各 App／功能獨立 AI 模型選型</h1>
<p class="muted">A04-01：僅管理中央選型草稿。所有變更不會影響繁星回聲問答、Whisper、會員電池或其他 App 的正式模型。</p>
<div class="notice">安全保護：只提供中央資料庫已核准且適用於該功能的模型；目前全部 9 個模型尚未核准，因此暫無可用新選型。實際啟用與付費測試尚未開放。</div>
<div class="grid" style="margin-top:15px">
<section class="card"><h2>1. 獨立選型設定</h2>
<label for="app">應用 App</label><select id="app"><option value="echostars">繁星回聲</option><option value="mirror">繁星心鏡（僅中央設定）</option><option value="starry-id">Starry ID（目前沒有 AI 推理工作）</option></select>
<label for="task">AI 工作功能</label><select id="task"></select>
<p id="count" class="muted"></p>
<label for="primary">主要模型（必選）</label><select id="primary"></select>
<label for="backup0">備援 1（可不選）</label><select id="backup0"></select>
<label for="backup1">備援 2（可不選）</label><select id="backup1"></select>
<label for="backup2">備援 3（可不選）</label><select id="backup2"></select>
<p id="sequence" class="muted"></p>
<div class="row"><button id="preview" type="button">預覽安全檢查</button><button id="save" type="button">儲存中央草稿</button></div>
<p class="muted">只允許 0～3 個不同的備援模型，且不得與主要模型重複。尚未取得費用及模型核准時無法儲存。</p>
</section>
<section class="card"><h2>2. 版本歷史與防覆蓋</h2>
<div id="now" class="muted">正在讀取中央設定...</div>
<h2 style="margin-top:24px">安全還原（僅中央草稿）</h2>
<div id="history" class="muted">請先選擇應用及功能。</div>
<button id="restore" type="button" disabled>確認還原所選版本</button>
<p class="muted">還原前會重新檢查模型是否仍被核准。另一位管理員修改後，本頁的舊版本不能覆蓋他的新設定。</p>
</section></div>
<section class="card" style="margin-top:15px"><h2>操作結果</h2><div id="result" role="status" aria-live="polite"></div></section>
</main><script nonce="${nonce}">
'use strict';
const $=id=>document.getElementById(id);
let data=null,selectedRevision=null,revision=0;
const output=t=>{$('result').textContent=t};
async function api(path,options){
 const r=await fetch(path,{credentials:'same-origin',cache:'no-store',...options});
 const v=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(v.error||'操作失敗（HTTP '+r.status+'）');
 return v;
}
function option(value,label){return new Option(label,value)}
function setupSelect(el,models,primary){
 el.replaceChildren();
 el.add(option('',primary?'尚無已核准且相容的模型':'不設定備援'));
 for(const m of models)el.add(option(m.name+' · '+m.modelId,m.modelId));
 el.disabled=primary&&!models.length;
}
function tasksForApp(){
 const app=$('app').value;
 const list=(data?.tasks||[]).filter(t=>t.appId===app);
 $('task').replaceChildren();
 for(const t of list)$('task').add(option(t.title,t.taskId));
 $('task').disabled=!list.length;
 updateTask();
}
async function updateTask(){
 selectedRevision=null;$('restore').disabled=true;
 const app=$('app').value,task=$('task').value;
 const available=data?.eligibleByTask?.[task]||[];
 for(const id of ['primary','backup0','backup1','backup2'])setupSelect($(id),available,id==='primary');
 const existing=(data?.policies||[]).find(x=>x.appId===app&&x.taskId===task);
 revision=existing?.revision||0;
 if(existing){
  $('primary').value=existing.selection.primary;
  (existing.selection.backups||[]).forEach((x,i)=>{if(i<3)$('backup'+i).value=x});
 }
 $('count').textContent='此功能目前符合中央審核：'+available.length+' 個模型';
 $('now').textContent=existing
  ?'中央草稿版次：'+existing.revision+'；最後更新：'+new Date(existing.updatedAt).toLocaleString('zh-TW')+'；尚未套用到正式 App'
  :'尚未建立獨立選型草稿；現有正式 App 模型完全不變';
 updateSequence();$('history').replaceChildren();
 $('history').textContent=task?'讀取版本紀錄中…':'此 App 沒有需選型的 AI 工作';
 if(!task)return;
 try{
  const response=await api('/api/ai-routing?appId='+encodeURIComponent(app)+'&taskId='+encodeURIComponent(task));
  $('history').replaceChildren();
  for(const h of response.history||[]){
   const b=document.createElement('button');b.type='button';b.className='history';
   b.textContent='版本 '+h.revision+' · '+h.action+' · '+new Date(h.createdAt).toLocaleString('zh-TW');
   b.onclick=()=>{selectedRevision=h;$('restore').disabled=false;output('已選歷史版次 '+h.revision+'；還原時仍須全部模型重新通過審核。')};
   $('history').append(b);
  }
  if(!(response.history||[]).length)$('history').textContent='目前沒有歷史版次';
 }catch(e){output('無法讀取歷史：'+e.message)}
}
function selection(){return {primary:$('primary').value,backups:['backup0','backup1','backup2'].map(x=>$(x).value).filter(Boolean)}}
function updateSequence(){
 const s=selection(),ids=[s.primary,...s.backups].filter(Boolean);
 $('sequence').textContent=ids.length?'順序：'+ids.join(' → '):'無中央已核准可選模型';
 const eligible=(data?.eligibleByTask?.[$('task').value]||[]);
 const valid=!!s.primary&&new Set(ids).size===ids.length&&ids.every(x=>eligible.some(y=>y.modelId===x));
 $('preview').disabled=!valid;$('save').disabled=!valid;
}
async function send(action){
 const payload={appId:$('app').value,taskId:$('task').value,
  selection:selection(),expectedRevision:revision,action};
 const isPreview=action==='preview';
 if(!isPreview&&!confirm('確認儲存中央模型草稿？不會啟用或變更正式 App 模型。'))return;
 try{
  const result=await api(isPreview?'/api/ai-routing/preview':'/api/ai-routing',{
   method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},
   body:JSON.stringify(payload)
  });
  output(isPreview?'審核通過，僅為安全預覽；不會花費 AI 額度':result.message+'；版次 '+result.revision);
  if(!isPreview)await reload(payload.appId,payload.taskId);
 }catch(e){output(e.message)}
}
async function reload(app,task){
 data=await api('/api/ai-routing');
 if(app)$('app').value=app;
 tasksForApp();
 if(task&&Array.from($('task').options).some(o=>o.value===task)){$('task').value=task;await updateTask()}
}
$('app').onchange=tasksForApp;
$('task').onchange=updateTask;
for(const id of ['primary','backup0','backup1','backup2'])$(id).onchange=updateSequence;
$('preview').onclick=()=>send('preview');
$('save').onclick=()=>send('save');
$('restore').onclick=async()=>{
 if(!selectedRevision||!confirm('確定只還原中央選型草稿？所有歷史模型將再次審核，正式 App 不會改變。'))return;
 try{
  const r=await api('/api/ai-routing',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({action:'restore',appId:$('app').value,taskId:$('task').value,
    expectedRevision:revision,revisionId:selectedRevision.id})});
  output(r.message+'；新版本 '+r.revision);
  await reload(r.appId,r.taskId);
 }catch(e){output(e.message)}
};
reload().catch(e=>output('無法載入中央模型設定：'+e.message));
</script></body></html>`;
  return new Response(html,{headers:{
    'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','X-Robots-Tag':'noindex, nofollow, noarchive',
    'Content-Security-Policy':`default-src 'none';script-src 'nonce-${nonce}';style-src 'unsafe-inline';connect-src 'self';base-uri 'none';form-action 'none';frame-ancestors 'none'`
  }});
}
