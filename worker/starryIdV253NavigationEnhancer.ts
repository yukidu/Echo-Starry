import { enhanceStarryIdV256UnifiedMenu } from './starryIdV256UnifiedMenu';

export function enhanceStarryIdV253Navigation(html: string): string {
  const css = String.raw`<style id="v253-navigation-style">
    html:not([data-v253-auth-ready="1"]) #loginView{visibility:hidden!important}
  </style>`;

  const script = String.raw`<script id="v253-navigation-script">(()=>{
    const q=(s,r=document)=>r.querySelector(s);
    async function api(path){const r=await fetch(path,{credentials:'same-origin'});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'操作失敗');return d}
    function markAuthReady(){document.documentElement.dataset.v253AuthReady='1'}
    function retireMyCardRoute(){
      if(location.pathname!=='/my-card')return false;
      history.replaceState(null,'','/');
      q('#myCardPage')?.remove();
      return true;
    }
    retireMyCardRoute();
    window.addEventListener('popstate',retireMyCardRoute);
    document.addEventListener('click',event=>{
      const link=event.target?.closest?.('a[href="/my-card"]');
      if(!link)return;
      event.preventDefault();
      event.stopImmediatePropagation();
      retireMyCardRoute();
    },true);
    void api('/api/session').then(data=>{
      markAuthReady();
      if(data?.user){
        q('#loginView')?.classList.add('hidden');
        q('#memberView')?.classList.remove('hidden');
      }
    }).catch(()=>{
      markAuthReady();
    });
  })();</script>`;

  const enhanced = html.replace('</head>', css + '</head>').replace('</body>', script + '</body>');
  return enhanceStarryIdV256UnifiedMenu(enhanced);
}
