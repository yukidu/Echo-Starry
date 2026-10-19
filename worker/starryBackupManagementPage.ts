import { BACKUP_RESOURCES } from './starryBackupPolicy';
export function renderStarryBackupManagementPage(): Response {
  const nonce=crypto.randomUUID().replace(/-/g,'');
  const safeResources=JSON.stringify(BACKUP_RESOURCES).replace(/</g,'\\u003c');
  const html=`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>自動備份管理｜Starry ID</title><style>
*{box-sizing:border-box}body{margin:0;background:#0c1829;color:#eef3ff;font:15px system-ui,-apple-system,"Noto Sans TC",sans-serif}
main{max-width:1050px;margin:auto;padding:18px 15px 70px}a{color:#a9cfff}h1{font-size:25px}
p{line-height:1.65}.muted,small{color:#b8cce5}.stats{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}
.stat{flex:1;min-width:150px;padding:14px;background:#1c3450;border-radius:12px}.stat b{display:block;font-size:20px;margin-top:5px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.panel{background:#15283f;border:1px solid #456080;border-radius:15px;padding:16px;min-width:0}
.field{display:grid;gap:7px;margin:13px 0}select,button{font:inherit;min-height:45px;border:1px solid #6683a2;color:#fff;background:#234061;border-radius:9px;padding:9px}
select{width:100%}button{cursor:pointer}button:disabled{opacity:.5;cursor:not-allowed}.primary{width:100%;background:#3264a8}
.radio{display:flex;gap:8px;flex-wrap:wrap}.radio label{padding:10px;background:#243f60;border-radius:10px}
.radio input{accent-color:#a8ccff}.notice{padding:12px;background:#382e25;color:#ffe6bc;border-radius:11px}
.safe{padding:12px;background:#203b40;border:1px solid #497c76;border-radius:11px}
table{width:100%;border-collapse:collapse}td,th{text-align:left;font-size:13px;padding:10px 5px;border-bottom:1px solid #3a526b}
#status{min-height:36px}button:focus-visible,select:focus-visible,input:focus-visible{outline:3px solid #aacdff}
@media(max-width:720px){.grid{grid-template-columns:1fr}h1{font-size:22px}}
</style></head><body><main><a href="/">← 返回 Starry ID</a><h1>🛡️ 自動備份管理</h1>
<p class="muted">中央AI7｜I31–I32。管理各 App 的 D1/R2 備份草稿、狀態與還原檢查。<b>尚未啟動正式備份。</b></p>
<div class="stats"><div class="stat"><small>唯讀盤點</small><b>9 個 D1／3 個 R2</b></div>
<div class="stat"><small>排程</small><b>未啟用</b></div><div class="stat"><small>正式還原</small><b>已鎖定</b></div></div>
<div class="grid"><section class="panel"><h2>備份設定草稿</h2>
<div class="field"><label for="kind">類型</label><select id="kind"><option value="d1">D1 資料庫</option><option value="r2">R2 音檔／檔案</option></select></div>
<div class="field"><label for="resource">選擇來源 App／資源</label><select id="resource"></select></div>
<div class="field"><span>備份週期</span><div id="cycle" class="radio" role="group" aria-label="備份週期"></div></div>
<div class="field"><span>備份保存天數</span><div id="retention" class="radio" role="group" aria-label="保存天數"></div></div>
<p class="muted">D1 Time Travel 是 Cloudflare 官方功能（Free 7 天、Paid 30 天），不能修改官方保存視窗。本頁設定的是未來自行保管的備份期限。</p>
<div class="notice" id="summary">尚未載入草稿；儲存不會執行備份。</div>
<p><button id="save" class="primary" type="button">儲存設定草稿（不啟動備份）</button></p>
<p id="status" role="status" aria-live="polite" class="muted">正在讀取管理設定…</p>
</section><section class="panel"><h2>備份紀錄與安全還原</h2>
<div class="safe"><b>正式會員與音檔安全</b><p>本批不讀取、複製、覆蓋、刪除正式資料。正式還原必須另行授權。</p></div>
<table><tbody><tr><th scope="row">最後備份</th><td id="last">尚無可驗證紀錄</td></tr>
<tr><th scope="row">儲存位置</th><td id="where">尚未建立</td></tr>
<tr><th scope="row">大小／筆數</th><td id="size">待記錄</td></tr>
<tr><th scope="row">完整性</th><td id="verified">尚未測試</td></tr>
<tr><th scope="row">隔離還原測試</th><td id="restore">尚未測試</td></tr></tbody></table>
<p class="notice">R2 未來採首次完整／後續差異備份，正式原檔與備份隔離，不可直接清理有依賴的版本鏈。</p>
<button type="button" disabled>🔒 正式覆蓋還原（禁止）</button>
<h2>設定版本歷史</h2><div id="history" class="muted">尚無歷史紀錄</div></section></div>
<p class="muted">費用及實際容量待核對，不承諾全部免費；未經批准不會啟用任何收費資源。</p>
</main><script nonce="${nonce}">
'use strict';
const R=${safeResources};
const $=id=>document.getElementById(id),state={policies:[],history:[],backups:[]};
const make=(tag,t)=>{const el=document.createElement(tag);el.textContent=t;return el;};
const resource=()=>R.find(r=>r.id===$('resource').value);
const saved=()=>state.policies.find(p=>p.resourceId===resource()?.id);
const chosen=n=>Number(document.querySelector('input[name="'+n+'"]:checked')?.value);
function radios(id,name,values,active){const host=$(id);host.replaceChildren();
 values.forEach(v=>{const l=make('label',''),x=document.createElement('input');x.type='radio';x.name=name;x.value=String(v);x.checked=v===active;
 x.addEventListener('change',summary);l.append(x,document.createTextNode(v+' 天'));host.append(l);});}
function summary(){$('summary').textContent='草稿：'+resource().name+'，每 '+chosen('cycle')+' 天一次，保存 '+chosen('retention')+' 天。尚未啟用任何備份排程。';}
function selected(){const r=resource(),p=saved();
 radios('cycle','cycle',[1,3,7],p?.intervalDays??(r.kind==='d1'?1:7));
 radios('retention','retention',[7,30,90],p?.retentionDays??30);summary();
 const last=state.backups.find(x=>x.resourceId===r.id);
 $('last').textContent=last?.startedAt?new Date(last.startedAt).toLocaleString('zh-TW')+'｜'+last.status:'尚無可驗證紀錄';
 $('where').textContent=last?.storageLabel||'尚未建立';
 $('size').textContent=last?String(last.byteCount??'待查')+' bytes / '+String(last.objectCount??'待查')+' 筆／檔':'待記錄';
 $('verified').textContent=last?.integrityStatus||'尚未測試';
 $('restore').textContent=last?.restoreTestStatus||'尚未測試';
 const h=$('history');h.replaceChildren();
 const items=state.history.filter(x=>x.resourceId===r.id).slice(0,8);
 if(!items.length){h.textContent='尚無設定版本';return;}
 items.forEach(x=>h.append(make('p','版本 '+x.revision+'｜'+new Date(x.at).toLocaleString('zh-TW')+'｜'+x.after.intervalDays+'／'+x.after.retentionDays+' 天')));
}
function typeChanged(){$('resource').replaceChildren();
 R.filter(x=>x.kind===$('kind').value).forEach(r=>{const opt=make('option',r.app+'｜'+r.name+(r.isPreview?'（預覽）':''));opt.value=r.id;$('resource').append(opt);});selected();}
async function load(){try{const res=await fetch('/api/admin/backups',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
 if(!res.ok)throw Error('HTTP '+res.status);const d=await res.json();state.policies=d.policies||[];state.history=d.history||[];state.backups=d.backups||[];
 $('status').textContent='已讀取中央草稿；自動備份與正式還原仍未啟用。';selected();
 }catch(e){$('status').textContent='草稿目前無法讀取，請確認測試資料庫已套用專屬 migration。'+String(e.message||e);}}
async function save(){$('save').disabled=true;$('status').textContent='正在驗證草稿…';
 const draft={resourceId:resource().id,intervalDays:chosen('cycle'),retentionDays:chosen('retention')};
 try{const opts={method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'}};
 const p=await fetch('/api/admin/backups/preview',{...opts,body:JSON.stringify(draft)});
 if(!p.ok)throw Error('草稿格式驗證失敗');
 const res=await fetch('/api/admin/backups',{...opts,body:JSON.stringify({action:'stage',draft,expectedRevision:saved()?.revision||0})});
 if(!res.ok){const e=await res.json().catch(()=>({}));throw Error(e.error||'HTTP '+res.status);}
 await load();$('status').textContent='草稿已儲存，沒有進行正式備份。';
 }catch(e){$('status').textContent='儲存未成功：'+String(e.message||e)+'，請更新頁面核對版本。';
 }finally{$('save').disabled=false;}}
$('kind').addEventListener('change',typeChanged);$('resource').addEventListener('change',selected);
$('save').addEventListener('click',save);typeChanged();load();
</script></body></html>`;
  return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','X-Robots-Tag':'noindex, nofollow, noarchive','Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`}});
}
