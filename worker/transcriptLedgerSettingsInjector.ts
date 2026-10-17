function markup() {
  return `<section id="v296-transcript-settings" hidden style="margin:0 0 18px;padding:16px;border:1px solid #566f9d;border-radius:20px;background:linear-gradient(145deg,#172b49,#101b31);color:#f7f9ff;box-shadow:0 10px 30px rgba(0,0,0,.18)">
    <h2 style="margin:0 0 6px;font-size:18px">逐字稿</h2>
    <p style="margin:0 0 12px;font-size:12px;color:#b9c8e2">我的電池簿 ＞ 其他。超級管理員可調整逐字稿的電池加減遊戲規則，儲存後立即套用。</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px">
      <label style="font-size:13px;font-weight:800">解鎖逐字稿的花費
        <input id="v296-unlock-cost" type="number" min="0" max="100" step="0.1" inputmode="decimal" style="display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:11px;border:1px solid #49658e;border-radius:12px;background:#0d182b;color:#fff;font:inherit">
      </label>
      <label style="font-size:13px;font-weight:800">協助訂正錯字的獎勵
        <input id="v296-correction-reward" type="number" min="0" max="10" step="0.1" inputmode="decimal" style="display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:11px;border:1px solid #49658e;border-radius:12px;background:#0d182b;color:#fff;font:inherit">
      </label>
      <label style="font-size:13px;font-weight:800">使用逐字稿翻譯功能的花費
        <input id="v296-translation-cost" type="number" min="0" max="100" step="0.1" inputmode="decimal" style="display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:11px;border:1px solid #49658e;border-radius:12px;background:#0d182b;color:#fff;font:inherit">
      </label>
    </div>
    <button id="v296-save-transcript-settings" type="button" style="width:100%;margin-top:12px;padding:12px;border:0;border-radius:13px;background:#6d5bd0;color:white;font-weight:900;cursor:pointer">儲存逐字稿規則</button>
    <div id="v296-transcript-settings-status" style="margin-top:8px;min-height:18px;font-size:12px;color:#b9c8e2">正在確認管理員權限…</div>
  </section>
  <script>(function(){
    var box=document.getElementById('v296-transcript-settings');if(!box)return;
    var u=document.getElementById('v296-unlock-cost');
    var r=document.getElementById('v296-correction-reward');
    var t=document.getElementById('v296-translation-cost');
    var s=document.getElementById('v296-transcript-settings-status');
    var b=document.getElementById('v296-save-transcript-settings');
    function load(){
      fetch('/api/v281/transcript-settings',{credentials:'same-origin',cache:'no-store'})
        .then(function(x){return x.json().then(function(d){if(!x.ok)throw new Error(d.error||'讀取設定失敗');return d})})
        .then(function(d){box.hidden=false;u.value=d.unlockCost;r.value=d.correctionReward;t.value=d.translationCost==null?0:d.translationCost;s.textContent='目前已完成 '+Number(d.counts&&d.counts.ready||0)+' 份逐字稿。';})
        .catch(function(){box.hidden=true;});
    }
    load();
    b.addEventListener('click',function(){
      b.disabled=true;s.textContent='儲存中…';
      fetch('/api/v281/transcript-settings',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({unlockCost:Number(u.value),correctionReward:Number(r.value),translationCost:Number(t.value)})})
        .then(function(x){return x.json().then(function(d){if(!x.ok)throw new Error(d.error||'儲存失敗');return d})})
        .then(function(d){s.textContent='已儲存：解鎖 '+d.unlockCost+' 顆；訂正獎勵 '+d.correctionReward+' 顆；翻譯 '+d.translationCost+' 顆。';})
        .catch(function(e){s.textContent=e.message||'儲存失敗';})
        .finally(function(){b.disabled=false;});
    });
  })();</script>`;
}

export async function injectTranscriptLedgerSettings(response: Response) {
  if (!response.ok || !String(response.headers.get('Content-Type') || '').includes('text/html')) return response;
  let html = await response.text();
  html = html.replace(/<section id="v281-transcript-settings"[\s\S]*?<\/section>\s*<script>[\s\S]*?<\/script>/g, '');
  if (!html.includes('v296-transcript-settings')) {
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
