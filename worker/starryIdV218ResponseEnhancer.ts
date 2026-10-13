const STAR_DOMAIN = 'id.starry.phd';

function copyHeaders(response: Response) {
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  return headers;
}

function memberCenterStyle() {
  return `<style id="v220-style">
    .topbar{position:sticky!important;top:max(8px,env(safe-area-inset-top))!important;z-index:25!important;margin:0 0 18px!important;padding:9px 11px!important;border:1px solid rgba(83,107,147,.55)!important;border-radius:18px!important;background:rgba(8,17,33,.84)!important;backdrop-filter:blur(18px)!important;box-shadow:0 12px 34px rgba(0,0,0,.22)!important}
    .brand{gap:10px!important;min-width:0}.brand .star{width:42px!important;height:42px!important;border-radius:14px!important;flex:0 0 42px}.brand h1{font-size:19px!important;white-space:nowrap!important}.brand small{font-size:11px!important}.top-actions{gap:6px!important;flex-wrap:nowrap!important;align-items:center!important}.top-actions .btn{padding:8px 11px!important;border-radius:12px!important}.top-actions #myCardBtn{background:#16233b!important}.top-actions #v216Menu{border:0!important;background:transparent!important;font-size:24px!important}.top-actions #v211Theme{display:none!important}
    .v220-theme{width:100%;display:flex!important;justify-content:flex-start!important;gap:8px!important;background:transparent!important;border:0!important;text-align:left!important;padding:11px!important;color:inherit!important;border-radius:11px!important}.v220-theme:hover{background:#1b2c49!important}
    .v220-editor-wrap{position:relative}.v220-select{appearance:auto}.v220-relation-input{padding-right:10px}.v220-suggestions{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:80;display:grid;gap:5px;max-height:270px;overflow:auto;padding:7px;background:#0a1426;border:1px solid #435a80;border-radius:13px;box-shadow:0 18px 45px #0008}.v220-suggestion{display:flex;align-items:center;gap:9px;width:100%;border:0;background:#111f36;color:#eef4ff;text-align:left;padding:8px;border-radius:10px;cursor:pointer}.v220-suggestion:hover{background:#1b3152}.v220-suggestion img,.v220-suggestion-avatar{width:34px;height:34px;border-radius:10px;object-fit:cover;background:#243653;display:grid;place-items:center;flex:0 0 34px}.v220-suggestion-copy{min-width:0;flex:1}.v220-suggestion-name{font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.v220-suggestion-meta{font-size:11px;color:#9eb0cc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.v220-empty{padding:9px;color:#91a2c0;font-size:12px}.v220-field-note{font-size:11px;color:#8194b4;margin-top:5px}
    html[data-starry-theme="light"] .topbar{background:rgba(255,255,255,.9)!important;border-color:#c9d4e4!important;box-shadow:0 10px 30px #24344f17!important}html[data-starry-theme="light"] .v220-suggestions{background:#fff!important;border-color:#c5d1e0!important}html[data-starry-theme="light"] .v220-suggestion{background:#f4f7fc!important;color:#14213d!important}html[data-starry-theme="light"] .v220-suggestion:hover{background:#e9eff8!important}html[data-starry-theme="light"] .v220-suggestion-meta,html[data-starry-theme="light"] .v220-empty,html[data-starry-theme="light"] .v220-field-note{color:#62728d!important}
    @media(max-width:760px){.topbar{padding:8px 9px!important;border-radius:16px!important}.brand .star{width:40px!important;height:40px!important;flex-basis:40px!important}.brand h1{font-size:17px!important}.brand small{display:none!important}.top-actions .btn{padding:7px 9px!important}.top-actions #myCardBtn{font-size:12px!important}.top-actions #v216Menu{width:38px!important;height:38px!important;padding:0!important}.v220-suggestions{max-height:220px}}
  </style>`;
}

