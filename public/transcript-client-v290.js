(() => {
  if (window.__starryTranscriptV290) return;
  window.__starryTranscriptV290 = true;

  const LANGUAGES = [
    ['zh-Hant','原音字幕'],['zh-Hans','简体中文'],['en','English'],['vi','Tiếng Việt'],
    ['id','Bahasa Indonesia'],['yue','粵語'],['ja','日本語'],['ko','한국어'],['fr','Français'],
    ['hi','हिन्दी'],['es','Español'],['th','ไทย'],['ms','Bahasa Melayu'],['de','Deutsch'],
    ['pt','Português'],['ar','العربية']
  ];
  const BREAKS = new Set(['，','。','！',',','.','!']);
  const state = {
    tracks: null, trackId: '', language: 'zh-Hant', data: null, sourceSegments: [], units: [],
    activeIndex: -1, generation: 0, sourceController: null, translateBusy: false,
    identityTimer: 0, paintTimer: 0, retryTimer: 0, overlayMoved: false, drag: null, longPressTimer: 0
  };

  const style = document.createElement('style');
  style.textContent =
    '.v290-panel{margin:.65rem 0;border:1px solid rgba(244,63,94,.18);border-radius:1.5rem;background:rgba(255,255,255,.94);padding:.85rem;box-shadow:0 6px 22px rgba(15,23,42,.06)}'+
    '.dark .v290-panel{background:rgba(15,23,42,.94);border-color:rgba(148,163,184,.18)}'+
    '.v290-head{display:flex;align-items:center;gap:.55rem;margin-bottom:.65rem}.v290-title{font-weight:950;font-size:1rem;color:#0f172a;line-height:1.2}.dark .v290-title{color:#f8fafc}'+
    '.v290-tools{margin-left:auto;display:flex;align-items:center;gap:.4rem;position:relative}.v290-btn{border:1px solid rgba(148,163,184,.3);border-radius:.85rem;padding:.55rem .7rem;background:rgba(255,255,255,.94);color:#334155;font-weight:900;font-size:.78rem;cursor:pointer;white-space:nowrap}.dark .v290-btn{background:rgba(30,41,59,.94);color:#f8fafc}.v290-btn:disabled{opacity:.65;cursor:wait}'+
    '.v290-translate{display:inline-flex;align-items:center;gap:.35rem}.v290-icon{display:inline-grid;grid-template-columns:auto auto;gap:.02rem;align-items:center;font-weight:950;border:1.5px solid currentColor;border-radius:.28rem;padding:.13rem .2rem;line-height:1}.v290-icon b,.v290-icon i{font-style:normal;font-size:.68rem}'+
    '.v290-menu{position:absolute;right:0;top:calc(100% + .4rem);z-index:2147483646;width:min(15rem,82vw);max-height:19rem;overflow:auto;padding:.35rem;border:1px solid rgba(148,163,184,.3);border-radius:1rem;background:rgba(255,255,255,.99);box-shadow:0 14px 38px rgba(15,23,42,.28)}.dark .v290-menu{background:rgba(15,23,42,.99)}.v290-menu[hidden]{display:none!important}'+
    '.v290-option{display:block;width:100%;border:0;border-radius:.7rem;padding:.64rem .72rem;background:transparent;color:#334155;text-align:left;font:800 .88rem/1.25 system-ui;cursor:pointer}.v290-option:hover,.v290-option.is-active{background:#f1f5f9}.dark .v290-option{color:#f8fafc}.dark .v290-option:hover,.dark .v290-option.is-active{background:#1e293b}'+
    '.v290-stage{min-height:7rem;border-radius:1.25rem;padding:1rem .8rem;background:linear-gradient(180deg,rgba(255,241,242,.92),rgba(255,255,255,.72));display:flex;align-items:center;justify-content:center;overflow:hidden}.dark .v290-stage{background:linear-gradient(180deg,rgba(136,19,55,.22),rgba(15,23,42,.5))}'+
    '.v290-line{width:100%;border:0;background:transparent;padding:.2rem .25rem;text-align:center;font-family:inherit;cursor:pointer;overflow-wrap:anywhere;word-break:break-word;font-size:1.55rem;font-weight:950;line-height:1.5;color:var(--color-primary,#c06c84)}.dark .v290-line{color:#f8fafc}.v290-line:disabled{cursor:default}'+
    '.v290-meta{padding:.45rem .2rem 0;color:#94a3b8;font:800 .68rem/1.35 ui-monospace,SFMono-Regular,Menlo,monospace}.v290-status{padding:.8rem;border-radius:1rem;background:#fff7ed;color:#9a3412;font-size:.82rem;line-height:1.5}.dark .v290-status{background:rgba(124,45,18,.22);color:#fdba74}.v290-unlock{width:100%;margin-top:.6rem;border:0;border-radius:1rem;padding:.72rem .85rem;background:var(--color-primary,#c06c84);color:#fff;font-weight:900;cursor:pointer}'+
    '.v290-toast{margin:.45rem 0;padding:.45rem .6rem;border-radius:.75rem;background:#ecfdf5;color:#047857;font-size:.75rem;font-weight:800}.dark .v290-toast{background:rgba(6,78,59,.3);color:#6ee7b7}'+
    '.v290-editor{border:1px solid #fda4af;border-radius:1rem;padding:.6rem;background:#fff;margin-top:.55rem}.dark .v290-editor{background:#0f172a;border-color:#9f1239}.v290-editor textarea{width:100%;min-height:5rem;resize:vertical;border:1px solid #cbd5e1;border-radius:.7rem;padding:.55rem;background:transparent;color:inherit;font-size:1rem;line-height:1.55;box-sizing:border-box}.v290-editor-actions{display:flex;gap:.4rem;justify-content:flex-end;margin-top:.45rem}.v290-editor-actions button{border:0;border-radius:.7rem;padding:.42rem .72rem;font-weight:800;cursor:pointer}.v290-save{background:var(--color-primary,#c06c84);color:#fff}.v290-cancel{background:#e2e8f0;color:#334155}'+
    '.v290-overlay{position:fixed;left:4vw;right:4vw;bottom:var(--v290-bottom,7rem);z-index:2147483644;border-radius:1rem;background:rgba(0,0,0,.18);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);padding:.75rem 3.2rem .75rem 1rem;display:flex;align-items:center;justify-content:center;min-height:4.5rem;box-shadow:0 10px 36px rgba(0,0,0,.18);touch-action:none;user-select:none}.v290-overlay[hidden]{display:none!important}.v290-overlay-line{width:100%;text-align:center;color:#fff;font-weight:950;line-height:1.16;font-size:clamp(2rem,8vw,5.5rem);overflow-wrap:anywhere}.v290-overlay-close{position:absolute;right:.55rem;top:.45rem;width:2.15rem;height:2.15rem;border:0;border-radius:999px;background:rgba(255,255,255,.2);color:#fff;font-size:1.4rem;font-weight:900;cursor:pointer}.v290-overlay.v290-manual{right:auto;bottom:auto}.v290-overlay.v290-dragging{outline:2px solid rgba(255,255,255,.5)}'+
    '@media(max-width:420px){.v290-panel{padding:.72rem}.v290-head{align-items:flex-start}.v290-title{font-size:.95rem}.v290-tools{gap:.3rem}.v290-btn{padding:.5rem .58rem;font-size:.72rem}.v290-stage{min-height:6.7rem;padding:.85rem .45rem}.v290-line{font-size:1.35rem}}';
  document.head.appendChild(style);

  const text = v => v == null ? '' : String(v).trim();
  const chars = v => Array.from(String(v == null ? '' : v));
  const absolute = value => { try { return new URL(String(value || ''), location.origin).href; } catch { return String(value || ''); } };
  const buttonHtml = label => '<span class="v290-icon" aria-hidden="true"><b>文</b><i>A</i></span><span>' + label + '</span><span aria-hidden="true">▾</span>';
  const formatTime = seconds => { const s=Math.max(0,Math.floor(Number(seconds)||0)); const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60; return h?h+':'+String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0'):m+':'+String(sec).padStart(2,'0'); };

  async function getTracks() {
    if (state.tracks) return state.tracks;
    try {
      const res = await fetch('/api/tracks', { credentials:'same-origin', cache:'force-cache' });
      const raw = await res.json();
      state.tracks = Array.isArray(raw) ? raw : (raw.tracks || raw.data || []);
    } catch { state.tracks = []; }
    return state.tracks;
  }

  async function detectTrack() {
    const timeline = document.getElementById('audio-timeline');
    if (!timeline) return null;
    const list = await getTracks();
    const root = timeline.closest('.max-w-2xl') || timeline.parentElement || document.body;
    const h1 = root.querySelector('h1');
    const title = text(h1 && h1.textContent);
    const speakerLine = text(h1 && h1.nextElementSibling && h1.nextElementSibling.textContent);
    if (title) {
      const same = list.filter(item => text(item && item.title) === title);
      if (same.length === 1) return same[0];
      const bySpeaker = same.find(item => speakerLine && speakerLine.includes(text(item && item.speaker)));
      if (bySpeaker) return bySpeaker;
    }
    const audio = document.querySelector('audio');
    const src = audio && absolute(audio.currentSrc || audio.src);
    if (src) {
      const byAudio = list.find(item => absolute(item && item.audioUrl) === src);
      if (byAudio) return byAudio;
    }
    return null;
  }

  function splitSegment(segment, sourceIndex) {
    const sourceChars = chars(segment && segment.text || '');
    if (!sourceChars.length) return [];
    const ranges=[]; let from=0;
    const push=to=>{ let a=from,b=to; while(a<b&&/\s/u.test(sourceChars[a]))a++; while(b>a&&/\s/u.test(sourceChars[b-1]))b--; if(b>a)ranges.push({from:a,to:b,text:sourceChars.slice(a,b).join('')}); from=to; };
    for(let i=0;i<sourceChars.length;i++) if(BREAKS.has(sourceChars[i])) push(i+1);
    if(from<sourceChars.length) push(sourceChars.length);
    const start=Number(segment.start||0), end=Math.max(start+.2,Number(segment.end||start+2)), total=Math.max(1,sourceChars.length);
    return ranges.map(item=>({ sourceIndex, segmentId:text(segment.id), from:item.from, to:item.to, text:item.text, start:start+(end-start)*item.from/total, end:Math.max(start+.05,start+(end-start)*item.to/total) }));
  }
  function rebuildUnits() { state.units=state.sourceSegments.flatMap((s,i)=>splitSegment(s,i)); state.activeIndex=-1; }
  function playbackTime(){ const slider=document.querySelector('#audio-timeline input[type="range"]'); return Number(slider&&slider.value||0); }
  function activeIndex(t){ if(!state.units.length)return-1; const exact=state.units.findIndex(u=>t>=u.start&&t<u.end); if(exact>=0)return exact; let prior=-1; for(let i=0;i<state.units.length;i++){if(state.units[i].start<=t)prior=i;else break;} return prior>=0?prior:0; }

  function makePanel() {
    const timeline=document.getElementById('audio-timeline'); if(!timeline)return null;
    let panel=document.getElementById('v290-transcript-panel');
    if(!panel){
      panel=document.createElement('section'); panel.id='v290-transcript-panel'; panel.className='v290-panel';
      panel.innerHTML='<div class="v290-head"><div class="v290-title">🎤 同步逐字稿</div><div class="v290-tools"><div class="v290-translate-wrap"><button type="button" class="v290-btn v290-translate" data-v290-translate>'+buttonHtml('Translate')+'</button><div class="v290-menu" data-v290-menu hidden></div></div><button type="button" class="v290-btn" data-v290-expand>放大逐字稿</button></div></div><div data-v290-toast-host></div><div data-v290-body class="v290-status">逐字稿載入中…</div><div data-v290-editor></div>';
      timeline.insertAdjacentElement('beforebegin',panel);
      const menu=panel.querySelector('[data-v290-menu]');
      LANGUAGES.forEach(([code,label])=>{const b=document.createElement('button');b.type='button';b.className='v290-option'+(code==='zh-Hant'?' is-active':'');b.dataset.language=code;b.textContent=label;b.onclick=e=>{e.preventDefault();e.stopPropagation();menu.hidden=true;void translate(code);};menu.appendChild(b);});
      panel.querySelector('[data-v290-translate]').onclick=e=>{e.preventDefault();e.stopPropagation();menu.hidden=!menu.hidden;};
      panel.querySelector('[data-v290-expand]').onclick=()=>toggleOverlay(true);
    }
    return panel;
  }

  function body(){return document.querySelector('#v290-transcript-panel [data-v290-body]');}
  function showStatus(message, unlockCost=null){ const b=body(); if(!b)return; b.className='v290-status'; b.innerHTML='<div>'+message+'</div>'+(unlockCost==null?'':'<button type="button" class="v290-unlock" data-v290-unlock>🔋 使用 '+unlockCost+' 顆電池解鎖</button>'); const u=b.querySelector('[data-v290-unlock]'); if(u)u.onclick=unlock; }
  function toast(message){ const host=document.querySelector('#v290-transcript-panel [data-v290-toast-host]'); if(!host)return; const el=document.createElement('div'); el.className='v290-toast'; el.textContent=message; host.replaceChildren(el); setTimeout(()=>{if(el.isConnected)el.remove();},4500); }

  function renderTranscript() {
    const b=body(); if(!b)return;
    if(!state.units.length){ showStatus('逐字稿已完成，但目前沒有可顯示的句子。'); return; }
    b.className=''; b.innerHTML='<div class="v290-stage"><button type="button" class="v290-line" data-v290-line></button></div><div class="v290-meta" data-v290-time>0:00</div>';
    b.querySelector('[data-v290-line]').onclick=()=>openEditor(state.activeIndex);
    paint(true);
  }

  function paint(force=false){
    if(!state.units.length)return; const idx=activeIndex(playbackTime()); if(idx<0)return; const unit=state.units[idx];
    const line=document.querySelector('#v290-transcript-panel [data-v290-line]'); const time=document.querySelector('#v290-transcript-panel [data-v290-time]');
    if(line&&(force||state.activeIndex!==idx)){state.activeIndex=idx;line.textContent=unit.text;const can=state.language==='zh-Hant'&&Boolean(state.data&&state.data.canCorrect);line.disabled=!can;line.title=can?'點這一句修正錯字':'';if(time)time.textContent=formatTime(unit.start);}
    const overlay=document.getElementById('v290-overlay'); const ol=overlay&&overlay.querySelector('[data-v290-overlay-line]'); if(ol&&ol.textContent!==unit.text)ol.textContent=unit.text;
  }

  function clearTranscriptForTrack(trackId){
    state.generation++; if(state.sourceController)state.sourceController.abort(); state.sourceController=null; state.trackId=trackId; state.language='zh-Hant';state.data=null;state.sourceSegments=[];state.units=[];state.activeIndex=-1;state.translateBusy=false;
    const panel=makePanel(); if(panel){showStatus('逐字稿載入中…'); const btn=panel.querySelector('[data-v290-translate]'); if(btn){btn.disabled=false;btn.innerHTML=buttonHtml('Translate');} panel.querySelectorAll('.v290-option').forEach(el=>el.classList.toggle('is-active',el.dataset.language==='zh-Hant'));}
    const overlay=document.getElementById('v290-overlay'); if(overlay){const l=overlay.querySelector('[data-v290-overlay-line]');if(l)l.textContent='';}
  }

  async function loadSource(trackId, generation=state.generation){
    if(!trackId||generation!==state.generation)return; if(state.sourceController)state.sourceController.abort();
    const controller=new AbortController(); state.sourceController=controller;
    try{
      const timer=setTimeout(()=>controller.abort(),10000);
      const res=await fetch('/api/v281/transcripts/'+encodeURIComponent(trackId),{credentials:'same-origin',cache:'no-store',signal:controller.signal}); clearTimeout(timer);
      const data=await res.json().catch(()=>({})); if(generation!==state.generation||trackId!==state.trackId)return;
      state.data=data;
      if(Array.isArray(data.segments)&&data.segments.length){state.sourceSegments=data.segments.map(s=>({id:text(s.id),start:Number(s.start||0),end:Number(s.end||0),text:text(s.text)}));rebuildUnits();renderTranscript();return;}
      if(data.locked){const cost=data.unlockCost==null?1:data.unlockCost;showStatus('逐字稿已完成，解鎖後即可同步顯示。',cost);return;}
      if(data.loginRequired){showStatus('登入會員後，可使用 '+(data.unlockCost==null?1:data.unlockCost)+' 顆電池解鎖逐字稿。');return;}
      if(data.accessDenied){showStatus(data.error||'目前沒有這份錄音的逐字稿權限。');return;}
      if(['pending','queued','processing'].includes(data.status)){showStatus('AI 正在製作逐字稿；音檔仍可正常播放。');return;}
      if(data.status==='failed'){showStatus('逐字稿正在重新處理；音檔仍可正常播放。');return;}
      showStatus('這份錄音尚未建立逐字稿。');
    }catch(error){ if(generation!==state.generation)return; showStatus(error&&error.name==='AbortError'?'字幕載入較慢，音檔可照常播放。':'逐字稿暫時無法讀取，音檔可照常播放。'); clearTimeout(state.retryTimer); state.retryTimer=setTimeout(()=>loadSource(trackId,generation),3000); }
    finally{if(state.sourceController===controller)state.sourceController=null;}
  }

  async function unlock(){
    const trackId=state.trackId;if(!trackId)return; const btn=document.querySelector('[data-v290-unlock]');if(btn){btn.disabled=true;btn.textContent='解鎖中…';}
    try{const res=await fetch('/api/v281/transcripts/'+encodeURIComponent(trackId)+'/unlock',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||'解鎖失敗');window.dispatchEvent(new CustomEvent('echostars:battery-changed'));await loadSource(trackId,state.generation);}catch(error){toast(error&&error.message||'解鎖失敗');if(btn)btn.disabled=false;}
  }

  async function translate(code){
    const panel=makePanel(); const btn=panel&&panel.querySelector('[data-v290-translate]'); if(!state.trackId||state.translateBusy)return;
    if(code==='zh-Hant'){
      state.language='zh-Hant'; if(state.data&&Array.isArray(state.data.segments)){state.sourceSegments=state.data.segments.map(s=>({id:text(s.id),start:Number(s.start||0),end:Number(s.end||0),text:text(s.text)}));rebuildUnits();renderTranscript();}
      if(btn)btn.innerHTML=buttonHtml('Translate'); panel.querySelectorAll('.v290-option').forEach(el=>el.classList.toggle('is-active',el.dataset.language==='zh-Hant')); return;
    }
    state.translateBusy=true; const generation=state.generation,trackId=state.trackId; if(btn){btn.disabled=true;btn.innerHTML=buttonHtml('Translating…');}
    try{
      const task=fetch('/api/v281/transcripts/'+encodeURIComponent(trackId)+'?translate='+encodeURIComponent(code),{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:'{}'}).then(async res=>{const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||'翻譯失敗');return data;});
      task.catch(()=>{});
      const data=await Promise.race([task,new Promise((_,reject)=>setTimeout(()=>reject(new Error('翻譯仍在準備中，請稍後再試')),15000))]);
      if(generation!==state.generation||trackId!==state.trackId)return; if(!Array.isArray(data.segments))throw new Error('翻譯內容尚未完成');
      state.language=code;state.sourceSegments=data.segments.map(s=>({id:text(s.id),start:Number(s.start||0),end:Number(s.end||0),text:text(s.text)}));rebuildUnits();renderTranscript();panel.querySelectorAll('.v290-option').forEach(el=>el.classList.toggle('is-active',el.dataset.language===code));
    }catch(error){if(generation===state.generation)toast(error&&error.message||'翻譯失敗，請稍後再試');}
    finally{if(generation===state.generation){state.translateBusy=false;if(btn){btn.disabled=false;btn.innerHTML=buttonHtml('Translate');}}}
  }

  function openEditor(index){
    const unit=state.units[index],segment=unit&&state.sourceSegments[unit.sourceIndex];if(!unit||!segment||state.language!=='zh-Hant'||!(state.data&&state.data.canCorrect))return;
    const host=document.querySelector('#v290-transcript-panel [data-v290-editor]');if(!host)return;host.innerHTML='<div class="v290-editor"><textarea maxlength="1000"></textarea><div class="v290-editor-actions"><button type="button" class="v290-cancel">取消</button><button type="button" class="v290-save">儲存修正</button></div></div>';
    const area=host.querySelector('textarea');area.value=unit.text;host.querySelector('.v290-cancel').onclick=()=>{host.innerHTML='';};host.querySelector('.v290-save').onclick=async()=>{const next=area.value.trim();if(!next||next===unit.text){host.innerHTML='';return;}const oldFull=text(segment.text),c=chars(oldFull),newFull=c.slice(0,unit.from).join('')+next+c.slice(unit.to).join('');const save=host.querySelector('.v290-save');save.disabled=true;save.textContent='儲存中…';try{const res=await fetch('/api/v281/transcripts/'+encodeURIComponent(state.trackId)+'/segments/'+encodeURIComponent(unit.segmentId),{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedText:oldFull,newText:newFull})});const result=await res.json().catch(()=>({}));if(!res.ok)throw new Error(result.error||'修正失敗');segment.text=text(result.text||newFull);if(state.data&&Array.isArray(state.data.segments)){const target=state.data.segments.find(s=>text(s.id)===text(segment.id));if(target)target.text=segment.text;}rebuildUnits();host.innerHTML='';renderTranscript();toast(result.rewardGranted?'修正已儲存，獎勵 +'+result.reward+' 顆電池 🎉':'修正已儲存。');window.dispatchEvent(new CustomEvent('echostars:battery-changed'));}catch(error){save.disabled=false;save.textContent='儲存修正';toast(error&&error.message||'修正失敗');}};area.focus();
  }

  function miniPlayer(){return document.querySelector('[data-echostars-media-session="1"]');}
  function ensureOverlay(){let o=document.getElementById('v290-overlay');if(o)return o;o=document.createElement('div');o.id='v290-overlay';o.className='v290-overlay';o.hidden=true;o.innerHTML='<div class="v290-overlay-line" data-v290-overlay-line></div><button type="button" class="v290-overlay-close" data-v290-overlay-close>×</button>';document.body.appendChild(o);o.querySelector('[data-v290-overlay-close]').onclick=()=>{o.hidden=true;};attachDrag(o);return o;}
  function positionOverlay(){const o=ensureOverlay();if(state.overlayMoved)return;const mini=miniPlayer();const gap=10,bottom=mini?Math.max(10,window.innerHeight-mini.getBoundingClientRect().top+gap):92;o.style.setProperty('--v290-bottom',bottom+'px');}
  function toggleOverlay(show){const o=ensureOverlay();o.hidden=!show;positionOverlay();paint(true);}
  function attachDrag(o){
    o.addEventListener('pointerdown',e=>{if(e.target.closest('[data-v290-overlay-close]'))return;clearTimeout(state.longPressTimer);const r=o.getBoundingClientRect();state.drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top,active:false};state.longPressTimer=setTimeout(()=>{if(!state.drag||state.drag.id!==e.pointerId)return;state.drag.active=true;state.overlayMoved=true;o.classList.add('v290-manual','v290-dragging');o.style.left=r.left+'px';o.style.top=r.top+'px';o.style.width=r.width+'px';o.style.right='auto';o.style.bottom='auto';try{o.setPointerCapture(e.pointerId);}catch{}},420);});
    o.addEventListener('pointermove',e=>{const d=state.drag;if(!d||d.id!==e.pointerId)return;if(!d.active){if(Math.abs(e.clientX-d.x)>8||Math.abs(e.clientY-d.y)>8)clearTimeout(state.longPressTimer);return;}e.preventDefault();const r=o.getBoundingClientRect();o.style.left=Math.max(6,Math.min(window.innerWidth-r.width-6,d.left+e.clientX-d.x))+'px';o.style.top=Math.max(6,Math.min(window.innerHeight-r.height-6,d.top+e.clientY-d.y))+'px';});
    const end=e=>{clearTimeout(state.longPressTimer);if(state.drag&&state.drag.active)o.classList.remove('v290-dragging');state.drag=null;try{o.releasePointerCapture(e.pointerId);}catch{}};o.addEventListener('pointerup',end);o.addEventListener('pointercancel',end);
  }

  async function refreshIdentity(){
    const track=await detectTrack();if(!track||!track.id)return;makePanel();
    if(track.id!==state.trackId){clearTranscriptForTrack(track.id);const generation=state.generation;const audio=document.querySelector('audio');const delay=audio&&!audio.paused?700:120;setTimeout(()=>loadSource(track.id,generation),delay);}
  }

  document.addEventListener('click',e=>{if(!e.target.closest('.v290-translate-wrap')){const m=document.querySelector('[data-v290-menu]');if(m)m.hidden=true;}});
  document.addEventListener('play',e=>{if(e.target&&e.target.tagName==='AUDIO'){setTimeout(()=>{void refreshIdentity();},80);}},true);
  window.addEventListener('resize',()=>{if(!state.overlayMoved)positionOverlay();});
  new MutationObserver(()=>{clearTimeout(state.identityTimer);state.identityTimer=setTimeout(()=>{void refreshIdentity();},120);}).observe(document.body,{childList:true,subtree:true});
  state.paintTimer=setInterval(()=>paint(false),160);
  setInterval(()=>{void refreshIdentity();},800);
  void refreshIdentity();
})();