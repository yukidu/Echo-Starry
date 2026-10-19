/**
 * A02/A05: private Starry ID model administration UI.
 * Never reads secrets; never invokes provider model APIs; CSP nonce only.
 */
export function renderStarryAiModelAdminPage():Response {
  const nonce=crypto.randomUUID().replace(/-/g,'');
  const html=`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>安全新增模型與還原｜Starry ID</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#0b172a;color:#edf4ff;font:15px system-ui,"Noto Sans TC",sans-serif}
main{max-width:990px;margin:auto;padding:18px 14px 65px}h1{font-size:25px}h2{font-size:19px}
a{color:#acd0ff}p{line-height:1.65}.muted{color:#b9cbe5}
.panel{padding:17px;border-radius:15px;border:1px solid #3a5373;background:#162840;margin:14px 0}
.field{display:grid;gap:6px;margin:12px 0}label{font-weight:600}input,select{width:100%;padding:11px;background:#0d1b30;color:#eef4ff;border:1px solid #617b9a;border-radius:10px;font:inherit}
button{border:1px solid #7083a8;background:#275da0;color:white;padding:11px 14px;border-radius:10px;font:inherit;cursor:pointer}
button:hover{filter:brightness(1.08)}button:disabled{opacity:.42;cursor:not-allowed}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.row>*{flex:1;min-width:150px}
.secondary{background:#243b55}.danger{background:#743535}.notice{padding:10px;border-left:3px solid #b59b55;background:#302c21}
#log{white-space:pre-wrap;overflow-wrap:anywhere;color:#9ee4d3;min-height:24px}
.revision{width:100%;text-align:left;margin:5px 0;background:#243c60}
small{color:#bbcee8}code{overflow-wrap:anywhere}fieldset{border:0;padding:0;margin:0}
@media(min-width:690px){.cols{display:grid;grid-template-columns:1.1fr 1fr;gap:15px}}
</style></head><body><main>
<a href="/ai-models">← 返回 AI 模型資料庫</a><h1>安全新增模型與版本管理</h1>
<p class="muted">A02 / A05：這裡只管理中央模型目錄；不會改動繁星回聲的正式問答模型或執行付費 AI 測試。</p>
<p class="notice">安全規則：模型新增後一律「未驗證」。真實 AI 測試、付費呼叫、正式啟用皆維持鎖定；API 金鑰只能在 Cloudflare 安全環境配置，請勿貼到本頁。</p>
<div class="cols"><section class="panel"><h2>1. 新增／修改模型資料</h2>
<div class="field"><label for="pick">選擇操作</label><select id="pick"><option value="">＋ 新增模型</option></select></div>
<form id="form">
<div class="field"><label for="modelId">精確 Model ID</label><input id="modelId" required minlength="2" maxlength="200" placeholder="@cf/provider/model"></div>
<div class="field"><label for="name">顯示名稱</label><input id="name" required minlength="2" maxlength="120"></div>
<div class="field"><label for="provider">AI 供應商</label><select id="provider">
<option>Cloudflare Workers AI</option><option>OpenAI</option><option>Anthropic</option><option>Google AI</option><option>其他</option></select></div>
<div class="field"><label for="version">模型版本（選填）</label><input id="version" maxlength="120"></div>
<div class="field"><label for="routeKind">預計連線方式（僅目錄資訊）</label>
<select id="routeKind"><option value="unverified">未驗證</option><option value="workers_ai">Cloudflare Workers AI</option><option value="direct">直接連線</option><option value="gateway">Gateway（尚未啟用）</option></select></div>
<div class="field"><label for="capabilities">模型能力（逗號分隔，不超過12項）</label><input id="capabilities" placeholder="文字問答,摘要" maxlength="650"></div>
<div class="field"><label for="tasks">適用工作（可多選）</label>
<select id="tasks" multiple size="5">
<option value="mirror.reading">繁星心鏡｜AI 解籤</option><option value="echo.qa">繁星回聲｜AI 問答</option>
<option value="echo.bio">繁星回聲｜演講者摘要</option><option value="echo.transcribe">繁星回聲｜逐字稿</option>
<option value="echo.normalize">繁星回聲｜逐字稿校正</option></select>
<small>電腦按 Ctrl／Command 可選多項；手機可依裝置方式多選。</small></div>
<div class="field"><label for="secretBinding">金鑰來源（只記錄名稱，不儲存金鑰）</label>
<select id="secretBinding"><option value="none">未指定／不需金鑰</option><option value="OPENAI_API_KEY">既有 Cloudflare OPENAI_API_KEY（僅 OpenAI）</option></select></div>
<p id="secretNote" class="muted">只顯示金鑰綁定狀態，無法查看內容。</p>
<div class="row"><button class="secondary" id="validate" type="button">免費格式預檢</button><button id="save" type="submit">儲存未驗證資料</button></div>
</form>
<p id="modelStatus" class="muted">正式啟用功能鎖定，須後續取得獨立授權。</p>
<button class="danger" id="disable" type="button" disabled>停用選取模型</button>
</section>
<section class="panel"><h2>2. 歷史版本與安全還原</h2>
<p class="muted">每次成功修改都記錄是誰、何時、修改前後。還原只還原目錄資料，不會自動啟用模型；停用狀態不可被舊版解除。</p>
<div id="history">選取模型後顯示歷史紀錄。</div>
<p id="restoreNotice" class="notice">請先點選歷史版本查看變更。</p>
<button class="secondary" id="restore" type="button" disabled>確認還原所選版本</button>
<p class="muted">還原前會再次核對最新版本；若其他管理員已修改，還原將被拒絕。</p>
</section></div>
<section class="panel"><h2>操作結果</h2><div id="log" role="status" aria-live="polite"></div></section>
</main><script nonce="${nonce}">
'use strict';
const by=id=>document.getElementById(id);
let models=[],active=null,chosenRevision=null;
const display=(txt)=>{by('log').textContent=txt;};
const tasks=()=>Array.from(by('tasks').selectedOptions).map(o=>o.value);
const draft=()=>({modelId:by('modelId').value.trim(),name:by('name').value.trim(),
  provider:by('provider').value,version:by('version').value.trim(),
  routeKind:by('routeKind').value,capabilities:by('capabilities').value.split(',').map(x=>x.trim()).filter(Boolean),
  tasks:tasks(),secretBinding:by('secretBinding').value});
async function request(url,options){
 const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(data.error||'操作失敗（HTTP '+r.status+'）');
 return data;
}
async function refresh(selectId){
 const data=await request('/api/ai-models');
 models=data.models||[];
 by('pick').replaceChildren(new Option('＋ 新增模型',''));
 for(const m of models)by('pick').add(new Option(m.name+' · '+m.modelId,m.modelId));
 by('pick').value=selectId&&models.some(x=>x.modelId===selectId)?selectId:'';
 await select();
}
async function select(){
 const id=by('pick').value;
 active=models.find(m=>m.modelId===id)||null;chosenRevision=null;
 by('modelId').value=active?.modelId||'';
 by('modelId').readOnly=!!active;
 by('name').value=active?.name||'';
 by('provider').value=active?.provider||'Cloudflare Workers AI';
 by('version').value=active?.version||'';
 by('routeKind').value=active?.routeKind||'unverified';
 by('capabilities').value=(active?.capabilities||[]).join(',');
 Array.from(by('tasks').options).forEach(o=>o.selected=Boolean(active?.tasks?.includes(o.value)));
 by('disable').disabled=!active||active.registryStatus==='disabled';
 by('save').textContent=active?'儲存修改（保持未驗證）':'建立未驗證模型';
 by('modelStatus').textContent=active?'目錄狀態：'+active.registryStatus+'；版本：'+active.updatedAt:'尚未建立；無法啟用';
 by('restore').disabled=true;by('restoreNotice').textContent='請先選取一筆歷史版本。';
 by('history').replaceChildren();
 by('secretBinding').value='none';
 by('secretNote').textContent='不存金鑰內容；不能透過此頁上傳金鑰。';
 if(active){
  try {
   const [h,k]=await Promise.all([
    request('/api/ai-model-admin?modelId='+encodeURIComponent(id)),
    request('/api/ai-model-admin?secretFor='+encodeURIComponent(id))
   ]);
   by('secretBinding').value=k.binding||'none';
   by('secretNote').textContent=k.binding==='none'?'尚未指定金鑰來源':(k.configured?'已找到既有 Worker 綁定':'Worker 綁定不存在或無法使用')+'（未執行 AI 測試）';
   for(const v of h.revisions||[]){
    const b=document.createElement('button');
    b.className='revision';b.type='button';b.textContent=new Date(v.createdAt).toLocaleString('zh-TW')+' · '+v.action+' · '+v.id;
    b.onclick=()=>{chosenRevision=v;by('restoreNotice').textContent='選擇：'+v.id+'。還原後仍保持未驗證，已停用模型不會復活。';by('restore').disabled=false};
    by('history').append(b);
   }
  }catch(e){display(String(e.message||e));}
 }
}
async function mutate(body){
 display('正在安全處理…');
 try{
  const r=await request('/api/ai-model-admin',{method:'POST',
   headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(body)});
  display((r.message||'格式檢查完成')+(r.revisionId?' · 稽核版本：'+r.revisionId:''));
  await refresh(r.modelId||body.modelId);
 }catch(e){display(String(e.message||e));}
}
by('validate').onclick=async()=>{
 try{const d=await request('/api/ai-model-admin/dry-run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft())});
 display('免費預檢完成：'+d.reason);
 }catch(e){display(String(e.message||e));}
};
by('form').onsubmit=e=>{e.preventDefault();
 const d=draft();mutate({...d,action:active?'update':'create',expectedUpdatedAt:active?.updatedAt});};
by('disable').onclick=()=>{if(active&&confirm('確認停用模型 '+active.modelId+'？此操作無法透過舊版還原重新啟用。'))mutate({action:'disable',modelId:active.modelId,expectedUpdatedAt:active.updatedAt})};
by('restore').onclick=()=>{if(active&&chosenRevision&&confirm('僅還原目錄資料，並保持目前停用保護。確認要執行？'))mutate({
 action:'restore',modelId:active.modelId,expectedUpdatedAt:active.updatedAt,revisionId:chosenRevision.id})};
by('pick').onchange=()=>select();
refresh().catch(e=>display(String(e.message||e)));
</script></body></html>`;
 return new Response(html,{headers:{
  'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store',
  'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','X-Robots-Tag':'noindex, nofollow, noarchive',
  'Content-Security-Policy':`default-src 'none';script-src 'nonce-${nonce}';style-src 'unsafe-inline';connect-src 'self';base-uri 'none';form-action 'none';frame-ancestors 'none'`
 }});
}