function memberCenterScript() {
  return `<script id="v218-script">(()=>{
    const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>Array.from(r.querySelectorAll(s));
    const brand=q('.brand');
    const originalBrand=brand?{html:brand.innerHTML,className:brand.className}:null;
    const SELECT_FIELDS=new Set(['residence','center','rank','joinReason','stayReason']);
    const RELATION_FIELDS=new Set(['sponsor','platinumUpline','diamondUpline']);
    let profileOptions=null,profileOptionsPromise=null;
    async function cardUrl(){const r=await fetch('/api/card-settings',{credentials:'same-origin'});const d=await r.json().catch(()=>({}));if(!r.ok||!d.url)throw new Error(d.error||'找不到名片網址');return d.url}
    async function api(path,opt={}){const r=await fetch(path,{credentials:'same-origin',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||'操作失敗');return d}
    async function loadOptions(){if(profileOptions)return profileOptions;if(!profileOptionsPromise)profileOptionsPromise=api('/api/profile-options').then(d=>d.options||{}).finally(()=>{profileOptionsPromise=null});profileOptions=await profileOptionsPromise;return profileOptions}
    function restoreBrand(){const el=q('.brand');if(!el||!originalBrand)return;if(el.className!==originalBrand.className)el.className=originalBrand.className;if(el.innerHTML!==originalBrand.html)el.innerHTML=originalBrand.html}
    function removeMenuCardLinks(){qa('.v216-menu a').forEach(a=>{const t=(a.textContent||'').trim();if(t==='我的電子名片'||t==='我的名片')a.remove()})}
    function themeLabel(){return document.documentElement.dataset.starryTheme==='light'?'🌙 深色模式':'☀️ 淺色模式'}
    function toggleTheme(){const root=document.documentElement;const next=root.dataset.starryTheme==='light'?'dark':'light';root.dataset.starryTheme=next;try{localStorage.setItem('starry-id-theme',next)}catch{}const b=q('.v220-theme');if(b)b.textContent=themeLabel()}
    function ensureMenuTheme(){const menu=q('.v216-menu');if(!menu)return;let button=q('.v220-theme',menu);if(!button){button=document.createElement('button');button.type='button';button.className='v216-menu-item v220-theme';button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();toggleTheme()});const logout=qa('button',menu).find(b=>(b.textContent||'').trim()==='登出');if(logout)menu.insertBefore(button,logout);else menu.appendChild(button)}const label=themeLabel();if(button.textContent!==label)button.textContent=label}
    function enforceToolbar(){const actions=document.getElementById('topActions');if(!actions)return;document.getElementById('v211Theme')?.remove();let card=document.getElementById('myCardBtn');if(card&&!card.dataset.v218){const clone=card.cloneNode(true);clone.dataset.v216='1';clone.dataset.v218='1';clone.textContent='我的名片';clone.title='開啟我的公開名片';clone.addEventListener('click',async e=>{e.preventDefault();try{location.href=await cardUrl()}catch(err){alert(err?.message||'無法開啟名片')}});card.replaceWith(clone);card=clone}else if(card){if((card.textContent||'')!=='我的名片')card.textContent='我的名片';if(card.title!=='開啟我的公開名片')card.title='開啟我的公開名片'}const burger=document.getElementById('v216Menu')||qa('button',actions).find(b=>(b.textContent||'').trim()==='☰');if(card&&burger&&card.nextElementSibling!==burger)actions.insertBefore(card,burger);removeMenuCardLinks();ensureMenuTheme()}
    function currentTargetId(){const active=q('.member-item.active');if(active?.dataset?.id)return active.dataset.id;return ''}
    function savePath(){const target=currentTargetId();const own=document.querySelector('.member-item.active')?false:true;return target&&!own?'/api/admin/members/'+encodeURIComponent(target):'/api/profile'}
    function fieldDisplay(value){const d=document.createElement('div');d.className='field-value'+(value?'':' empty');d.textContent=value||'尚未填寫';return d}
    function resetEdit(button){button.textContent='✎';button.classList.remove('v216-save');delete button.dataset.v220Save;delete button.dataset.v220Mode;button.title='編輯'+(q('.field-label',button.closest('.field'))?.textContent||'資料')}
    function cancelSpecial(card,button,editor,original){editor.replaceWith(fieldDisplay(original));resetEdit(button)}
    async function beginSelect(card,button,field,display){const options=await loadOptions();const original=display.classList.contains('empty')?'':display.textContent||'';const select=document.createElement('select');select.className='field-editor v220-select';select.dataset.original=original;const values=Array.isArray(options?.[field])?options[field]:[];if(original&&!values.includes(original)){const o=document.createElement('option');o.value=original;o.textContent=original;select.appendChild(o)}for(const value of values){const o=document.createElement('option');o.value=value;o.textContent=value;select.appendChild(o)}if(!values.length&&!original){const o=document.createElement('option');o.value='';o.textContent='暫無中央選項';select.appendChild(o)}select.value=original||values[0]||'';display.replaceWith(select);button.textContent='✓';button.title='手動儲存';button.classList.add('v216-save');button.dataset.v220Save='1';button.dataset.v220Mode='select';select.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();cancelSpecial(card,button,select,original)}else if(e.key==='Enter'){e.preventDefault()}});select.focus()}
    function relationHint(field){if(field==='platinumUpline')return '搜尋姓名或 Amway ID，只顯示已審核白金以上會員';if(field==='diamondUpline')return '搜尋姓名或 Amway ID，只顯示已審核鑽石以上會員';return '搜尋姓名或 Amway ID；搜尋不到可直接保留手動文字'}
    function makeSuggestion(candidate,input,list){const b=document.createElement('button');b.type='button';b.className='v220-suggestion';let avatar;if(candidate.avatar){avatar=document.createElement('img');avatar.src=candidate.avatar;avatar.alt='';avatar.referrerPolicy='no-referrer'}else{avatar=document.createElement('div');avatar.className='v220-suggestion-avatar';avatar.textContent=(candidate.name||candidate.amwayId||'S').slice(0,1)}const copy=document.createElement('div');copy.className='v220-suggestion-copy';const name=document.createElement('div');name.className='v220-suggestion-name';name.textContent=candidate.name||candidate.amwayId||'未命名會員';const meta=document.createElement('div');meta.className='v220-suggestion-meta';meta.textContent=[candidate.amwayId,candidate.approvedRank].filter(Boolean).join('｜');copy.append(name,meta);b.append(avatar,copy);b.addEventListener('click',()=>{input.value=candidate.name||candidate.amwayId||'';input.dataset.relatedUserId=candidate.id||'';list.replaceChildren();list.hidden=true;input.focus()});return b}
    async function searchRelation(field,input,list){const query=input.value.trim();input.dataset.relatedUserId='';if(!query){list.replaceChildren();list.hidden=true;return}const target=currentTargetId();try{const data=await api('/api/profile-directory?field='+encodeURIComponent(field)+'&search='+encodeURIComponent(query)+'&excludeUserId='+encodeURIComponent(target));list.replaceChildren();const members=Array.isArray(data.members)?data.members:[];if(!members.length){const empty=document.createElement('div');empty.className='v220-empty';empty.textContent='沒有符合資格的中央會員；若是未註冊會員，可保留目前文字後按 ✓';list.appendChild(empty)}else for(const member of members)list.appendChild(makeSuggestion(member,input,list));list.hidden=false}catch{list.replaceChildren();list.hidden=true}}
    function beginRelation(card,button,field,display){const original=display.classList.contains('empty')?'':display.textContent||'';const wrap=document.createElement('div');wrap.className='v220-editor-wrap';wrap.dataset.original=original;const input=document.createElement('input');input.className='field-editor v220-relation-input';input.value=original;input.autocomplete='off';input.placeholder=relationHint(field);const note=document.createElement('div');note.className='v220-field-note';note.textContent=relationHint(field);const list=document.createElement('div');list.className='v220-suggestions';list.hidden=true;wrap.append(input,note,list);display.replaceWith(wrap);button.textContent='✓';button.title='手動儲存';button.classList.add('v216-save');button.dataset.v220Save='1';button.dataset.v220Mode='relation';let timer;input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>searchRelation(field,input,list),180)});input.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();cancelSpecial(card,button,wrap,original)}else if(e.key==='Enter'){e.preventDefault()}});input.focus();input.select();if(original)searchRelation(field,input,list)}
    async function commitSpecial(card,button,field){const mode=button.dataset.v220Mode;button.disabled=true;try{if(mode==='select'){const select=q('select.field-editor',card);if(!select)return;const original=select.dataset.original||'';const next=select.value.trim();if(next!==original)await api(savePath(),{method:'PUT',body:JSON.stringify({[field]:next})});select.replaceWith(fieldDisplay(next));resetEdit(button)}else if(mode==='relation'){const wrap=q('.v220-editor-wrap',card),input=q('.v220-relation-input',card);if(!wrap||!input)return;const original=wrap.dataset.original||'';const label=input.value.trim();const relatedUserId=input.dataset.relatedUserId||'';if(label!==original||relatedUserId){const target=currentTargetId();await api('/api/profile-relationship',{method:'PUT',body:JSON.stringify({targetUserId:target||undefined,field,relatedUserId,legacyLabel:label})})}wrap.replaceWith(fieldDisplay(label));resetEdit(button)}}catch(err){alert(err?.message||'儲存失敗')}finally{button.disabled=false}}
    window.addEventListener('click',event=>{const button=event.target?.closest?.('button.edit');if(!button)return;const card=button.closest('.field');const field=card?.dataset?.field;if(!field||(!SELECT_FIELDS.has(field)&&!RELATION_FIELDS.has(field)))return;event.preventDefault();event.stopImmediatePropagation();if(button.dataset.v220Save==='1'){void commitSpecial(card,button,field);return}const display=q('.field-value',card);if(!display)return;if(SELECT_FIELDS.has(field))void beginSelect(card,button,field,display);else beginRelation(card,button,field,display)},true);
    try{const saved=localStorage.getItem('starry-id-theme');if(saved==='light'||saved==='dark')document.documentElement.dataset.starryTheme=saved}catch{}
    void loadOptions().catch(()=>undefined);
    let syncing=false;
    function sync(){if(syncing)return;syncing=true;try{restoreBrand();enforceToolbar()}finally{syncing=false}}
    sync();
    const target=q('.topbar')||document.body;
    const observer=new MutationObserver(()=>sync());
    observer.observe(target,{subtree:true,childList:true});
    const menuObserver=new MutationObserver(()=>ensureMenuTheme());
    menuObserver.observe(document.body,{childList:true});
  })();</script>`;
}

export async function enhanceStarryIdV218Response(request: Request, response: Response): Promise<Response> {
  const url = new URL(request.url);
  if (url.hostname !== STAR_DOMAIN || request.method.toUpperCase() !== 'GET') return response;
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.includes('text/html')) return response;

  let html = await response.text();
  if (url.pathname === '/' || url.pathname === '/my-card') {
    if (!html.includes("['joinReason','初次如何認識安麗？',false]")) {
      html = html.replace(
        "['center','中心',false],['rank','獎銜',false],['birthday','生日',false]",
        "['center','中心',false],['rank','獎銜',false],['joinReason','初次如何認識安麗？',false],['stayReason','什麼原因留在安麗？',true],['birthday','生日',false]"
      );
    }
    html = html.replace('</head>', memberCenterStyle() + '</head>');
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
