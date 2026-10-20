/** B07-01 administrator-only control page; zero external AI calls; preview demo isolated from ledger. */
export function renderStarryAiB07BudgetPage():Response{
 const nonce=crypto.randomUUID().replace(/-/g,'');
 const html=`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>B07 費用安全中心｜Starry ID</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#0c182c;color:#eff5ff;font:15px system-ui,"Noto Sans TC",sans-serif}
main{max-width:1020px;margin:auto;padding:18px 14px 65px}a{color:#b7d9ff}
h1{font-size:24px;margin:16px 0 6px}h2{font-size:19px}p{line-height:1.6}.small,small{color:#bdcee7;font-size:13px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.panel{background:#152840;border:1px solid #435c78;padding:16px;border-radius:15px;margin:13px 0}
.flag{padding:11px;background:#362d21;color:#fce3ac;border-left:3px solid #ffc773;border-radius:8px}
label{display:block;margin:12px 0 6px;font-weight:650}select,input{display:block;width:100%;font:inherit;border:1px solid #7991ae;border-radius:9px;background:#0d1c31;color:#f0f7ff;padding:10px}
button{font:inherit;border-radius:10px;border:1px solid #7ea4d4;background:#255996;color:white;padding:10px 14px;cursor:pointer}
button:disabled{opacity:.45;cursor:not-allowed}.row{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.row>*{flex:1}
.metric{padding:12px;border-radius:11px;background:#203651}.metric b{display:block;font-size:22px;margin-top:6px}
#message{white-space:pre-wrap;overflow-wrap:anywhere;color:#b0f0d6;min-height:25px}
.item{display:block;width:100%;margin:5px 0;text-align:left;background:#234262}
@media(max-width:700px){.grid{grid-template-columns:1fr}h1{font-size:22px}}
</style></head><body><main><a href="/ai-models">← 返回 AI 模型資料庫</a>
<h1>AI 雙重費用安全中心</h1><p class="small">B07-01｜中央預算控制草稿。暫未接入其他 App 的真正 AI 呼叫。</p>
<p class="flag">零付費預設：所有新增模型未驗證時，禁止任何新推理。真正平台帳單需以 Cloudflare／供應商為準。這頁的 B07 帳本不包含舊版繁星回聲已發生的 AI 消費。</p>
<section class="panel"><h2>真實 B07 帳本（非模擬）</h2>
<div class="grid"><div class="metric">已結算<b id="settled">—</b></div><div class="metric">預留中（含待對帳）<b id="held">—</b></div></div>
<p id="ledgerNote" class="small">載入中央新帳本中…</p></section>
<div class="grid">
<section class="panel"><h2>各層每日預算設定</h2>
<label for="scope">保護範圍</label><select id="scope"></select>
<label for="enabled">緊急保護開關</label><select id="enabled"><option value="on">允許符合條件的請求</option><option value="off">停止此範圍的新請求</option></select>
<label for="calls">每天最多 AI 呼叫次數（免費服務也受保護）</label><input id="calls" type="number" min="0" max="1000000" step="1" value="0">
<label for="money">每天最多雲端 AI 費用（新台幣）</label><input id="money" type="number" min="0" max="1000000" step="0.01" value="0">
<p class="small">NT$0 不會阻止已證明免費且仍有免費額度的模型，但每天的呼叫次數也必須大於零，才允許使用。</p>
<div class="row"><button id="save">儲存中央草稿</button><button id="reload">重新載入</button></div>
<p class="small">本批設定不會變更既有問答、Whisper、電池或正式 AI 用量。</p></section>
<section class="panel"><h2>版本與還原</h2><p id="policyInfo" class="small">讀取中…</p>
<div id="history" class="small">選擇範圍後列出歷史版次。</div>
<button id="restore" disabled>確認還原所選政策</button>
<p class="small">還原前核對版本，其他管理員的較新修改不會被覆蓋。</p>
<h2>多人使用保護</h2><p class="small">中央、App、功能及會員各有獨立每日上限；同一請求只會預留一次。供應商逾時未明時保持預留，不重複扣會員電池。</p></section>
</div>
<section class="panel"><h2>免費模擬測試（與真實帳單隔離）</h2>
<div class="grid"><div><label for="demoCap">每日上限 NT$</label><select id="demoCap"><option value="0">0（推薦）</option><option value="50">50（示意）</option><option value="100">100（示意）</option></select>
<label for="demoSpent">假設今日已用 NT$</label><input id="demoSpent" type="number" min="0" max="100000" value="20"></div>
<div><label for="demoNext">假設新請求預估 NT$</label><input id="demoNext" type="number" min="0" max="100000" value="15">
<label for="demoCase">假設狀況</label><select id="demoCase"><option value="new">正常新請求</option><option value="duplicate">重複點擊同一請求</option><option value="provider_error">供應商異常</option><option value="unknown_rate">費率未知</option></select></div></div>
<button id="simulate">只做模擬，不呼叫 AI</button><p id="demoResult" class="small">本區資料全部為虛擬示例。</p></section>
<section class="panel"><h2>操作結果</h2><div id="message" role="status" aria-live="polite"></div></section></main>
<script nonce="${nonce}">
'use strict';const $=id=>document.getElementById(id);let state=null,chosen=null;
const fmt=n=>'NT$'+(Number(n||0)/1000000).toFixed(2);
function say(x){$('message').textContent=x}
async function api(url,options){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});
 const v=await r.json().catch(()=>({}));if(!r.ok)throw Error(v.error||'請稍後再試（'+r.status+'）');return v}
async function load(scope){
 state=await api('/api/ai-budget');
 $('scope').replaceChildren();const scopes=['global','app:echostars','app:mirror',
 'task:echostars:echo.qa','task:echostars:echo.bio','task:echostars:echo.transcribe',
 'task:echostars:echo.normalize','task:echostars:echo.story',
 'task:mirror:mirror.reading','member:default'];
 const names=['中央總額','繁星回聲 App','繁星心鏡 App','繁星回聲｜AI 問答',
 '繁星回聲｜人物摘要','繁星回聲｜Whisper','繁星回聲｜繁中校正',
 '繁星回聲｜故事歸屬','繁星心鏡｜AI 解籤','每位會員預設'];
 for(let i=0;i<scopes.length;i++)$('scope').add(new Option(names[i],scopes[i]));
 $('scope').value=scopes.includes(scope)?scope:'global';
 const usages=state.usage||[],all=usages.find(x=>x.scope_key==='global');
 $('settled').textContent=fmt(all?.settled_micro_twd);
 $('held').textContent=fmt(all?.held_micro_twd);
 $('ledgerNote').textContent=state.actualCostNotice;
 await choose();
}
async function choose(){
 chosen=null;$('restore').disabled=true;
 const scope=$('scope').value,p=(state?.policies||[]).find(x=>x.scope===scope);
 $('enabled').value=p?.enabled===false?'off':'on';
 $('calls').value=String(p?.maxCalls??0);
 $('money').value=((p?.maxMicroTwd||0)/1000000).toFixed(2);
 $('policyInfo').textContent='中央草稿版次：'+(p?.revision||0)+'。預算資料不等於供應商已開通的限制。';
 $('history').textContent='讀取中…';
 try{const r=await api('/api/ai-budget?scope='+encodeURIComponent(scope));
  $('history').replaceChildren();
  for(const h of r.history||[]){
   const b=document.createElement('button');b.className='item';
   b.textContent='版本 '+h.revision+' · '+h.action+' · '+new Date(h.createdAt).toLocaleString('zh-TW');
   b.onclick=()=>{chosen=h;$('restore').disabled=false;say('選擇版本 '+h.revision+'，還原只改中央草稿。')};
   $('history').append(b)
  }
  if(!(r.history||[]).length)$('history').textContent='目前沒有歷史版次';
 }catch(e){say(e.message)}
}
$('scope').onchange=choose;
$('reload').onclick=()=>load($('scope').value).catch(e=>say(e.message));
$('save').onclick=async()=>{
 const scope=$('scope').value,p=(state?.policies||[]).find(x=>x.scope===scope);
 const amt=Number($('money').value),calls=Number($('calls').value);
 if(!Number.isInteger(calls)||calls<0||!Number.isFinite(amt)||amt<0||Math.round(amt*100)!==amt*100){say('請輸入合法每日次數及小數兩位內的金額');return}
 if(!confirm('確定只更新中央費用安全草稿？正式 AI 不會被切換。'))return;
 try{const r=await api('/api/ai-budget',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({action:'save',scope,enabled:$('enabled').value==='on',
   maxCalls:calls,maxMicroTwd:Math.round(amt*1000000),expectedRevision:p?.revision||0})});
  say('儲存完成，新版次 '+r.revision+'。正式 AI 未變動。');await load(scope);
 }catch(e){say(e.message)}
};
$('restore').onclick=async()=>{
 if(!chosen||!confirm('確定還原中央費用安全設定？不包含歷史 AI 交易資料。'))return;
 const scope=$('scope').value,p=(state?.policies||[]).find(x=>x.scope===scope);
 try{const r=await api('/api/ai-budget',{method:'POST',headers:{'Content-Type':'application/json'},
 body:JSON.stringify({action:'restore',scope,revisionId:chosen.id,expectedRevision:p?.revision||0})});
 say('安全還原完成；新版次 '+r.revision);await load(scope)
 }catch(e){say(e.message)}
};
$('simulate').onclick=async()=>{
 try{const r=await api('/api/ai-budget/simulate',{method:'POST',
 headers:{'Content-Type':'application/json'},
 body:JSON.stringify({dailyLimitTwd:Number($('demoCap').value),
 alreadyTwd:Number($('demoSpent').value),nextEstimateTwd:Number($('demoNext').value),
 scenario:$('demoCase').value})});
 $('demoResult').textContent='【虛擬模擬，不是真實帳單】'+(r.approved?'模擬通過':'自動攔截')+'；原因 '+r.reason+'；實際 AI 呼叫 0 次';
 }catch(e){say(e.message)}
};
load().catch(e=>say('中央資料讀取失敗：'+e.message));
</script></body></html>`;
 return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
  'X-Frame-Options':'DENY','X-Robots-Tag':'noindex, nofollow, noarchive',
  'Content-Security-Policy':`default-src 'none';script-src 'nonce-${nonce}';style-src 'unsafe-inline';connect-src 'self';base-uri 'none';form-action 'none';frame-ancestors 'none'`}})
}
