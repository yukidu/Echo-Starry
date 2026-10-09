const ECHO_SSO = 'https://echostars.yukidu.workers.dev/auth/starbeauty';
const app = document.querySelector('#app');
const dialog = document.querySelector('#submitDialog');
const submitForm = document.querySelector('#submitForm');
const state = { user:null, unread:0, tab:'assignments', assignments:[], submissions:[], notifications:[], admin:null };

async function api(url, options={}) {
  const res = await fetch(url, { credentials:'include', cache:'no-store', ...options, headers:{ ...(options.body && !(options.body instanceof Blob) && typeof options.body !== 'string' ? {'Content-Type':'application/json'}:{}), ...(options.headers||{}) } });
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error || '連線失敗，請稍後再試');
  return data;
}
function fmtTime(v){ if(!v) return '未設定'; return new Date(Number(v)).toLocaleString('zh-TW',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}); }
function esc(v){return String(v??'').replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));}
function statusLabel(s){return ({draft:'草稿',submitted:'老師審核中',approved:'已通過',needs_revision:'需要補件',rejected:'未通過'})[s]||'尚未繳交';}
function statusClass(s){return s==='approved'?'good':s==='submitted'?'warn':['needs_revision','rejected'].includes(s)?'bad':'';}
function kindLabel(k){return ({general:'一般作業',receipt:'發票／收據',presentation:'簡報',video:'影片',text:'文字作業'})[k]||'一般作業';}
function roleLabel(r){return ({student:'學員',teacher:'老師',admin:'管理員',superadmin:'最高管理員'})[r]||r;}
function toast(msg){const el=document.createElement('div');el.className='toast';el.textContent=msg;document.body.appendChild(el);setTimeout(()=>el.remove(),2600);}

