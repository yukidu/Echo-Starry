function markup() {
  return `<section id="v281-transcript-settings" hidden style="margin:12px 0;padding:14px;border:1px solid #fde68a;border-radius:16px;background:#fffbeb;color:#78350f">
    <h2 style="margin:0 0 8px;font-size:16px">📝 逐字稿電池設定</h2>
    <p style="margin:0 0 10px;font-size:12px;color:#92400e">只有超級管理員看得到。設定後立即套用所有逐字稿。</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <label style="font-size:12px;font-weight:700">逐字稿解鎖需要幾顆電池<input id="v281-unlock-cost" type="number" min="0" max="100" step="0.1" style="display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:9px;border:1px solid #fbbf24;border-radius:10px"></label>
      <label style="font-size:12px;font-weight:700">首次有效修錯獎勵幾顆電池<input id="v281-correction-reward" type="number" min="0" max="10" step="0.1" style="display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:9px;border:1px solid #fbbf24;border-radius:10px"></label>
    </div>
    <button id="v281-save-transcript-settings" type="button" style="width:100%;margin-top:10px;padding:10px;border:0;border-radius:12px;background:#b45309;color:white;font-weight:900;cursor:pointer">儲存逐字稿電池設定</button>
    <div id="v281-transcript-settings-status" style="margin-top:7px;font-size:12px"></div>
  </section>
  <script>(function(){var box=document.getElementById('v281-transcript-settings');if(!box)return;var u=document.getElementById('v281-unlock-cost'),r=document.getElementById('v281-correction-reward'),s=document.getElementById('v281-transcript-settings-status'),b=document.getElementById('v281-save-transcript-settings');fetch('/api/v281/transcript-settings',{credentials:'same-origin',cache:'no-store'}).then(function(x){if(!x.ok)throw new Error('hidden');return x.json()}).then(function(d){box.hidden=false;u.value=d.unlockCost;r.value=d.correctionReward;s.textContent='目前已完成 '+Number(d.counts&&d.counts.ready||0)+' 份逐字稿。'}).catch(function(){});b.addEventListener('click',function(){b.disabled=true;s.textContent='儲存中…';fetch('/api/v281/transcript-settings',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({unlockCost:Number(u.value),correctionReward:Number(r.value)})}).then(function(x){return x.json().then(function(d){if(!x.ok)throw new Error(d.error||'儲存失敗');return d})}).then(function(d){s.textContent='已儲存：解鎖 '+d.unlockCost+' 顆；修錯獎勵 '+d.correctionReward+' 顆。'}).catch(function(e){s.textContent=e.message||'儲存失敗'}).finally(function(){b.disabled=false})})})();</script>`;
}

export async function injectTranscriptLedgerSettings(response: Response) {
  if (!response.ok || !String(response.headers.get('Content-Type') || '').includes('text/html')) return response;
  let html = await response.text();
  if (!html.includes('v281-transcript-settings')) {
    const block = markup();
    html = html.includes('</main>') ? html.replace('</main>', block + '</main>') : html.replace('</body>', block + '</body>');
  }
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Cache-Control', 'no-store');
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}