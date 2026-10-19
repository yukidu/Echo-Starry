/**
 * A01/A03 administrator UI: never embeds model secrets or provider requests.
 * Browser only talks to the authenticated, same-origin Starry ID API.
 */
export function renderStarryAiModelRegistryPage(): Response {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const html = `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>AI 模型資料庫｜Starry ID</title>
<style>
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#0c1729;color:#eaf2ff;font:15px system-ui,-apple-system,"Noto Sans TC",sans-serif}
main{max-width:1050px;margin:auto;padding:20px 16px 65px}a{color:#a6cfff}h1{font-size:26px;margin:16px 0 4px}h2{font-size:19px;margin:4px 0 13px}
p{line-height:1.65}small,.muted{color:#bed0e7}.intro{max-width:720px;margin:0 0 20px}
.tabs{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}.tab{border:1px solid #537299;border-radius:10px;padding:10px 14px;background:#1c3150;color:white;text-decoration:none}
.tab.active{background:#3366bb}.layout{display:grid;grid-template-columns:minmax(280px,1fr) minmax(320px,1.3fr);gap:14px}
.panel{padding:18px;border:1px solid #354a69;background:#14253d;border-radius:16px;min-width:0}
.card{width:100%;border:1px solid #465e80;color:#eaf2ff;background:#1c3250;padding:13px;border-radius:11px;text-align:left;cursor:pointer;margin:7px 0}
.card.active,.card:focus-visible{outline:2px solid #a1c8ff;background:#274976}.card b{display:block;font-size:16px;margin-bottom:5px}
.card small{display:block;line-height:1.5}.badge{display:inline-block;padding:3px 9px;border-radius:20px;background:#39445e;color:#dfebff;font-size:12px}
.field{display:grid;grid-template-columns:minmax(112px,33%) 1fr;gap:10px;padding:11px 0;border-bottom:1px solid #29435c;overflow-wrap:anywhere}
dt{color:#b9cce5}dd{margin:0;white-space:pre-wrap}strong{font-weight:700}
.cost{font-size:27px;font-weight:800;margin:12px 0}.notice{border-left:3px solid #dabb75;background:#322e25;padding:11px;margin:12px 0;color:#f8e7ba}
#status{min-height:24px}#modelList{max-height:650px;overflow:auto}button:focus-visible{outline:3px solid #acd4ff}
@media(max-width:710px){.layout{grid-template-columns:1fr}h1{font-size:23px}.panel{padding:14px}.field{grid-template-columns:108px 1fr}}
</style></head><body>
<main><a href="/ai-management">← 返回 AI 中央管理</a>
<h1>AI 模型資料庫</h1>
<p class="muted intro">中央模型目錄與費用詳情｜僅供 Starry ID 超級管理員查看。本頁只展示資料，不會呼叫或啟用付費 AI 模型。</p>
<p><a href="/ai-model-setup">＋ 新增／修改模型・查看歷史版本・安全還原</a></p>
<nav class="tabs" aria-label="AI 管理分頁">
<a class="tab" href="/ai-management">AI 工作優先權</a><span class="tab active" aria-current="page">AI 模型資料庫</span>
</nav><p id="status" role="status" aria-live="polite">正在取得已核准權限的模型清單…</p>
<div class="layout">
<section class="panel" aria-label="模型清單"><h2>模型清單</h2><div id="modelList"></div></section>
<section class="panel" aria-label="模型詳情"><h2>模型詳情與成本</h2><div id="modelDetail" aria-live="polite">選擇左側模型查看詳情。</div></section>
</div>
<p class="muted">此階段 A01／A03 僅建立資料庫及可稽核的模型詳情；模型新增、測試、啟用及備援選型會在 A02／A04 獨立開發。</p>
</main><script nonce="${nonce}">
'use strict';
const list=document.getElementById('modelList');
const detail=document.getElementById('modelDetail');
const status=document.getElementById('status');
const el=(tag,text,cls)=>{
  const node=document.createElement(tag);
  if(text!==undefined&&text!==null)node.textContent=String(text);
  if(cls)node.className=cls;
  return node;
};
function field(parent,key,value){
  const wrap=el('div',null,'field'); const label=el('dt',key);const data=el('dd',value??'待查');
  wrap.append(label,data);parent.append(wrap);
}
function link(parent,key,url){
  const wrap=el('div',null,'field');wrap.append(el('dt',key));
  const dd=el('dd');if(url){const a=el('a','查看官方來源');a.href=url;a.target='_blank';a.rel='noopener noreferrer';dd.append(a);}else dd.textContent='待查';
  wrap.append(dd);parent.append(wrap);
}
const asDate=(v)=>v?String(v):'待查';
function showModel(m){
  detail.replaceChildren();
  detail.append(el('h2',m.name),el('span',m.registryStatus==='verified'?'已驗證（非啟用許可）':'尚未驗證', 'badge'));
  const table=el('dl');
  field(table,'Model ID',m.modelId);field(table,'供應商',m.provider);field(table,'版本',m.version||'待查');
  field(table,'適用能力',(m.capabilities||[]).join('、')||'待查');
  field(table,'適用工作',(m.tasks||[]).join('、')||'待查');
  field(table,'連線路線',m.routeKind||'待查');field(table,'Gateway',m.gatewayStatus||'待查');
  field(table,'免費資格',m.freeEligibility||'待查');
  field(table,'計價單位',m.pricingUnit==='usd_per_million_tokens'?'每百萬 Token／美元':'待查');
  field(table,'輸入價格（美元／百萬 Token）',m.inputUsdPerMillion);
  field(table,'輸出價格（美元／百萬 Token）',m.outputUsdPerMillion);
  field(table,'官方價格查證日',asDate(m.priceCheckedAt));
  link(table,'價格來源',m.priceSourceUrl);
  field(table,'匯率（NT$／USD）',m.fxTwdPerUsd);
  field(table,'匯率查證日',asDate(m.fxCheckedAt));
  link(table,'匯率來源',m.fxSourceUrl);
  field(table,'輸入中文字轉 Token 假設',m.inputTokensPerChineseChar);
  field(table,'輸出中文字轉 Token 假設',m.outputTokensPerChineseChar);
  field(table,'典型延遲',m.typicalLatencyMs==null?'尚無實測':m.typicalLatencyMs+' ms');
  field(table,'成功率',m.successRatePct==null?'尚無實測':m.successRatePct+'%');
  field(table,'資料更新',m.updatedAt?new Date(m.updatedAt).toLocaleString('zh-TW'):'待查');
  detail.append(table);
  const title=el('h3','100 則 AI 回答理論估價'); detail.append(title);
  const price=el('div',m.estimated100Twd==null?'NT$ 待查':'NT$ '+Number(m.estimated100Twd).toLocaleString('zh-TW',{minimumFractionDigits:2,maximumFractionDigits:2}),'cost');
  detail.append(price);
  detail.append(el('p','假設每則讀入 3,000 個中文字、輸出 150 個中文字。中文字數不等於 Token；本估價僅在官方價格、匯率和 Token 換算假設均有可查來源時顯示。','muted'));
  detail.append(el('p','此表不代表模型可用、免費資格或已授權上線；實際 Token、附加費、計費方式可能不同。','notice'));
}
async function load(){
 try {
  const r=await fetch('/api/ai-models',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
  if(!r.ok)throw new Error(r.status===401?'登入已過期，請重新登入 Starry ID':r.status===403?'只有超級管理員可查看模型資料庫':'模型資料暫時無法讀取（HTTP '+r.status+'）');
  const data=await r.json();list.replaceChildren();
  if(!Array.isArray(data.models)||!data.models.length){status.textContent='尚未登錄模型';return;}
  status.textContent='共 '+data.models.length+' 個模型，全部資訊僅供管理員查閱';
  let active;
  data.models.forEach((m,i)=>{
    const button=el('button',null,'card');
    button.type='button';button.append(el('b',m.name),el('small',m.provider+' · '+m.modelId));
    button.addEventListener('click',()=>{
      if(active)active.classList.remove('active');active=button;button.classList.add('active');showModel(m);
    });
    list.append(button);if(i===0)button.click();
  });
 }catch(e){status.textContent=e instanceof Error?e.message:'目前無法取得模型資料';detail.textContent='請確認管理員登入與中央資料庫遷移已完成。';}
}
load();
</script></body></html>`;
  return new Response(html, {headers:{
    'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
    'X-Robots-Tag':'noindex, nofollow, noarchive',
    'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
  }});
}
