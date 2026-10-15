export function enhanceStarryIdV253Navigation(html: string): string {
  const css = String.raw`<style id="v253-navigation-style">
    html:not([data-v253-auth-ready="1"]) #loginView{visibility:hidden!important}
    #myCardBtn,#v216Menu{display:none!important}
  </style>`;

  const script = String.raw`<script id="v253-navigation-script">(()=>{
    const q=(s,r=document)=>r.querySelector(s);
    async function api(path){const r=await fetch(path,{credentials:'same-origin'});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'操作失敗');return d}
    function markAuthReady(){document.documentElement.dataset.v253AuthReady='1'}
    function removeRetiredUi(){
      q('#myCardPage')?.remove();
      q('#myCardBtn')?.remove();
      q('#v216Menu')?.remove();
      q('.v216-menu')?.remove();
      const actions=q('#topActions');
      if(actions){
        for(const button of Array.from(actions.querySelectorAll('button'))){
          const label=(button.textContent||'').trim();
          if(label==='我的名片'||label==='我的電子名片'||label==='☰')button.remove();
        }
      }
    }
    function retireMyCardRoute(){
      if(location.pathname!=='/my-card')return false;
      history.replaceState(null,'','/');
      removeRetiredUi();
      return true;
    }
    retireMyCardRoute();
    removeRetiredUi();
    for(const delay of [0,50,200,500,1000])setTimeout(removeRetiredUi,delay);
    window.addEventListener('popstate',()=>{retireMyCardRoute();removeRetiredUi()});
    document.addEventListener('click',event=>{
      const link=event.target?.closest?.('a[href="/my-card"]');
      if(!link)return;
      event.preventDefault();
      event.stopImmediatePropagation();
      retireMyCardRoute();
      removeRetiredUi();
    },true);
    void api('/api/session').then(data=>{
      markAuthReady();
      removeRetiredUi();
      if(data?.user){
        q('#loginView')?.classList.add('hidden');
        q('#memberView')?.classList.remove('hidden');
      }
    }).catch(()=>{
      markAuthReady();
    });
  })();</script>`;

  return html.replace('</head>', css + '</head>').replace('</body>', script + '</body>');
}