async function boot(){
  try{const d=await api('/api/me'); state.user=d.user;state.unread=d.unreadNotifications||0; renderShell(); await loadTab();}
  catch{renderLogin();}
}
function renderLogin(){
  app.innerHTML=`<main class="login"><section class="login-card"><div class="login-logo">★</div><h1>美力之星</h1><p>學員作業、簡報、影片、發票與收據的統一繳交中心。<br>會員身分直接使用「繁星回聲」同一個 Google 帳號。</p><a class="login-btn" href="${ECHO_SSO}">使用繁星回聲會員登入</a><p class="small">登入會在繁星回聲完成驗證，再安全回到美力之星。</p></section></main>`;
}
function renderShell(){
  const staff=['teacher','admin','superadmin'].includes(state.user.role);
  app.innerHTML=`<div class="shell"><header class="topbar"><div class="brand"><div class="brand-mark">★</div><div class="brand-text"><h1>美力之星</h1><p>Star Beauty Learning Hub</p></div></div><div class="spacer"></div><div class="user-chip">${state.user.avatar?`<img class="avatar" src="${esc(state.user.avatar)}" alt="">`:`<div class="avatar"></div>`}<div><div class="user-name">${esc(state.user.name)}</div><div class="small">${roleLabel(state.user.role)}</div></div><button class="logout" id="logout">登出</button></div></header><nav class="tabs"><button class="tab" data-tab="assignments">我的作業</button><button class="tab" data-tab="submissions">繳交紀錄</button><button class="tab" data-tab="line">LINE 綁定</button><button class="tab" data-tab="notifications">通知${state.unread?` (${state.unread})`:''}</button>${staff?'<button class="tab" data-tab="admin">管理後台</button>':''}</nav><main id="content"></main></div>`;
  document.querySelector('#logout').onclick=async()=>{await api('/api/logout',{method:'POST'}).catch(()=>{});location.reload();};
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;loadTab();});
}
async function loadTab(){
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.tab));
  const content=document.querySelector('#content'); if(!content)return;
  content.innerHTML='<div class="empty">讀取中…</div>';
  try{
    if(state.tab==='assignments') return renderAssignments(await api('/api/assignments'));
    if(state.tab==='submissions') return renderSubmissions(await api('/api/submissions'));
    if(state.tab==='line') return renderLine();
    if(state.tab==='notifications') return renderNotifications(await api('/api/notifications'));
    if(state.tab==='admin') return renderAdmin();
  }catch(e){content.innerHTML=`<div class="empty">${esc(e.message)}</div>`;}
}
function renderAssignments(data){
  state.assignments=data.assignments||[];const open=state.assignments.filter(a=>!a.myStatus||['needs_revision','rejected'].includes(a.myStatus)).length;
  const content=document.querySelector('#content');
  content.innerHTML=`<section class="hero"><div class="hero-card"><h2>${esc(state.user.name)}，今天也一起完成一顆星。</h2><p>網站與 LINE 上傳會進入同一份學員作業紀錄。老師批改、補件與通知都會留在這裡。</p></div><div class="hero-side"><span class="small">目前可處理作業</span><span class="big-number">${open}</span><span class="small">份</span></div></section><div class="section-head"><div><h2>我的作業</h2><p>依截止時間排序</p></div></div><div class="grid">${state.assignments.length?state.assignments.map(a=>assignmentCard(a)).join(''):'<div class="empty">目前沒有作業。</div>'}</div>`;
  content.querySelectorAll('[data-submit]').forEach(b=>b.onclick=()=>openSubmit(b.dataset.submit));
}
function assignmentCard(a){
  const status=a.myStatus||''; const due=a.dueAt?fmtTime(a.dueAt):'無截止日期';
  const disabled=status==='approved'&&!Number(a.allowResubmit);
  return `<article class="card assignment-card"><div class="meta"><span class="badge">${esc(a.courseTitle||'全體課程')}</span><span class="badge">${kindLabel(a.kind)}</span><span class="badge ${statusClass(status)}">${statusLabel(status)}</span></div><div class="title">${esc(a.title)}</div><div class="desc">${esc(a.description||'')}</div><div class="due">截止：${due}${a.dueAt&&Date.now()>Number(a.dueAt)?' · 已逾期':''}</div><button class="btn primary" data-submit="${a.id}" ${disabled?'disabled':''}>${status?(['needs_revision','rejected'].includes(status)?'補件／重新繳交':'再次繳交'):'繳交作業'}</button></article>`;
}
function openSubmit(id){
  const a=state.assignments.find(x=>x.id===id);if(!a)return;
  document.querySelector('#assignmentId').value=a.id;document.querySelector('#submitTitle').textContent=a.title;document.querySelector('#note').value='';document.querySelector('#files').value='';
  document.querySelector('#receiptFields').classList.toggle('hidden',a.kind!=='receipt');
  ['receiptDate','merchant','amount','invoiceNumber','receiptCategory'].forEach(x=>document.querySelector('#'+x).value='');
  document.querySelector('#uploadProgress').classList.add('hidden');dialog.showModal();
}
document.querySelector('#cancelSubmit').onclick=()=>dialog.close();
document.querySelector('#confirmSubmit').onclick=submitCurrent;
async function submitCurrent(){
  const assignmentId=document.querySelector('#assignmentId').value;const files=[...document.querySelector('#files').files];
  const a=state.assignments.find(x=>x.id===assignmentId); if(!a)return;
  if(a.kind!=='text'&&!files.length)return toast('請先選擇檔案');
  const btn=document.querySelector('#confirmSubmit');btn.disabled=true;
  const progress=document.querySelector('#uploadProgress');const bar=document.querySelector('#uploadProgressBar');const text=document.querySelector('#uploadProgressText');progress.classList.remove('hidden');
  try{
    const created=await api('/api/submissions',{method:'POST',body:JSON.stringify({assignmentId,note:document.querySelector('#note').value,receiptDate:document.querySelector('#receiptDate').value,merchant:document.querySelector('#merchant').value,amount:document.querySelector('#amount').value,invoiceNumber:document.querySelector('#invoiceNumber').value,category:document.querySelector('#receiptCategory').value})});
    const sid=created.submission.id; let uploaded=0;
    for(const file of files){await uploadFile(sid,file,(p)=>{const overall=(uploaded+p)/Math.max(1,files.length);bar.style.width=`${Math.round(overall*100)}%`;text.textContent=`上傳中 ${Math.round(overall*100)}%`;});uploaded++;}
    text.textContent='正在送出作業…';await api(`/api/submissions/${sid}/submit`,{method:'POST'});bar.style.width='100%';text.textContent='完成';toast('作業已成功送出');setTimeout(()=>{dialog.close();loadTab();},500);
  }catch(e){toast(e.message);}finally{btn.disabled=false;}
}
async function uploadFile(submissionId,file,onProgress){
  const start=await api('/api/uploads/start',{method:'POST',body:JSON.stringify({submissionId,fileName:file.name,contentType:file.type||'application/octet-stream',size:file.size})});
  const chunkSize=start.chunkSize||8*1024*1024;const total=Math.max(1,Math.ceil(file.size/chunkSize));const parts=[];
  for(let i=0;i<total;i++){
    const chunk=file.slice(i*chunkSize,Math.min(file.size,(i+1)*chunkSize));
    const r=await fetch(`/api/uploads/${start.fileId}/parts/${i+1}`,{method:'PUT',credentials:'include',body:chunk});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`檔案 ${file.name} 上傳失敗`);parts.push({partNumber:d.partNumber,etag:d.etag});onProgress((i+1)/total);
  }
  await api(`/api/uploads/${start.fileId}/complete`,{method:'POST',body:JSON.stringify({parts})});
}
function renderSubmissions(data){
  state.submissions=data.submissions||[];const content=document.querySelector('#content');
  content.innerHTML=`<div class="section-head"><div><h2>繳交紀錄</h2><p>網站與 LINE 的完整歷史</p></div></div><div class="stack">${state.submissions.length?state.submissions.map(s=>`<article class="card submission"><div class="row"><div class="title">${esc(s.assignmentTitle)}</div><span class="badge ${statusClass(s.status)}">${statusLabel(s.status)}</span><span class="badge">第 ${s.version} 版 · ${s.source==='line'?'LINE':'網站'}</span></div><div class="small">${esc(s.courseTitle||'全體課程')} · ${fmtTime(s.submittedAt||s.createdAt)}</div>${s.note?`<div class="desc">${esc(s.note)}</div>`:''}${s.feedback?`<div class="notice ${s.status==='approved'?'success':''}"><strong>老師回覆：</strong>${esc(s.feedback)}${s.score!=null?` · 分數 ${esc(s.score)}`:''}</div>`:''}<div class="file-list">${(s.files||[]).map(f=>`<a class="file-link" target="_blank" href="/api/files/${f.id}">${esc(f.fileName)}</a>`).join('')}</div></article>`).join(''):'<div class="empty">目前沒有繳交紀錄。</div>'}</div>`;
}
function renderLine(){
  const content=document.querySelector('#content');content.innerHTML=`<div class="section-head"><div><h2>LINE 綁定</h2><p>綁定後可直接把作業傳給機器人</p></div></div><div class="card stack"><div class="notice ${state.user.lineLinked?'success':''}">${state.user.lineLinked?'你的 LINE 已綁定。若要換帳號，可重新產生綁定碼。':'尚未綁定 LINE。'}</div><button id="makeCode" class="btn primary">產生 LINE 綁定碼</button><div id="lineCodeBox"></div><div class="desc">操作方式：在這裡產生代碼 → 到「美力之星」LINE 官方帳號 → 傳送「綁定 代碼」。之後簡報、文件、照片、影片都可以直接傳給機器人。</div></div>`;
  document.querySelector('#makeCode').onclick=async()=>{try{const d=await api('/api/line/link-code',{method:'POST'});document.querySelector('#lineCodeBox').innerHTML=`<div class="line-code">${d.code}</div><p class="small">10 分鐘內有效。請在 LINE 傳送：<strong>綁定 ${d.code}</strong></p>`;}catch(e){toast(e.message);}};
}
function renderNotifications(data){
  state.notifications=data.notifications||[];const content=document.querySelector('#content');content.innerHTML=`<div class="section-head"><div><h2>通知</h2><p>批改、補件與系統提醒</p></div><button id="readAll" class="btn ghost">全部標示已讀</button></div><div class="stack">${state.notifications.length?state.notifications.map(n=>`<article class="card notification ${n.readAt?'':'unread'}"><strong>${esc(n.title)}</strong><div class="desc">${esc(n.body)}</div><span class="small">${fmtTime(n.createdAt)}</span></article>`).join(''):'<div class="empty">目前沒有通知。</div>'}</div>`;document.querySelector('#readAll').onclick=async()=>{await api('/api/notifications/read',{method:'POST'});state.unread=0;renderShell();state.tab='notifications';loadTab();};
}
async function renderAdmin(){
  const content=document.querySelector('#content');
  const [summary,courses,assignments,submissions,users]=await Promise.all([api('/api/admin/summary'),api('/api/admin/courses'),api('/api/admin/assignments'),api('/api/admin/submissions'),api('/api/admin/users')]);
  state.admin={summary,courses:courses.courses||[],assignments:assignments.assignments||[],submissions:submissions.submissions||[],users:users.users||[]};
  content.innerHTML=`<div class="section-head"><div><h2>管理後台</h2><p>作業、課程、學員、批改一次管理</p></div></div><div class="admin-grid"><div class="stat"><span class="small">會員</span><strong>${summary.users}</strong></div><div class="stat"><span class="small">作業</span><strong>${summary.assignments}</strong></div><div class="stat"><span class="small">待審核</span><strong>${summary.pending}</strong></div><div class="stat"><span class="small">已通過</span><strong>${summary.approved}</strong></div><div class="stat"><span class="small">需補件</span><strong>${summary.needsRevision}</strong></div></div>
  <div class="grid" style="margin-top:16px"><section class="card form-card"><div class="title">新增課程</div><label>課程名稱<input id="courseTitle"></label><label>說明<textarea id="courseDesc" rows="3"></textarea></label><button id="createCourse" class="btn primary">建立課程</button></section><section class="card form-card"><div class="title">新增作業</div><div class="form-grid"><label>作業名稱<input id="asgTitle"></label><label>課程<select id="asgCourse"><option value="">全體課程</option>${state.admin.courses.map(c=>`<option value="${c.id}">${esc(c.title)}</option>`).join('')}</select></label><label>類型<select id="asgKind"><option value="general">一般作業</option><option value="receipt">發票／收據</option><option value="presentation">簡報</option><option value="video">影片</option><option value="text">文字作業</option></select></label><label>截止時間<input id="asgDue" type="datetime-local"></label></div><label>作業說明<textarea id="asgDesc" rows="3"></textarea></label><button id="createAssignment" class="btn primary">建立作業</button></section></div>
  <div class="section-head"><div><h2>待批改與繳交紀錄</h2><p>最新 500 筆</p></div></div><div class="table-list">${state.admin.submissions.length?state.admin.submissions.map(s=>adminSubmissionCard(s)).join(''):'<div class="empty">目前沒有作業需要查看。</div>'}</div>
  <div class="section-head"><div><h2>會員與角色</h2><p>最高管理員可指派老師／管理員</p></div></div><div class="table-list">${state.admin.users.map(u=>`<div class="card row"><img class="avatar" src="${esc(u.avatar||'')}" onerror="this.style.visibility='hidden'"><div style="flex:1;min-width:180px"><strong>${esc(u.name)}</strong><div class="small">${esc(u.email)} · 已繳 ${u.submissionCount||0} 份 ${u.lineUserId?'· LINE 已綁定':''}</div></div><select class="role-select" data-role-user="${u.id}" ${state.user.role==='superadmin'&&u.role!=='superadmin'?'':'disabled'}><option value="student" ${u.role==='student'?'selected':''}>學員</option><option value="teacher" ${u.role==='teacher'?'selected':''}>老師</option><option value="admin" ${u.role==='admin'?'selected':''}>管理員</option><option value="superadmin" ${u.role==='superadmin'?'selected':''}>最高管理員</option></select></div>`).join('')}</div>`;
  document.querySelector('#createCourse').onclick=createCourse;document.querySelector('#createAssignment').onclick=createAssignment;
  content.querySelectorAll('[data-review]').forEach(b=>b.onclick=()=>reviewSubmission(b.dataset.review,b.dataset.status));
  content.querySelectorAll('[data-role-user]').forEach(s=>s.onchange=async()=>{try{await api(`/api/admin/users/${s.dataset.roleUser}/role`,{method:'PUT',body:JSON.stringify({role:s.value})});toast('角色已更新');}catch(e){toast(e.message);await renderAdmin();}});
}
function adminSubmissionCard(s){return `<article class="card review-card"><div class="row"><div class="title">${esc(s.assignmentTitle)}</div><span class="badge ${statusClass(s.status)}">${statusLabel(s.status)}</span><span class="badge">${esc(s.userName)}</span><span class="badge">第 ${s.version} 版 · ${s.source==='line'?'LINE':'網站'}</span></div><div class="small">${esc(s.userEmail)} · ${fmtTime(s.submittedAt||s.createdAt)}</div>${s.note?`<div class="desc">${esc(s.note)}</div>`:''}${s.assignmentKind==='receipt'?`<div class="notice">收據：${esc(s.receiptDate||'')} ${esc(s.merchant||'')} ${s.amount!=null?`NT$ ${esc(s.amount)}`:''} ${esc(s.invoiceNumber||'')}</div>`:''}<div class="file-list">${(s.files||[]).map(f=>`<a class="file-link" target="_blank" href="/api/files/${f.id}">${esc(f.fileName)}</a>`).join('')}</div><div class="row"><button class="btn secondary" data-review="${s.id}" data-status="approved">通過</button><button class="btn ghost" data-review="${s.id}" data-status="needs_revision">需要補件</button><button class="btn danger" data-review="${s.id}" data-status="rejected">未通過</button></div>${s.feedback?`<div class="small">目前評語：${esc(s.feedback)}</div>`:''}</article>`;}
async function createCourse(){try{await api('/api/admin/courses',{method:'POST',body:JSON.stringify({title:document.querySelector('#courseTitle').value,description:document.querySelector('#courseDesc').value})});toast('課程已建立');await renderAdmin();}catch(e){toast(e.message);}}
async function createAssignment(){try{const due=document.querySelector('#asgDue').value;await api('/api/admin/assignments',{method:'POST',body:JSON.stringify({title:document.querySelector('#asgTitle').value,courseId:document.querySelector('#asgCourse').value||null,kind:document.querySelector('#asgKind').value,dueAt:due?new Date(due).getTime():null,description:document.querySelector('#asgDesc').value,allowLate:true,allowResubmit:true,maxFiles:10,requireReview:true})});toast('作業已建立');await renderAdmin();}catch(e){toast(e.message);}}
async function reviewSubmission(id,status){const label=status==='approved'?'通過':status==='needs_revision'?'需要補件':'未通過';const feedback=prompt(`${label}：請輸入給學員的評語（可留空）`,'');if(feedback===null)return;let score=null;if(status==='approved'){const s=prompt('分數（可留空）','');if(s!==null&&s.trim()!=='')score=Number(s);}try{await api(`/api/admin/submissions/${id}/review`,{method:'POST',body:JSON.stringify({status,feedback,score})});toast('審核結果已送出');await renderAdmin();}catch(e){toast(e.message);}}

boot();
