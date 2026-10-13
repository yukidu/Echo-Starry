const STAR_DOMAIN = 'id.starry.phd';

function copyHeaders(response: Response) {
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  return headers;
}

function memberCenterScript() {
  return `<script id="v218-script">(()=>{
    const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>Array.from(r.querySelectorAll(s));
    const brand=q('.brand');
    const originalBrand=brand?{html:brand.innerHTML,className:brand.className}:null;
    async function cardUrl(){const r=await fetch('/api/card-settings',{credentials:'same-origin'});const d=await r.json().catch(()=>({}));if(!r.ok||!d.url)throw new Error(d.error||'找不到名片網址');return d.url}
    function restoreBrand(){const el=q('.brand');if(!el||!originalBrand)return;if(el.innerHTML!==originalBrand.html||el.className!==originalBrand.className){el.className=originalBrand.className;el.innerHTML=originalBrand.html}}
    function removeMenuCardLinks(){qa('.v216-menu a').forEach(a=>{const t=(a.textContent||'').trim();if(t==='我的電子名片'||t==='我的名片')a.remove()})}
    function enforceToolbar(){const actions=document.getElementById('topActions');if(!actions)return;let card=document.getElementById('myCardBtn');if(card&&!card.dataset.v218){const clone=card.cloneNode(true);clone.dataset.v216='1';clone.dataset.v218='1';clone.textContent='我的名片';clone.title='開啟我的公開名片';clone.addEventListener('click',async e=>{e.preventDefault();try{location.href=await cardUrl()}catch(err){alert(err?.message||'無法開啟名片')}});card.replaceWith(clone);card=clone}else if(card){card.textContent='我的名片';card.title='開啟我的公開名片'}const burger=document.getElementById('v216Menu')||qa('button',actions).find(b=>(b.textContent||'').trim()==='☰');if(card&&burger&&card.nextElementSibling!==burger)actions.insertBefore(card,burger);removeMenuCardLinks()}
    function sync(){restoreBrand();enforceToolbar()}
    sync();
    const observer=new MutationObserver(sync);observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  })();</script>`;
}

export async function enhanceStarryIdV218Response(request: Request, response: Response): Promise<Response> {
  const url = new URL(request.url);
  if (url.hostname !== STAR_DOMAIN || request.method.toUpperCase() !== 'GET') return response;
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.includes('text/html')) return response;

  let html = await response.text();
  if (url.pathname === '/' || url.pathname === '/my-card') {
    html = html.replace('</body>', memberCenterScript() + '</body>');
  } else if (!url.pathname.startsWith('/api/')) {
    html = html
      .replace(/<div class="owner"><a href="\/">← 回到我的 Starry ID 會員中心<\/a><\/div>/g, '')
      .replace(/\.owner\{position:sticky;top:0;padding:10px;text-align:center;background:#0b1528e8;backdrop-filter:blur\(12px\);z-index:4\}\.owner a\{color:#dce7ff\}/g, '');
  }

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers: copyHeaders(response)
  });
}
