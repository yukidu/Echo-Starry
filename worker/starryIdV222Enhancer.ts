export function enhanceStarryIdV222MemberCenter(html: string): string {
  const css = String.raw`<style id="v222-style">
    .topbar{width:100vw!important;max-width:none!important;left:50%!important;transform:translateX(-50%)!important;top:0!important;margin:0 0 22px!important;padding:12px max(16px,calc((100vw - 1060px)/2))!important;border:0!important;border-bottom:1px solid #304363!important;border-radius:0!important;background:rgba(9,17,33,.97)!important;box-shadow:0 6px 24px #0002!important}
    .topbar .brand{flex-shrink:0!important}.topbar .top-actions{flex:0 1 auto!important}
    .top-actions #myCardBtn{font-size:15px!important;font-weight:800!important;padding:10px 16px!important;min-height:42px!important}
    .v224-checkbox{display:flex;align-items:center;gap:9px;margin:10px 0;color:inherit;font-size:14px}.v224-checkbox input{width:19px;height:19px;accent-color:#729cff}.v224-spouse{margin-top:14px}.v222-combobox,.v222-relation{width:100%;position:relative;min-width:0}.v222-current{width:100%;min-height:44px;display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:left;padding:10px 12px;border-radius:12px;border:1px solid #607aa2;background:#172943;color:#f8fbff;cursor:pointer}.v222-dropdown{position:relative;z-index:30;background:#101f38;border:1px solid #58729a;border-radius:14px;padding:8px;margin-top:5px;box-shadow:0 16px 32px #0007}.v222-filter{width:100%;border-radius:10px;border:1px solid #516b93;background:#0b172c;color:#fff;padding:9px}.v222-options{display:grid;gap:3px;max-height:220px;overflow:auto;margin-top:7px}.v222-option{width:100%;padding:10px 11px;text-align:left;border:0;border-radius:9px;background:transparent;color:#e9f1ff;cursor:pointer}.v222-option:hover,.v222-option:focus-visible{background:#314d78}.v222-option[aria-selected="true"]{background:#274b72;font-weight:800}.v222-editor{width:100%;min-height:43px;border:1px solid #607aa2;background:#0c1c32;color:#f8fbff;border-radius:12px;padding:10px 12px}.v222-motto-actions{display:flex;gap:8px;align-items:center;margin-top:8px}.v222-random{border:1px solid #5678a8;background:#1c3656;color:#f5f9ff;border-radius:11px;padding:8px 12px;font-weight:800;cursor:pointer}.v222-help{font-size:12px;color:#a8bddc;margin:6px 0}.v222-results{max-height:255px;overflow:auto;display:grid;gap:5px;background:#0b1b31;border:1px solid #607aa2;border-radius:12px;padding:7px;margin-top:5px}.v222-person{display:flex;align-items:center;gap:9px;width:100%;border:0;background:#172a46;color:#fff;text-align:left;border-radius:10px;padding:9px;cursor:pointer}.v222-person:hover{background:#294669}.v222-person img,.v222-initial{width:38px;height:38px;border-radius:50%;object-fit:cover;background:#354a6a;display:grid;place-items:center;flex:0 0 38px}.v222-person-name{font-weight:800}.v222-person-meta{font-size:12px;color:#bdd0e8;line-height:1.45}.v222-num{margin-top:16px;padding:18px;border-radius:20px;border:1px solid #344c72;background:#0e1c33}.v222-num-title{font-size:17px;font-weight:800;margin-bottom:10px}.v222-num-summary{font-size:12px;color:#c6d4ea;line-height:1.6;margin-bottom:12px}.v222-num-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;max-width:320px;margin:auto}.v222-num-cell{aspect-ratio:1;border-radius:14px;border:1px solid #344b6b;background:#152741;padding:6px}.v222-num-cell svg{width:100%;height:100%}.v222-num-ring{fill:none;stroke-width:2}.v222-num-cell text{font-size:25px;font-weight:900;fill:#f5f9ff}.v222-num-note{font-size:11px;color:#9cb3d1;text-align:center;margin-top:10px}
    html[data-starry-theme="light"]{color-scheme:light;--bg:#f1f5fb;--panel:#fff;--panel2:#f5f8fd;--line:#c8d4e5;--text:#14213b;--muted:#52647e;--shadow:0 12px 34px #243b5b18}
    html[data-starry-theme="light"] body{background:#f1f5fb!important;color:#14213b!important}
    html[data-starry-theme="light"] .topbar{background:#fff!important;border-color:#d0dceb!important}
    html[data-starry-theme="light"] .card,html[data-starry-theme="light"] .admin-panel,html[data-starry-theme="light"] .login-card,html[data-starry-theme="light"] .v211-box{background:#fff!important;color:#14213b!important;border-color:#ccd8e7!important}
    html[data-starry-theme="light"] .brand h1,html[data-starry-theme="light"] .identity-main h2,html[data-starry-theme="light"] .field-value,html[data-starry-theme="light"] .field-label,html[data-starry-theme="light"] .v222-num-title{color:#14213b!important}
    html[data-starry-theme="light"] .field,html[data-starry-theme="light"] .member-item{background:#f7faff!important;color:#14213b!important;border-color:#ccd8e7!important}
    html[data-starry-theme="light"] .btn:not(.primary),html[data-starry-theme="light"] .edit,html[data-starry-theme="light"] .field-eye,html[data-starry-theme="light"] .avatar-tool{color:#182b48!important;background:#fff!important;border-color:#b8c8dd!important}
    html[data-starry-theme="light"] .v222-current,html[data-starry-theme="light"] .v222-editor,html[data-starry-theme="light"] .v222-filter,html[data-starry-theme="light"] .v222-random{background:#fff;color:#15243e;border-color:#afc1d9}
    html[data-starry-theme="light"] .v222-dropdown,html[data-starry-theme="light"] .v222-results{background:#fff;border-color:#bccbe0;box-shadow:0 12px 30px #243b5b20}
    html[data-starry-theme="light"] .v222-option,html[data-starry-theme="light"] .v222-person{background:#f4f7fc;color:#17243b}
    html[data-starry-theme="light"] .v222-option:hover,html[data-starry-theme="light"] .v222-person:hover{background:#e2ecf8}
    html[data-starry-theme="light"] .v222-option[aria-selected="true"]{background:#dbe9fb}
    html[data-starry-theme="light"] .v222-person-meta,html[data-starry-theme="light"] .v222-help,html[data-starry-theme="light"] .v222-num-summary,html[data-starry-theme="light"] .v222-num-note{color:#52647e}
    html[data-starry-theme="light"] .v222-num{background:#f8fbff;border-color:#c8d4e5}
    html[data-starry-theme="light"] .v222-num-cell{background:#fff;border-color:#c8d4e5}
    html[data-starry-theme="light"] .v222-num-cell text{fill:#17243b}
    html[data-starry-theme="light"] .v216-menu{background:#fff!important;color:#14213b!important}
    html[data-starry-theme="light"] .v220-theme{color:#14213b!important}
    .v226-spouse{grid-column:1/-1!important;display:flex;flex-direction:column;gap:9px;padding:15px 16px!important;margin:2px 0 14px!important;border:1px solid #47648a!important;border-radius:16px!important;background:linear-gradient(125deg,#142943,#1c3552)!important;box-shadow:none!important}
    .v226-spouse .v222-num-title{font-size:14px!important;letter-spacing:.03em;margin:0!important;color:#c6d9f5!important}
    .v226-spouse .v222-help{font-size:15px!important;font-weight:750;line-height:1.6;color:#fff!important;margin:0!important}
    .v226-spouse .v222-motto-actions{margin-top:0!important;flex-wrap:wrap}
    .v226-spouse .v224-checkbox{margin:4px 0 0!important;font-size:13px}
    html[data-starry-theme="light"] .v226-spouse{background:linear-gradient(125deg,#f5f9ff,#eaf2ff)!important;border-color:#bfd1ea!important}
    html[data-starry-theme="light"] .v226-spouse .v222-help{color:#173354!important}
    html[data-starry-theme="light"] .v226-spouse .v222-num-title{color:#42618c!important}
    .v226-dialog-overlay{position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;padding:20px;background:rgba(4,11,25,.74);backdrop-filter:blur(7px)}
    .v226-dialog{box-sizing:border-box;width:min(100%,420px);max-height:min(90dvh,640px);overflow:auto;padding:25px 23px 22px;border:1px solid #6383ae;border-radius:23px;background:linear-gradient(160deg,#1a3353,#0e1b30);color:#f7faff;box-shadow:0 28px 75px #0009}
    .v226-dialog-mark{width:49px;height:49px;border-radius:15px;display:grid;place-items:center;background:#274d78;color:#d6e9ff;font-size:24px;margin-bottom:14px}
    .v226-dialog h2{font-size:21px;font-weight:850;line-height:1.4;margin:0 0 7px;color:#fff}
    .v226-dialog-intro{font-size:14px;line-height:1.65;color:#b9cbe4;margin:0 0 17px}
    .v226-dialog-person{padding:14px 16px;border:1px solid #4d709c;border-radius:15px;background:#10253f;display:grid;gap:11px}
    .v226-dialog-row{display:flex;align-items:baseline;gap:13px;font-size:15px;line-height:1.5}
    .v226-dialog-row span{flex:0 0 43px;color:#9fb8db;font-size:13px}
    .v226-dialog-row strong{color:#fff;overflow-wrap:anywhere}
    .v226-dialog-note{font-size:13px;color:#d1dded;line-height:1.7;margin:15px 0 20px}
    .v226-dialog-actions{display:flex;gap:10px}
    .v226-dialog-actions button{flex:1;min-height:46px;border-radius:12px;border:1px solid #6883a8;background:#233c5c;color:#f7faff;font-size:15px;font-weight:800;cursor:pointer}
    .v226-dialog-actions .v226-confirm{border-color:#8bb5ef;background:linear-gradient(120deg,#4a87d3,#3269b5);color:#fff}
    .v226-dialog-actions button:focus-visible{outline:3px solid #f7c96d;outline-offset:2px}
    html[data-starry-theme="light"] .v226-dialog{background:linear-gradient(160deg,#fff,#f0f6ff);border-color:#c1d2e8;color:#172e4b}
    html[data-starry-theme="light"] .v226-dialog h2,html[data-starry-theme="light"] .v226-dialog-row strong{color:#142a48}
    html[data-starry-theme="light"] .v226-dialog-intro,html[data-starry-theme="light"] .v226-dialog-note{color:#455d7b}
    html[data-starry-theme="light"] .v226-dialog-person{background:#eaf2fc;border-color:#c1d3eb}
    html[data-starry-theme="light"] .v226-dialog-row span{color:#587498}
    @media(max-width:760px){.topbar{padding:9px 12px!important}.top-actions #myCardBtn{font-size:15px!important;min-width:96px!important;min-height:44px!important;padding:10px 13px!important}.brand .star{width:38px!important;height:38px!important;flex-basis:38px!important}.brand h1{font-size:17px!important}.v222-num{padding:13px}.v222-num-grid{gap:6px}}
  </style>`;
  const js = String.raw`<script id="v222-script">(()=>{
    window.__starryV222=true;
    const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>Array.from(r.querySelectorAll(s));
    let active=null,busy=false,optionsCache=null,sessionId='';
    const SELECT=new Set(['residence','center','rank','joinReason','stayReason']);
    const RELATION=new Set(['sponsor','platinumUpline','diamondUpline']);
    const DERIVED=new Set(['talentNumber','lifeNumber','zodiac']);
    async function api(path,opt={}){const r=await fetch(path,{credentials:'same-origin',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'操作失敗');return d}
    function notify(msg){const t=q('#toast');if(t){t.textContent=msg;t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),2800)}else alert(msg)}
    function confirmSpousePartner(partner,number){
      return new Promise(resolve=>{
        const overlay=document.createElement('div');overlay.className='v226-dialog-overlay';
        const dialog=document.createElement('section');dialog.className='v226-dialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','v226DialogTitle');
        const mark=document.createElement('div');mark.className='v226-dialog-mark';mark.textContent='♡';
        const title=document.createElement('h2');title.id='v226DialogTitle';title.textContent='確認夫妻綁定';
        const intro=document.createElement('p');intro.className='v226-dialog-intro';intro.textContent='此直銷商編號已由以下會員使用，請核對對方資料：';
        const person=document.createElement('div');person.className='v226-dialog-person';
        for(const [label,val] of [['姓名',partner.name],['獎銜',partner.rank],['會場',partner.center],['編號',number]]){
          const row=document.createElement('div');row.className='v226-dialog-row';const key=document.createElement('span');key.textContent=label;const value=document.createElement('strong');value.textContent=val||'未設定';row.append(key,value);person.append(row);
        }
        const note=document.createElement('p');note.className='v226-dialog-note';note.textContent='確認後立即建立夫妻關係，無須另一方同意。請確認對方身分正確。';
        const actions=document.createElement('div');actions.className='v226-dialog-actions';
        const cancel=document.createElement('button');cancel.type='button';cancel.textContent='返回修改';
        const confirm=document.createElement('button');confirm.type='button';confirm.className='v226-confirm';confirm.textContent='確認綁定';
        const previous=document.activeElement;
        function finish(ok){document.removeEventListener('keydown',onKey,true);overlay.remove();if(previous?.isConnected)previous.focus();resolve(ok)}
        function onKey(e){if(e.key==='Escape'){e.preventDefault();finish(false)}else if(e.key==='Tab'){const next=e.shiftKey?cancel:confirm;if(document.activeElement=== (e.shiftKey?cancel:confirm)){e.preventDefault();(e.shiftKey?confirm:cancel).focus()}}}
        cancel.onclick=()=>finish(false);confirm.onclick=()=>finish(true);overlay.onclick=e=>{if(e.target===overlay)finish(false)};
        actions.append(cancel,confirm);dialog.append(mark,title,intro,person,note,actions);overlay.append(dialog);document.body.append(overlay);document.addEventListener('keydown',onKey,true);cancel.focus();
      });
    }
    function display(value){const d=document.createElement('div');d.className='field-value'+(value?'':' empty');d.textContent=value||'尚未填寫';return d}
    function targetId(){return q('.member-item.active')?.dataset.id||sessionId}
    function path(){const id=targetId();return id&&sessionId&&id!==sessionId?'/api/admin/members/'+encodeURIComponent(id):'/api/profile'}
    function originalValue(card){const el=q('.field-value',card);return el&&!el.classList.contains('empty')?(el.textContent||''):''}
    function reset(){if(!active)return;const a=active;if(a.editor?.isConnected)a.editor.replaceWith(display(a.original));a.button.textContent='✎';a.button.title='編輯'+(q('.field-label',a.card)?.textContent||'資料');a.button.classList.remove('v216-save');active=null;updateChart()}
    function value(){return active?(active.getValue?active.getValue():active.input?.value||'').trim():''}
    function changed(){return active&&(value()!==active.original||Boolean(active.relatedUserId))}
    async function save(){if(!active||busy)return false;const a=active;const next=value();if(!changed()){reset();return true}busy=true;a.button.disabled=true;try{
      if(a.field==='amwayId'){
        if(targetId()!==sessionId)throw Error('請由會員本人修改直銷商編號');
        const result=await api('/api/distributor-number',{method:'PUT',body:JSON.stringify(a.nonDistributor?.checked?{nonDistributor:true}:{nonDistributor:false,number:next})});
        if(result.requiresConfirmation){
          const partner=result.partner||{};
          if(!await confirmSpousePartner(partner,next))return false;
          const confirmed=await api('/api/distributor-number',{method:'PUT',body:JSON.stringify({nonDistributor:false,number:next,confirmSpouse:true})});
          a.original=confirmed.number;reset();notify('夫妻綁定已成立');refreshSpouse();return true;
        }
        a.original=result.number;reset();notify('編號已更新');refreshSpouse();return true;
      }
      if(RELATION.has(a.field)){
        if(!a.relatedUserId&&next){const result=await api('/api/profile-directory?field='+encodeURIComponent(a.field)+'&search='+encodeURIComponent(next));const exact=(result.members||[]).filter(m=>(m.name||'').trim()===next);if(exact.length){notify('找到同名中央會員，請依會場與獎銜點選正確會員後再儲存');return false}}
        await api('/api/profile-relationship',{method:'PUT',body:JSON.stringify({targetUserId:targetId(),field:a.field,relatedUserId:a.relatedUserId||'',legacyLabel:next})});
      }else await api(path(),{method:'PUT',body:JSON.stringify({[a.field]:next})});
      a.original=next;reset();notify('已手動儲存');return true;
    }catch(e){notify(e.message||'儲存失敗');return false}finally{busy=false;a.button.disabled=false}}
    async function loadOptions(){if(!optionsCache){const data=await api('/api/profile-options');optionsCache=data.options||{}}return optionsCache}
    function makeInput(field,original){const input=document.createElement(field==='motto'?'textarea':'input');input.className='v222-editor';if(field==='motto')input.rows=3;if(field==='birthday'){input.type='date';input.min='1900-01-01';input.max=new Date().toISOString().slice(0,10);const digits=original.replace(/[^0-9]/g,'');input.value=digits.length===8?digits.slice(0,4)+'-'+digits.slice(4,6)+'-'+digits.slice(6):''}else input.value=original;return input}
    async function start(card,button){const field=card.dataset.field;if(DERIVED.has(field))return;const original=originalValue(card);const old=q('.field-value',card);if(!old)return;
      const wrap=document.createElement('div');wrap.className='v222-editor-wrap';let input=null,getValue=null;
      if(field==='amwayId'){
        if(targetId()!==sessionId)throw Error('此欄位請由會員本人修改');
        input=makeInput(field,original);input.inputMode='numeric';input.pattern='[0-9]*';input.placeholder='僅限純數字';
        const label=document.createElement('label');label.className='v224-checkbox';const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=/^n[0-9]{7}$/.test(original);const span=document.createElement('span');span.textContent='非直銷商（自動產生 n＋7 位數編號）';label.append(checkbox,span);input.readOnly=checkbox.checked;checkbox.onchange=async()=>{
          input.readOnly=checkbox.checked;
          if(!checkbox.checked){input.value='';input.placeholder='請輸入純數字';return}
          input.value='正在產生編號…';checkbox.disabled=true;button.disabled=true;
          try{
            const d=await api('/api/distributor-number',{method:'PUT',body:JSON.stringify({nonDistributor:true})});
            input.value=d.number;if(active?.field==='amwayId')active.original=d.number;
            notify('專屬編號：'+d.number+'（已儲存）');refreshSpouse();
          }catch(e){checkbox.checked=false;input.readOnly=false;input.value=original;notify(e.message||'編號產生失敗')}
          finally{checkbox.disabled=false;button.disabled=false}
        };wrap.append(label,input);getValue=()=>checkbox.checked?'__nonDistributor__':input.value;
        wrap._nonDistributor=checkbox;
      }else if(SELECT.has(field)){
        const opts=await loadOptions();const values=Array.isArray(opts[field])?[...opts[field]]:[];if(original&&!values.includes(original))values.unshift(original);
        let selected=original;const combo=document.createElement('div');combo.className='v222-combobox';const current=document.createElement('button');current.type='button';current.className='v222-current';const update=()=>current.textContent=(selected||'請選擇')+'  ▾';update();const dropdown=document.createElement('div');dropdown.className='v222-dropdown';dropdown.hidden=true;const filter=document.createElement('input');filter.type='search';filter.className='v222-filter';filter.placeholder='搜尋中央選項';const list=document.createElement('div');list.className='v222-options';const paint=()=>{list.replaceChildren();const matches=values.filter(v=>v.toLowerCase().includes(filter.value.toLowerCase()));for(const v of matches){const b=document.createElement('button');b.type='button';b.className='v222-option';b.textContent=v;b.setAttribute('aria-selected',String(v===selected));b.onclick=()=>{selected=v;update();dropdown.hidden=true;updateChart()};list.appendChild(b)}if(!matches.length){const e=document.createElement('div');e.className='v222-help';e.textContent='找不到中央選項';list.appendChild(e)}};filter.addEventListener('input',paint);current.onclick=()=>{dropdown.hidden=!dropdown.hidden;if(!dropdown.hidden){paint();filter.focus()}};dropdown.append(filter,list);combo.append(current,dropdown);wrap.append(combo);getValue=()=>selected;
      }else if(RELATION.has(field)){
        const note=document.createElement('div');note.className='v222-help';note.textContent=field==='sponsor'?'請選擇正確推薦人：同名者以會場＋已審核獎銜辨識':field==='platinumUpline'?'搜尋已審核白金以上會員':'搜尋已審核鑽石以上會員';
        input=makeInput(field,original);input.autocomplete='off';input.placeholder='輸入姓名或 Amway ID';const results=document.createElement('div');results.className='v222-results';results.hidden=true;let timer=0,sequence=0;
        const search=async()=>{const term=input.value.trim();active.relatedUserId='';if(!term){results.hidden=true;return}const ticket=++sequence;try{const data=await api('/api/profile-directory?field='+encodeURIComponent(field)+'&search='+encodeURIComponent(term)+'&excludeUserId='+encodeURIComponent(targetId()));if(ticket!==sequence||active?.input!==input)return;results.replaceChildren();const members=data.members||[];for(const m of members){const b=document.createElement('button');b.type='button';b.className='v222-person';const img=m.avatar?document.createElement('img'):document.createElement('div');if(m.avatar){img.src=m.avatar;img.referrerPolicy='no-referrer';img.alt=''}else{img.className='v222-initial';img.textContent=(m.name||'S').slice(0,1)}const info=document.createElement('div');const n=document.createElement('div');n.className='v222-person-name';n.textContent=(field==='sponsor'?m.name:m.displayName)||'未命名會員';const meta=document.createElement('div');meta.className='v222-person-meta';meta.textContent=[m.amwayId||'未設定編號','會場：'+(m.center||'未設定'),'獎銜：'+(m.approvedRank||'未審核')].join(' · ');info.append(n,meta);b.append(img,info);b.onclick=()=>{input.value=(field==='sponsor'?m.name:m.displayName)||m.amwayId||'';active.relatedUserId=m.id;results.hidden=true;notify('已選擇 '+(m.name||'會員')+'（'+(m.center||'未設定會場')+'）')};results.appendChild(b)}if(!members.length){const e=document.createElement('div');e.className='v222-help';e.textContent='查無中央會員；未註冊者可手動填寫';results.appendChild(e)}results.hidden=false}catch{results.hidden=true}};
        input.addEventListener('input',()=>{clearTimeout(timer);active.relatedUserId='';timer=setTimeout(search,220)});wrap.append(input,note,results);if(original)setTimeout(search,50);
      }else{
        input=makeInput(field,original);wrap.append(input);
        if(field==='motto'){const row=document.createElement('div');row.className='v222-motto-actions';const random=document.createElement('button');random.type='button';random.className='v222-random';random.textContent='🎲 隨機';random.onclick=async()=>{random.disabled=true;try{const d=await api('/api/random-motto');input.value=d.motto||'';notify('已抽出一句話，按 ✓ 才會儲存')}catch(e){notify(e.message||'抽選失敗')}finally{random.disabled=false}};row.append(random);wrap.append(row)}
        if(field==='birthday')input.addEventListener('input',()=>updateChart(input.value));
      }
      old.replaceWith(wrap);button.textContent='✓';button.title='手動儲存';button.classList.add('v216-save');active={card,button,field,editor:wrap,input,original,getValue,relatedUserId:'',nonDistributor:wrap._nonDistributor};if(input){input.focus();if(field!=='birthday')input.select()}wrap.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();reset()}else if(e.key==='Enter'&&field!=='motto'){e.preventDefault()}});updateChart();
    }
    window.addEventListener('click',e=>{const b=e.target?.closest?.('button.edit');if(!b)return;const card=b.closest('.field');if(!card||DERIVED.has(card.dataset.field))return;e.preventDefault();e.stopImmediatePropagation();if(busy)return;(async()=>{if(active){if(active.button===b){await save();return}if(changed()){const yes=window.confirm('上一個欄位尚未儲存。\\n按「確定」儲存修改；按「取消」放棄修改。');if(yes){if(!await save())return}else reset()}else reset()}try{await start(card,b)}catch(err){notify(err.message||'無法開啟修改模式')}})()},true);
    function num(birthday){const clean=(birthday||'').replace(/[^0-9]/g,'');if(clean.length!==8)return null;const year=+clean.slice(0,4),month=+clean.slice(4,6),day=+clean.slice(6,8);const dt=new Date(Date.UTC(year,month-1,day));if(dt.getUTCFullYear()!==year||dt.getUTCMonth()!==month-1||dt.getUTCDate()!==day)return null;const digits=clean.split('').map(Number),talent=digits.reduce((a,b)=>a+b,0);let life=talent;while(life>9)life=String(life).split('').reduce((a,b)=>a+ +b,0);let birth=day;while(birth>9)birth=String(birth).split('').reduce((a,b)=>a+ +b,0);const zodiac=['摩羯座','水瓶座','雙魚座','牡羊座','金牛座','雙子座','巨蟹座','獅子座','處女座','天秤座','天蠍座','射手座'];const cuts=[20,19,21,20,21,22,23,23,23,24,23,22];const index=(day<cuts[month-1]?month-1:month)%12;const z=zodiac[index];const zn={'牡羊座':1,'金牛座':2,'雙子座':3,'巨蟹座':4,'獅子座':5,'處女座':6,'天秤座':7,'天蠍座':8,'射手座':9,'摩羯座':1,'水瓶座':2,'雙魚座':3}[z];const counts={};digits.forEach(d=>{if(d>0)counts[d]=(counts[d]||0)+1});return{digits,talent,life,birth,z,zn,counts}}
    function updateChart(override){const fields=q('#fields');if(!fields)return;qa('.field',fields).forEach(c=>{if(DERIVED.has(c.dataset.field))c.remove()});let chart=q('#v222Chart');if(!chart){chart=document.createElement('section');chart.id='v222Chart';chart.className='v222-num';fields.after(chart)}let birthday=override;if(birthday===undefined){const birth=q('.field[data-field="birthday"] .field-value',fields);birthday=birth&&!birth.classList.contains('empty')?birth.textContent:''}const data=num(birthday);chart.replaceChildren();const title=document.createElement('div');title.className='v222-num-title';title.textContent='生命靈數九宮格 · 依生日自動計算';chart.append(title);if(!data){const note=document.createElement('div');note.className='v222-help';note.textContent='選擇出生年月日後，即時顯示生命靈數圖';chart.append(note);return}const summary=document.createElement('div');summary.className='v222-num-summary';summary.textContent='星座：'+data.z+'　｜　生日數：'+data.birth+'　｜　天賦數：'+data.talent+'　｜　命數：'+data.life;chart.append(summary);const grid=document.createElement('div');grid.className='v222-num-grid';for(const n of [1,4,7,2,5,8,3,6,9]){const cell=document.createElement('div');cell.className='v222-num-cell';const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 100 100');const rings=[...Array(data.counts[n]||0).fill('#e2e8f0'),...(n===data.birth?['#fbbf24']:[]),...(n===data.zn?['#a855f7']:[]),...Array(String(data.talent).split('').filter(d=>+d===n).length).fill('#84cc16'),...(n===data.life?['#ef4444']:[])];rings.forEach((color,i)=>{const c=document.createElementNS('http://www.w3.org/2000/svg','circle');c.setAttribute('cx','50');c.setAttribute('cy','50');c.setAttribute('r',String(rings.length===1?26:19+i*25/Math.max(1,rings.length-1)));c.setAttribute('stroke',color);c.setAttribute('class','v222-num-ring');svg.append(c)});const t=document.createElementNS('http://www.w3.org/2000/svg','text');t.setAttribute('x','50');t.setAttribute('y','50');t.setAttribute('text-anchor','middle');t.setAttribute('dominant-baseline','central');t.textContent=String(n);svg.append(t);cell.append(svg);grid.append(cell)}chart.append(grid);const note=document.createElement('div');note.className='v222-num-note';note.textContent='白：先天數　黃：生日數　紫：星座數　綠：天賦數　紅：命數';chart.append(note)}
    let spouseTimer=0;
    async function refreshSpouse(){
      const fields=q('#fields');if(!fields||!sessionId)return;
      if(targetId()!==sessionId){q('#v224Spouse')?.remove();return}
      let panel=q('#v224Spouse');
      const numberField=q('.field[data-field="amwayId"]',fields);
      if(!numberField)return;
      if(!panel){panel=document.createElement('section');panel.id='v224Spouse';panel.className='v226-spouse'}
      if(panel.previousElementSibling!==numberField)numberField.after(panel);
      try{
        const d=await api('/api/spouse-status');panel.replaceChildren();
        const h=document.createElement('div');h.className='v222-num-title';h.textContent='夫妻會員關係';panel.append(h);
        const line=document.createElement('div');line.className='v222-help';const l=d.spouse;
        line.textContent=!l?'目前尚未綁定夫妻':l.status==='active'?'已與 '+l.partnerName+' 綁定夫妻':l.status==='pending'?'與 '+l.partnerName+' 的夫妻綁定待確認':'與 '+l.partnerName+' 的解除綁定待確認';
        panel.append(line);
        const controls=document.createElement('div');controls.className='v222-motto-actions';panel.append(controls);
        function btn(label,click){const b=document.createElement('button');b.type='button';b.className='v222-random';b.textContent=label;b.onclick=async()=>{b.disabled=true;try{await click();await refreshSpouse()}catch(e){notify(e.message||'操作失敗')}finally{b.disabled=false}};controls.append(b)}
        const act=(action,extra={})=>api('/api/spouse-action',{method:'POST',body:JSON.stringify({action,...extra})});
        if(l?.status==='pending'){
          if(l.requestedBy===sessionId)btn('取消綁定申請',()=>act('cancel'));
          else {btn('確認夫妻綁定',async()=>{if(!confirm('確定與 '+l.partnerName+' 共用直銷商編號 '+d.number+'？'))return;await act('approve',{number:d.number})});btn('拒絕申請',()=>act('reject'))}
        }
        if(l?.status==='active')btn('解除夫妻綁定',async()=>{
          const keepSelf=confirm('解除夫妻關係：按「確定」由你保留原直銷商編號；按「取消」由對方保留。下一步仍需另一方確認。');
          let replacement='';
          if(!keepSelf){replacement=prompt('請輸入你解除後的新直銷商編號（純數字），或輸入 nonDistributor 改為非直銷商');if(!replacement)return}
          await act('request-unlink',{keepUserId:keepSelf?sessionId:l.partnerId,replacement});
          notify('已提出解除申請，待另一位會員確認');
        });
        if(l?.status==='unlink_pending'){
          if(l.unlinkRequestedBy===sessionId)btn('取消解除申請',()=>act('cancel-unlink'));
          else btn('確認解除夫妻綁定',async()=>{
            if(!confirm('確定解除與 '+l.partnerName+' 的夫妻關係？'))return;
            let replacement='';
            if(l.keepUserId!==sessionId){replacement=prompt('請輸入你解除後的新直銷商編號（純數字），或輸入 nonDistributor 改為非直銷商');if(!replacement)return}
            await act('approve-unlink',{replacement});notify('夫妻關係已解除');
          });
        }
        if(l?.status==='active'){
          const label=document.createElement('label');label.className='v224-checkbox';const toggle=document.createElement('input');toggle.type='checkbox';
          const settings=await api('/api/card-settings');toggle.checked=Boolean(settings.visibility?.spouse);
          label.append(toggle,document.createTextNode('在公開電子名片顯示夫妻關係'));panel.append(label);
          toggle.onchange=async()=>{try{await api('/api/card-settings',{method:'PUT',body:JSON.stringify({visibility:{spouse:toggle.checked}})});notify('電子名片顯示設定已儲存')}catch(e){toggle.checked=!toggle.checked;notify(e.message)}};
        }
      }catch{panel.textContent='夫妻關係資料暫時無法讀取'}
    }
    const fields=q('#fields');if(fields){const observer=new MutationObserver(mutations=>{if(mutations.every(m=>m.target.closest?.('#v224Spouse')))return;if(!active)updateChart();clearTimeout(spouseTimer);spouseTimer=setTimeout(refreshSpouse,150)});observer.observe(fields,{childList:true});updateChart()}

    api('/api/session').then(d=>{sessionId=d.user?.id||'';refreshSpouse()}).catch(()=>undefined);
  })();</script>`;
  return html.replace('</head>', css + '</head>').replace('</body>', js + '</body>');
}
