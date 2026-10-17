function markup() {
  return `<section id="v281-transcript-settings" hidden style="margin:0 0 18px;padding:16px;border:1px solid #566f9d;border-radius:20px;background:linear-gradient(145deg,#172b49,#101b31);color:#f7f9ff;box-shadow:0 10px 30px rgba(0,0,0,.18)">
    <h2 style="margin:0 0 6px;font-size:18px">📝 逐字稿電池設定</h2>
    <p style="margin:0 0 12px;font-size:12px;color:#b9c8e2">超級管理員專用。儲存後立即套用所有逐字稿。</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px">
      <label style="font-size:13px;font-weight:800">逐字稿功能解鎖所需電池<input id="v281-unlock-cost" type="number" min="0" max="100" step="0.1" style="display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:11px;border:1px solid #49658e;border-radius:12px;background:#0d182b;color:#fff;font:inherit"></label>
      <label style="font-size:13px;font-weight:800">訂正錯字電池獎勵<input id="v281-correction-reward" type="number" min="0" max="10" step="0.1" style="display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:11px;border:1px solid #49658e;border-radius:12px;background:#0d182b;color:#fff;font:inherit"></label>
    </div>
    <button id="v281-save-transcript-settings" type="button" style="width:100%;margin-top:12px;padding:12px;border:0;border-radius:13px;background:#6d5bd0;color:white;font-weight:900;cursor:pointer">儲存逐字稿電池設定</button>
    <div id="v281-transcript-settings-status" style="margin-top:8px;min-height:18px;font-size:12px;color:#b9c8e2">正在確認管理員權限…</div>
  </section>
  <script>(function(){var box=document.getElementById('v281-transcript-settings');if(!box)return;var u=document.getElementById('v281-unlock-cost'),r=document.getElementById('v281-correction-reward'),s=document.getElementById('v281-transcript-settings-status'),b=document.getElementById('v281-save-transcript-settings');function load(){fetch('/api/v281/transcript-settings',{credentials:'same-origin',cache:'no-store'}).then(function(x){return x.json().then(function(d){if(!x.ok)throw new Error(d.error||'讀取設定失敗');return d})}).then(function(d){box.hidden=false;u.value=d.unlockCost;r.value=d.correctionReward;s.textContent='目前已完成 '+Number(d.counts&&d.counts.ready||0)+' 份逐字稿。'}).catch(function(e){s.textContent=e.message||'讀取設定失敗'})}fetch('/api/session',{credentials:'same-origin',cache:'no-store'}).then(function(x){return x.json()}).then(function(d){if(d&&d.isSuperAdmin){box.hidden=false;s.textContent='正在讀取逐字稿設定…';load()}}).catch(function(){});b.addEventListener('click',function(){b.disabled=true;s.textContent='儲存中…';fetch('/api/v281/transcript-settings',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({unlockCost:Number(u.value),correctionReward:Number(r.value)})}).then(function(x){return x.json().then(function(d){if(!x.ok)throw new Error(d.error||'儲存失敗');return d})}).then(function(d){s.textContent='已儲存：逐字稿解鎖 '+d.unlockCost+' 顆；訂正錯字獎勵 '+d.correctionReward+' 顆。'}).catch(function(e){s.textContent=e.message||'儲存失敗'}).finally(function(){b.disabled=false})})})();</script>`;
}

export async function injectTranscriptLedgerSettings(response: Response) {
  if (!response.ok || !String(response.headers.get('Content-Type') || '').includes('text/html')) return response;
  let html = await response.text();
  if (!html.includes('v281-transcript-settings')) {
    const block = markup();
    if (html.includes('<div class="tools">')) html = html.replace('<div class="tools">', block + '<div class="tools">');
    else if (html.includes('</main>')) html = html.replace('</main>', block + '</main>');
    else html = html.replace('</body>', block + '</body>');
  }
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Cache-Control', 'no-store');
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}