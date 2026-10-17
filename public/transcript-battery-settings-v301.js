(() => {
  if (window.__starryTranscriptBatterySettingsV302) return;
  window.__starryTranscriptBatterySettingsV302 = true;

  const SECTION_ID = 'v301-transcript-battery-settings';
  let loading = false;

  const css = document.createElement('style');
  css.id = 'v301-transcript-battery-settings-style';
  css.textContent = `
    #${SECTION_ID}{border:1px solid color-mix(in srgb,var(--color-primary,#c06c84) 28%,#cbd5e1);border-radius:1rem;padding:.8rem;background:color-mix(in srgb,var(--color-primary,#c06c84) 5%,transparent);display:grid;gap:.7rem}
    #${SECTION_ID} h3{margin:0;font-size:.92rem;font-weight:900}
    #${SECTION_ID} p{margin:0;font-size:.72rem;opacity:.7;line-height:1.45}
    #${SECTION_ID} .v301-setting-row{display:flex;align-items:center;justify-content:space-between;gap:.75rem;font-size:.76rem;font-weight:800}
    #${SECTION_ID} .v301-setting-value{display:flex;align-items:center;gap:.3rem;flex:none}
    #${SECTION_ID} .v302-setting-hint{display:block;margin-top:.18rem;font-size:.66rem;font-weight:700;opacity:.62;line-height:1.35}
    #${SECTION_ID} input{width:5.5rem;box-sizing:border-box;padding:.52rem .6rem;border:1px solid #cbd5e1;border-radius:.7rem;background:var(--app-surface,#fff);color:inherit;font:inherit;text-align:right}
    .dark #${SECTION_ID} input{background:#0f172a;border-color:#475569;color:#f8fafc}
    #${SECTION_ID} button{width:100%;border:0;border-radius:.75rem;padding:.68rem;background:var(--color-primary,#c06c84);color:#fff;font-weight:900;cursor:pointer}
    #${SECTION_ID} button:disabled{opacity:.55;cursor:not-allowed}
    #${SECTION_ID} [data-v301-status]{min-height:1rem;font-size:.7rem;opacity:.72}
  `;
  document.head.appendChild(css);

  function isOtherTabOpen() {
    const selected = [...document.querySelectorAll('button[role="tab"][aria-selected="true"]')]
      .find(button => String(button.textContent || '').trim().includes('其他'));
    return Boolean(selected);
  }

  function makeSection() {
    const section = document.createElement('section');
    section.id = SECTION_ID;
    section.setAttribute('aria-label', '逐字稿電池設定');
    section.innerHTML = `
      <div><h3>逐字稿</h3><p>設定解鎖、協助訂正與瀏覽器翻譯功能的電池加減規則。</p></div>
      <label class="v301-setting-row"><span>解鎖逐字稿的花費</span><span class="v301-setting-value"><input data-v301-unlock type="number" min="0" max="100" step="0.1" inputmode="decimal"> 顆</span></label>
      <label class="v301-setting-row"><span>協助訂正錯字的獎勵</span><span class="v301-setting-value"><input data-v301-reward type="number" min="0" max="10" step="0.1" inputmode="decimal"> 顆</span></label>
      <label class="v301-setting-row"><span>使用逐字稿瀏覽器翻譯的花費<span class="v302-setting-hint">這是會員使用翻譯按鈕時扣除的電池，不是 Cloudflare AI 費用。</span></span><span class="v301-setting-value"><input data-v301-translation type="number" min="0" max="100" step="0.1" inputmode="decimal"> 顆</span></label>
      <button type="button" data-v301-save>儲存逐字稿規則</button>
      <div data-v301-status role="status">讀取設定中…</div>`;
    section.querySelector('[data-v301-save]').addEventListener('click', () => void save(section));
    return section;
  }

  async function load(section) {
    if (loading || section.dataset.loaded === '1') return;
    loading = true;
    const status = section.querySelector('[data-v301-status]');
    try {
      const response = await fetch('/api/v281/transcript-settings', { credentials:'same-origin', cache:'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '讀取設定失敗');
      section.querySelector('[data-v301-unlock]').value = String(data.unlockCost ?? 0);
      section.querySelector('[data-v301-reward]').value = String(data.correctionReward ?? 0);
      section.querySelector('[data-v301-translation]').value = String(data.translationCost ?? 0);
      section.dataset.loaded = '1';
      status.textContent = `目前已完成 ${Number(data.counts?.ready || 0)} 份逐字稿。`;
    } catch (error) {
      status.textContent = error?.message || '讀取設定失敗';
    } finally {
      loading = false;
    }
  }

  async function save(section) {
    const button = section.querySelector('[data-v301-save]');
    const status = section.querySelector('[data-v301-status]');
    const payload = {
      unlockCost: Number(section.querySelector('[data-v301-unlock]').value),
      correctionReward: Number(section.querySelector('[data-v301-reward]').value),
      translationCost: Number(section.querySelector('[data-v301-translation]').value)
    };
    if (Object.values(payload).some(value => !Number.isFinite(value) || value < 0)) {
      status.textContent = '請輸入 0 以上的數字。';
      return;
    }
    button.disabled = true;
    status.textContent = '儲存中…';
    try {
      const response = await fetch('/api/v281/transcript-settings', {
        method:'PUT', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '儲存失敗');
      status.textContent = `已儲存：解鎖 ${data.unlockCost} 顆；訂正獎勵 ${data.correctionReward} 顆；翻譯 ${data.translationCost} 顆。`;
    } catch (error) {
      status.textContent = error?.message || '儲存失敗';
    } finally {
      button.disabled = false;
    }
  }

  function mount() {
    if (!isOtherTabOpen()) return;
    const panel = document.querySelector('[role="tabpanel"]');
    if (!panel) return;
    let section = document.getElementById(SECTION_ID);
    if (!section || section.parentElement !== panel.querySelector('form')) {
      section?.remove();
      const form = panel.querySelector('form');
      if (!form) return;
      section = makeSection();
      form.prepend(section);
    }
    void load(section);
  }

  let timer = 0;
  const schedule = () => { clearTimeout(timer); timer = window.setTimeout(mount, 0); };
  new MutationObserver(schedule).observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['aria-selected'] });
  document.addEventListener('click', event => {
    if (event.target?.closest?.('button[role="tab"]')) window.setTimeout(mount, 0);
  });
  mount();
})();