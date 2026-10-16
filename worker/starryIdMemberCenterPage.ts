const NOINDEX = 'noindex, nofollow, noarchive, nosnippet, noimageindex';

export function renderStarryIdMemberCenterPage(clientId: string) {
  const safeClientId = JSON.stringify(clientId);
  const html = `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="robots" content="noindex,nofollow,noarchive,nosnippet,noimageindex">
  <meta name="theme-color" content="#09101f">
  <title>Starry ID｜繁星會員中心</title>
  <style>
    :root{color-scheme:dark;--bg:#07101f;--panel:#101b31;--panel2:#15233d;--line:#2b3b5c;--text:#f7f9ff;--muted:#aebbd3;--accent:#93b8ff;--ok:#68e0b2;--danger:#ff8f9a;--shadow:0 24px 70px rgba(0,0,0,.36)}
    *{box-sizing:border-box} body{margin:0;min-height:100vh;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:radial-gradient(circle at 20% -10%,#1a3263 0,transparent 34%),radial-gradient(circle at 100% 0,#392a6c 0,transparent 26%),var(--bg);color:var(--text)}
    button,input,textarea{font:inherit}.shell{width:min(1060px,100%);margin:0 auto;padding:22px 18px 64px}.topbar{display:flex;gap:14px;align-items:center;justify-content:space-between;margin-bottom:22px}.brand{display:flex;gap:12px;align-items:center}.star{width:44px;height:44px;border-radius:15px;display:grid;place-items:center;background:linear-gradient(145deg,#dce7ff,#8ca9ff 60%,#9f87ff);color:#101831;font-size:25px;box-shadow:0 10px 30px #6f8fff38}.brand h1{font-size:20px;margin:0}.brand small{display:block;color:var(--muted);margin-top:3px}.top-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.btn{border:1px solid var(--line);background:#16233b;color:var(--text);border-radius:12px;padding:9px 13px;cursor:pointer}.btn:hover{background:#1c2c49}.btn.primary{background:linear-gradient(135deg,#779eff,#997cff);border-color:transparent;color:white}.btn.ghost{background:transparent}.btn.danger{color:#ffd7db;border-color:#6d3942}.hidden{display:none!important}
    .hero{min-height:68vh;display:grid;place-items:center}.login-card{width:min(520px,100%);padding:34px;border-radius:28px;border:1px solid var(--line);background:linear-gradient(160deg,rgba(21,35,61,.96),rgba(11,19,35,.96));box-shadow:var(--shadow);text-align:center}.login-mark{font-size:48px;margin-bottom:10px}.login-card h2{font-size:29px;margin:6px 0}.login-card p{color:var(--muted);line-height:1.8;margin:8px auto 24px;max-width:410px}.google-wrap{display:flex;justify-content:center;min-height:44px}.login-status{margin-top:16px;color:var(--muted);font-size:14px;min-height:20px}
    .layout{display:grid;grid-template-columns:minmax(0,1fr);gap:18px}.layout.admin-open{grid-template-columns:minmax(300px,370px) minmax(0,1fr)}.admin-panel{border:1px solid var(--line);background:rgba(12,21,39,.93);border-radius:24px;padding:16px;box-shadow:var(--shadow);max-height:calc(100vh - 110px);position:sticky;top:18px;overflow:auto}.admin-title{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.admin-title h3{margin:0;font-size:17px}.search{width:100%;border:1px solid var(--line);background:#0b1528;color:var(--text);border-radius:12px;padding:11px 12px;outline:none}.members{display:grid;gap:8px;margin-top:12px}.member-item{width:100%;text-align:left;border:1px solid transparent;background:#111e35;color:var(--text);border-radius:14px;padding:11px 12px;cursor:pointer}.member-item:hover,.member-item.active{border-color:#698bd0;background:#182845}.member-item strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.member-item span{display:block;color:var(--muted);font-size:12px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .card{border:1px solid var(--line);background:linear-gradient(160deg,rgba(20,34,59,.97),rgba(10,18,34,.97));border-radius:28px;padding:24px;box-shadow:var(--shadow)}.identity{display:flex;gap:17px;align-items:center;padding-bottom:21px;border-bottom:1px solid var(--line)}.avatar-shell{position:relative;flex:0 0 auto}.avatar{width:86px;height:86px;border-radius:24px;object-fit:cover;background:#223250;border:1px solid #425578}.avatar-fallback{width:86px;height:86px;border-radius:24px;display:grid;place-items:center;background:linear-gradient(145deg,#435f91,#6e62a9);font-size:30px;font-weight:700}.avatar-tools{position:absolute;right:-9px;bottom:-9px;display:flex;gap:5px}.avatar-tool,.edit,.field-eye{width:31px;height:31px;border-radius:10px;border:1px solid #314869;background:#172742;color:#d9e5ff;cursor:pointer;display:grid;place-items:center;padding:0}.avatar-tool:hover,.edit:hover,.field-eye:hover{background:#223657}.avatar-tool.visibility-off,.field-eye.visibility-off{color:#8594af;background:#111d31}.identity-main{min-width:0;flex:1}.identity-main h2{font-size:27px;margin:0 0 5px;overflow-wrap:anywhere}.email{color:var(--muted);overflow-wrap:anywhere}.badges{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.badge{padding:5px 9px;border-radius:999px;background:#1d3151;color:#cbd9f5;font-size:12px;border:1px solid #35517b}.badge.admin{background:#3a294f;border-color:#73569c;color:#efdfff}.section-title{font-size:14px;color:#c5d1e7;letter-spacing:.08em;margin:22px 0 8px;text-transform:uppercase}.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.field{min-height:72px;border:1px solid #263a5a;border-radius:16px;background:#0e1a2e;padding:11px 12px;position:relative}.field.wide{grid-column:1/-1}.field-label{font-size:12px;color:#91a2c0;margin-bottom:7px}.field-value{font-size:16px;line-height:1.45;padding-right:72px;white-space:pre-wrap;overflow-wrap:anywhere}.field-value.empty{color:#71819e}.edit{position:absolute;right:8px;top:8px}.field-eye{position:absolute;right:46px;top:8px}.field.readonly .edit{display:none}.field-editor{width:100%;border:1px solid #5f7cac;background:#0a1426;color:#fff;border-radius:10px;padding:8px 9px;outline:none;resize:vertical}.field-hint{font-size:11px;color:#7789a8;margin-top:5px}.spouse-link{font-size:12px;color:var(--accent);margin-top:7px;padding-right:72px}.saving{opacity:.62;pointer-events:none}.footer-note{margin-top:18px;color:#8292ad;font-size:12px;line-height:1.6}.toast{position:fixed;left:50%;bottom:max(24px,env(safe-area-inset-bottom));transform:translateX(-50%);background:#15233c;border:1px solid #415679;color:white;border-radius:13px;padding:10px 14px;box-shadow:var(--shadow);z-index:20;max-width:min(480px,calc(100% - 28px));text-align:center}.toast.error{border-color:#8c4751;color:#ffd8dc}
    @media(max-width:760px){.shell{padding:16px 12px 52px}.topbar{align-items:flex-start}.brand small{display:none}.layout.admin-open{grid-template-columns:1fr}.admin-panel{position:static;max-height:45vh}.card{padding:18px;border-radius:22px}.fields{grid-template-columns:1fr}.identity{align-items:flex-start}.avatar,.avatar-fallback{width:72px;height:72px;border-radius:20px}.identity-main h2{font-size:23px}.top-actions .btn{padding:8px 10px}}
  </style>
  <script src="https://accounts.google.com/gsi/client" async defer></script>
</head>
<body>
  <div class="shell">
    <header class="topbar">
      <div class="brand"><div class="star">✦</div><div><h1>Starry ID</h1><small>繁星會員中心 · 電子名片</small></div></div>
      <div class="top-actions" id="topActions" hidden>
        <button class="btn" id="myCardBtn">我的名片</button>
        <button class="btn primary hidden" id="adminBtn">會員管理</button>
        <button class="btn ghost" id="logoutBtn">登出</button>
      </div>
    </header>

    <section class="hero" id="loginView">
      <div class="login-card">
        <div class="login-mark">✦</div>
        <h2>登入 Starry ID</h2>
        <p>一個 Starry ID，使用繁星生態系。登入後可查看並直接編輯自己的中央會員資料與電子名片。</p>
        <div class="google-wrap"><div id="googleButton"></div></div>
        <div class="login-status" id="loginStatus">正在準備 Google 登入…</div>
      </div>
    </section>

    <main class="layout hidden" id="memberView">
      <aside class="admin-panel hidden" id="adminPanel">
        <div class="admin-title"><h3>全部會員</h3><span id="memberCount"></span></div>
        <input class="search" id="memberSearch" placeholder="搜尋姓名或 Email" autocomplete="off">
        <div class="members" id="members"></div>
      </aside>
      <section class="card" id="profileCard">
        <div class="identity">
          <div id="avatarWrap"></div>
          <div class="identity-main">
            <h2 id="displayName">會員</h2>
            <div class="email" id="displayEmail"></div>
            <div class="badges" id="badges"></div>
          </div>
        </div>
        <div class="section-title">電子名片資料</div>
        <div class="fields" id="fields"></div>
        <div class="footer-note">鉛筆可修改資料，眼睛可控制該欄位是否顯示在公開名片；照片也可直接更換並控制公開／隱藏。Enter 儲存、Esc 取消；座右銘可用 Ctrl / ⌘ + Enter 儲存。</div>
      </section>
    </main>
  </div>
  <div class="toast hidden" id="toast"></div>

  <script>
  (() => {
    const CLIENT_ID = ${safeClientId};
    const state = { session:null, user:null, isSuperAdmin:false, targetUserId:null, adminOpen:false, members:[], visibility:null };
    const $ = (id) => document.getElementById(id);
    const editable = [
      ['name','姓名',false],['amwayId','會員編號 / Amway ID',false],['phone','電話',false],['residence','居住地',false],
      ['center','中心',false],['rank','獎銜',false],['birthday','生日',false],['motto','座右銘',true],['zodiac','星座',false],
      ['talentNumber','天賦數',false],['lifeNumber','生命靈數',false],['sponsor','推薦人',false],
      ['platinumUpline','白金上線',false],['diamondUpline','鑽石上線',false]
    ];

    function toast(message, error=false){ const el=$('toast'); el.textContent=message; el.className='toast'+(error?' error':''); clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.add('hidden'),2600); }
    async function api(path, options={}){
      const response=await fetch(path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
      let data={}; try{data=await response.json();}catch{}
      if(!response.ok) throw new Error(data.error||'操作失敗');
      return data;
    }
    function initials(user){ const name=(user?.name||user?.email||'S').trim(); return name.slice(0,1).toUpperCase(); }
    function isOwnProfile(){ return Boolean(state.session?.user?.id && state.targetUserId===state.session.user.id); }
    function canEditTarget(){ return isOwnProfile() || state.isSuperAdmin; }
    function defaultVisibility(field){ return field!=='phone' && field!=='birthday'; }
    function isVisible(field){ return state.visibility && Object.prototype.hasOwnProperty.call(state.visibility,field) ? Boolean(state.visibility[field]) : defaultVisibility(field); }
    async function loadOwnVisibility(){
      try{ const data=await api('/api/card-settings'); state.visibility=data.visibility||{}; return data; }
      catch{ state.visibility=null; return null; }
    }
    async function toggleVisibility(field){
      if(!isOwnProfile()) return;
      const next=!isVisible(field);
      try{
        const data=await api('/api/card-settings',{method:'PUT',body:JSON.stringify({visibility:{[field]:next}})});
        state.visibility=data.visibility||{...state.visibility,[field]:next};
        renderProfile(state.user);
        toast(next?'已設為公開':'已從公開名片隱藏');
      }catch(e){ toast(e.message||'公開設定儲存失敗',true); }
    }
    function makeVisibilityButton(field,titleText,className){
      const visible=isVisible(field); const b=document.createElement('button'); b.type='button'; b.className=(className||'field-eye')+(visible?'':' visibility-off'); b.textContent=visible?'👁':'⊘'; b.title=visible?titleText+'目前公開，按一下隱藏':titleText+'目前隱藏，按一下公開'; b.setAttribute('aria-label',b.title); b.addEventListener('click',(event)=>{event.preventDefault();event.stopPropagation();toggleVisibility(field);}); return b;
    }
    function renderAvatar(user){
      const wrap=$('avatarWrap'); wrap.replaceChildren(); const shell=document.createElement('div'); shell.className='avatar-shell'; const url=(user.avatar||user.googleAvatar||'').trim();
      if(url){ const img=document.createElement('img'); img.className='avatar'; img.alt='會員頭像'; img.referrerPolicy='no-referrer'; img.src=url; img.onerror=()=>{shell.querySelector('.avatar')?.remove(); if(!shell.querySelector('.avatar-fallback')){const d=document.createElement('div');d.className='avatar-fallback';d.textContent=initials(user);shell.prepend(d);}}; shell.appendChild(img); }
      else { const d=document.createElement('div'); d.className='avatar-fallback'; d.textContent=initials(user); shell.appendChild(d); }
      if(canEditTarget()){
        const tools=document.createElement('div'); tools.className='avatar-tools';
        if(isOwnProfile()) tools.appendChild(makeVisibilityButton('avatar','照片','avatar-tool'));
        const edit=document.createElement('button'); edit.type='button'; edit.className='avatar-tool'; edit.textContent='✎'; edit.title='更換照片'; edit.setAttribute('aria-label','更換照片'); edit.addEventListener('click',chooseAvatar); tools.appendChild(edit); shell.appendChild(tools);
      }
      wrap.appendChild(shell);
    }
    async function compressAvatar(file){
      if(!file || !String(file.type||'').startsWith('image/')) throw new Error('請選擇圖片檔');
      if(file.size>12*1024*1024) throw new Error('照片請小於 12MB');
      const source=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(new Error('讀取照片失敗'));reader.readAsDataURL(file);});
      const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('照片格式無法讀取'));img.src=source;});
      const size=Math.min(image.naturalWidth||image.width,image.naturalHeight||image.height); if(!size) throw new Error('照片尺寸無效');
      const canvas=document.createElement('canvas'); canvas.width=512; canvas.height=512; const ctx=canvas.getContext('2d'); if(!ctx) throw new Error('瀏覽器無法處理照片');
      const sx=((image.naturalWidth||image.width)-size)/2; const sy=((image.naturalHeight||image.height)-size)/2; ctx.drawImage(image,sx,sy,size,size,0,0,512,512);
      return canvas.toDataURL('image/jpeg',0.88);
    }
    function chooseAvatar(){
      if(!canEditTarget()) return; const input=document.createElement('input'); input.type='file'; input.accept='image/*'; input.className='hidden';
      input.addEventListener('change',async()=>{const file=input.files?.[0]; if(!file)return; try{toast('正在處理照片…');const avatar=await compressAvatar(file);await saveAvatar(avatar);}catch(e){toast(e.message||'照片修改失敗',true);}finally{input.remove();}});
      document.body.appendChild(input); input.click();
    }
    async function saveAvatar(avatar){
      const path=state.isSuperAdmin && !isOwnProfile()?'/api/admin/members/'+encodeURIComponent(state.targetUserId):'/api/profile';
      try{const data=await api(path,{method:'PUT',body:JSON.stringify({avatar})});renderProfile(data.user);toast('照片已更新');}catch(e){toast(e.message||'照片儲存失敗',true);}
    }
    function badge(text, admin=false){ const el=document.createElement('span'); el.className='badge'+(admin?' admin':''); el.textContent=text; return el; }
    function renderBadges(user){ const box=$('badges'); box.replaceChildren(); const rank=(user.approvedRank||user.rank||'').trim(); if(rank) box.appendChild(badge(rank)); if(state.isSuperAdmin && state.targetUserId===state.session?.user?.id) box.appendChild(badge('Super Admin',true)); if(state.targetUserId!==state.session?.user?.id) box.appendChild(badge('管理中的會員')); }
    function canEditField(field){ if(field==='rank') return state.isSuperAdmin; return true; }
    function isNumeric(field){ return field==='talentNumber'||field==='lifeNumber'; }
    function renderFields(user){
      const root=$('fields'); root.replaceChildren();
      for(const [field,label,wide] of editable){
        const editableNow=canEditField(field); const card=document.createElement('div'); card.className='field'+(wide?' wide':'')+(editableNow?'':' readonly'); card.dataset.field=field;
        const l=document.createElement('div'); l.className='field-label'; l.textContent=label; const v=document.createElement('div'); v.className='field-value'; const value=user[field]===null||user[field]===undefined?'':String(user[field]); v.textContent=value||'尚未填寫'; if(!value) v.classList.add('empty'); card.append(l,v); if(field==='amwayId'&&user.spouseName){ const spouse=document.createElement('div'); spouse.className='spouse-link'; spouse.textContent='夫妻綁定：'+user.spouseName; card.appendChild(spouse); }
        if(isOwnProfile()){
          const eye=makeVisibilityButton(field,label,'field-eye'); if(!editableNow) eye.style.right='8px'; card.appendChild(eye);
        }
        if(editableNow){ const b=document.createElement('button'); b.className='edit'; b.type='button'; b.title='編輯'+label; b.setAttribute('aria-label','編輯'+label); b.textContent='✎'; b.addEventListener('click',()=>beginEdit(card,field,label,wide)); card.appendChild(b); }
        else { const hint=document.createElement('div'); hint.className='field-hint'; hint.textContent='獎銜由超級管理員維護'; card.appendChild(hint); }
        root.appendChild(card);
      }
    }
    function renderProfile(user){ state.user=user; state.targetUserId=user.id; renderAvatar(user); $('displayName').textContent=user.name||'尚未填寫姓名'; $('displayEmail').textContent=user.email||''; renderBadges(user); renderFields(user); renderMemberActive(); }
    async function saveField(field,value,card){ card.classList.add('saving'); try{ const path=state.isSuperAdmin && state.targetUserId!==state.session.user.id ? '/api/admin/members/'+encodeURIComponent(state.targetUserId) : '/api/profile'; const data=await api(path,{method:'PUT',body:JSON.stringify({[field]:value})}); renderProfile(data.user); toast('已儲存 '+editable.find(x=>x[0]===field)?.[1]); }catch(e){ card.classList.remove('saving'); renderFields(state.user); toast(e.message||'儲存失敗',true); } }
    function beginEdit(card,field,label,wide){ if(card.querySelector('.field-editor')) return; const value=state.user[field]===null||state.user[field]===undefined?'':String(state.user[field]); const display=card.querySelector('.field-value'); const edit=card.querySelector('.edit'); if(edit) edit.classList.add('hidden'); const input=wide?document.createElement('textarea'):document.createElement('input'); input.className='field-editor'; if(wide) input.rows=3; if(isNumeric(field)) input.inputMode='numeric'; input.value=value; display.replaceWith(input); let done=false; const cancel=()=>{ if(done)return; done=true; renderFields(state.user); }; const commit=()=>{ if(done)return; done=true; const next=input.value.trim(); if(next===value){renderFields(state.user);return;} saveField(field,next,card); }; input.addEventListener('keydown',(event)=>{ if(event.key==='Escape'){event.preventDefault();cancel();return;} if(event.key==='Enter' && (!wide || event.ctrlKey || event.metaKey)){event.preventDefault();commit();} }); input.addEventListener('blur',()=>{ if(!done) commit(); }); input.focus(); input.select(); }
    function renderMemberActive(){ document.querySelectorAll('.member-item').forEach(el=>el.classList.toggle('active',el.dataset.id===state.targetUserId)); }
    function showLoggedIn(){ $('loginView').classList.add('hidden'); $('memberView').classList.remove('hidden'); $('topActions').hidden=false; $('adminBtn').classList.toggle('hidden',!state.isSuperAdmin); }
    function showLoggedOut(){ state.session=null; state.user=null; state.targetUserId=null; state.visibility=null; $('topActions').hidden=true; $('memberView').classList.add('hidden'); $('loginView').classList.remove('hidden'); initGoogle(); }
    async function loadSession(){ try{ const data=await api('/api/session'); state.session=data; state.isSuperAdmin=Boolean(data.isSuperAdmin); state.targetUserId=data.user.id; await loadOwnVisibility(); showLoggedIn(); renderProfile(data.user); }catch{ showLoggedOut(); } }
    async function handleCredential(response){ $('loginStatus').textContent='正在登入…'; try{ await api('/api/google-sync',{method:'POST',body:JSON.stringify({credential:response.credential,appId:'starry-id'})}); $('loginStatus').textContent='登入成功'; await loadSession(); }catch(e){ $('loginStatus').textContent=e.message||'登入失敗'; toast(e.message||'登入失敗',true); } }
    function initGoogle(){ const start=Date.now(); const tick=()=>{ if(window.google?.accounts?.id){ try{ google.accounts.id.initialize({client_id:CLIENT_ID,callback:handleCredential,auto_select:false,cancel_on_tap_outside:true}); $('googleButton').replaceChildren(); google.accounts.id.renderButton($('googleButton'),{theme:'outline',size:'large',shape:'pill',text:'signin_with',locale:'zh_TW',width:280}); $('loginStatus').textContent=''; }catch(e){ $('loginStatus').textContent='Google 登入載入失敗，請重新整理。'; } return; } if(Date.now()-start<8000) setTimeout(tick,120); else $('loginStatus').textContent='Google 登入載入較慢，請重新整理再試。'; }; tick(); }
    async function loadMembers(search=''){ try{ const data=await api('/api/admin/members?search='+encodeURIComponent(search)); state.members=data.members||[]; $('memberCount').textContent=String(data.total||state.members.length); const root=$('members'); root.replaceChildren(); for(const member of state.members){ const b=document.createElement('button'); b.className='member-item'; b.type='button'; b.dataset.id=member.id; const n=document.createElement('strong'); n.textContent=member.name||'(未填姓名)'; const meta=document.createElement('span'); meta.textContent=[member.email,member.approvedRank||member.rank].filter(Boolean).join(' · '); b.append(n,meta); b.addEventListener('click',()=>openMember(member.id)); root.appendChild(b); } renderMemberActive(); }catch(e){ toast(e.message||'會員清單讀取失敗',true); } }
    async function openMember(id){ try{ const data=await api('/api/admin/members/'+encodeURIComponent(id)); renderProfile(data.user); }catch(e){ toast(e.message||'會員資料讀取失敗',true); } }
    function toggleAdmin(force){ if(!state.isSuperAdmin)return; state.adminOpen=typeof force==='boolean'?force:!state.adminOpen; $('adminPanel').classList.toggle('hidden',!state.adminOpen); $('memberView').classList.toggle('admin-open',state.adminOpen); if(state.adminOpen) loadMembers($('memberSearch').value.trim()); }
    $('adminBtn').addEventListener('click',()=>toggleAdmin());
    $('myCardBtn').addEventListener('click',async()=>{ if(state.session?.user){ await loadOwnVisibility(); renderProfile(state.session.user); if(window.innerWidth<761) toggleAdmin(false); } });
    $('logoutBtn').addEventListener('click',async()=>{ try{await api('/api/logout',{method:'POST',body:'{}'});}catch{} showLoggedOut(); });
    let searchTimer; $('memberSearch').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>loadMembers($('memberSearch').value.trim()),220);});
    document.addEventListener('click',(event)=>{const target=event.target;if(target?.id==='v211Close'||target?.classList?.contains('v211-settings'))setTimeout(async()=>{if(isOwnProfile()){await loadOwnVisibility();renderProfile(state.user);}},120);});
    loadSession();
  })();
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': NOINDEX,
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://accounts.google.com; frame-src https://accounts.google.com; connect-src 'self' https://accounts.google.com; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' https://accounts.google.com; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
    }
  });
}