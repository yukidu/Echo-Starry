import baseWorker from './privacyCrawlerRouter';
import type { Env } from './index';

const CLIENT_SOURCE = `(()=>{
  if(window.__starryV246)return;
  window.__starryV246=true;
  window.__starryV245=true;
  const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const APPS=[
    ['繁星宇宙','https://starry.phd'],['Starry ID','https://id.starry.phd'],['繁星回聲','https://echo.starry.phd'],
    ['繁星下載','https://download.starry.phd'],['繁星任意門','https://go.starry.phd'],['繁星雞湯','https://quotes.starry.phd'],
    ['繁星膠囊','https://box.starry.phd'],['美力之星','https://starbeauty.yukidu.workers.dev']
  ];
  async function api(path,opt={}){
    const r=await fetch(path,{credentials:'same-origin',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(d.error||'操作失敗');
    return d;
  }
  function syncMenu(){
    const menu=q('.v216-menu');
    if(!menu||menu.dataset.v246==='1')return;
    menu.dataset.v246='1';
    for(const a of qa(':scope > a',menu))a.remove();
    const anchor=q(':scope > button',menu)||menu.firstChild;
    const frag=document.createDocumentFragment();
    for(const [name,url] of APPS){const a=document.createElement('a');a.href=url;a.textContent=name;frag.append(a)}
    const ledger=document.createElement('a');ledger.href='/battery-ledger';ledger.textContent='🔋 電池餘額日誌';frag.append(ledger);
    menu.insertBefore(frag,anchor);
  }
  let sessionId='',lastTarget='',loading=false,visibility=null;
  const balanceCache=new Map();
  function targetId(){return q('.member-item.active')?.dataset?.id||sessionId||''}
  function feedback(button,label,visible){
    q('.v246-feedback')?.remove();
    const p=document.createElement('div');p.className='v241-eye-feedback v246-feedback';p.textContent=(visible?'已開啟':'已關閉')+label;
    document.body.append(p);
    const r=button.getBoundingClientRect(),b=p.getBoundingClientRect();
    p.style.left=Math.max(8,Math.min(innerWidth-b.width-8,r.right+8))+'px';
    p.style.top=Math.max(8,Math.min(innerHeight-b.height-8,r.bottom+8))+'px';
    setTimeout(()=>p.remove(),1800);
  }
  function paintEye(eye,visible){
    const icon=visible?'👁':'⊘';
    const state=visible?'1':'0';
    if(eye.dataset.visible!==state)eye.dataset.visible=state;
    if(eye.classList.contains('visibility-off')===visible)eye.classList.toggle('visibility-off',!visible);
    if(eye.textContent!==icon)eye.textContent=icon;
  }
  async function toggleBatteryEye(button){
    const before=button.dataset.visible!=='0',next=!before;
    paintEye(button,next);feedback(button,'電池數量',next);
    try{
      const d=await api('/api/card-settings',{method:'PUT',body:JSON.stringify({visibility:{battery:next}})});
      visibility=d.visibility||visibility;
    }catch(e){paintEye(button,before)}
  }
  function upsert(root,value,own){
    let card=q('.field[data-v245-battery="1"]',root);
    if(!card){
      card=document.createElement('div');card.className='field readonly v242-readonly';card.dataset.v245Battery='1';card.dataset.field='v245Battery';
      const l=document.createElement('div');l.className='field-label';l.textContent='電池數量';
      const v=document.createElement('div');v.className='field-value';
      const hint=document.createElement('div');hint.className='field-hint';hint.textContent='中央電池餘額，無法手動修改';
      card.append(l,v,hint);root.append(card);
    }
    const v=q('.field-value',card),nextText=String(value)+' 顆';
    if(v.textContent!==nextText)v.textContent=nextText;
    if(v.classList.contains('empty'))v.classList.remove('empty');
    let eye=q('.v245-battery-eye',card);
    if(own){
      const visible=visibility?.battery!==false;
      if(!eye){
        eye=document.createElement('button');eye.type='button';eye.className='v241-eye v245-battery-eye';eye.dataset.v241Eye='1';
        eye.title='控制電池數量是否顯示在公開名片';
        eye.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();toggleBatteryEye(eye)});
        card.append(eye);
      }
      paintEye(eye,visible);
    }else eye?.remove();
  }
  async function syncBattery(force=false){
    const root=q('#fields'),target=targetId();
    if(!root||!sessionId||!target||loading)return;
    const own=target===sessionId;
    if(lastTarget!==target){lastTarget=target;visibility=null}
    loading=true;
    try{
      if(own&&!visibility){const s=await api('/api/card-settings');visibility=s.visibility||{}}
      let data=!force?balanceCache.get(target):null;
      if(!data){data=await api('/api/battery-ledger/summary?targetUserId='+encodeURIComponent(target));balanceCache.set(target,data)}
      upsert(root,data.balance,own);
    }catch{}finally{loading=false}
  }
  let syncTimer=0;
  function scheduleSync(force=false){
    clearTimeout(syncTimer);
    syncTimer=setTimeout(()=>{syncMenu();void syncBattery(force)},80);
  }
  document.addEventListener('click',e=>{
    if(!e.target.closest?.('.v245-battery-eye'))q('.v246-feedback')?.remove();
    scheduleSync(false);
  },true);
  window.addEventListener('pageshow',()=>scheduleSync(true));
  window.addEventListener('popstate',()=>scheduleSync(false));
  api('/api/session').then(d=>{sessionId=d.user?.id||'';syncMenu();void syncBattery(true)}).catch(()=>undefined);
  syncMenu();scheduleSync(false);
})();`;

export default {
  async fetch(request: Request, env: Env, ctx?: any): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname === 'id.starry.phd' && request.method === 'GET' && url.pathname === '/starry-id-v245.js') {
      return new Response(CLIENT_SOURCE, { headers: {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow, noarchive'
      }});
    }
    return baseWorker.fetch(request, env, ctx);
  }
};
