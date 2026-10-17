(() => {
  if (window.__starryTranscriptUiV291) return;
  window.__starryTranscriptUiV291 = true;

  const style = document.createElement('style');
  style.textContent = `
    #v290-transcript-panel .v290-title{display:none!important}
    #v290-transcript-panel .v290-head{justify-content:center!important;margin-bottom:.55rem!important}
    #v290-transcript-panel .v290-tools{margin-left:0!important;width:100%!important;justify-content:center!important;gap:.5rem!important}
    #v290-transcript-panel .v290-menu{right:auto!important;left:50%!important;transform:translateX(-50%)!important}
    #v290-transcript-panel .v290-btn:disabled{opacity:1!important}
    #v290-overlay.v290-overlay{min-height:3.65rem!important;max-height:5.4rem!important;padding:.38rem 3.35rem .38rem .7rem!important;border-radius:.9rem!important}
    #v290-overlay .v290-overlay-close{right:.38rem!important;top:50%!important;transform:translateY(-50%)!important;width:2.7rem!important;height:2.7rem!important;font-size:1.85rem!important;line-height:1!important;background:rgba(255,255,255,.18)!important}
    @media(max-width:420px){
      #v290-transcript-panel .v290-head{align-items:center!important}
      #v290-transcript-panel .v290-tools{gap:.38rem!important}
      #v290-overlay.v290-overlay{min-height:3.35rem!important;max-height:4.9rem!important;padding:.32rem 3.1rem .32rem .55rem!important}
      #v290-overlay .v290-overlay-close{width:2.5rem!important;height:2.5rem!important;font-size:1.7rem!important}
    }
  `;
  document.head.appendChild(style);

  function polish() {
    const panel = document.getElementById('v290-transcript-panel');
    if (panel) {
      const title = panel.querySelector('.v290-title');
      if (title) title.remove();
      const translate = panel.querySelector('[data-v290-translate]');
      if (translate) translate.setAttribute('aria-label', 'Translate');
    }
    const overlay = document.getElementById('v290-overlay');
    if (overlay) {
      const close = overlay.querySelector('[data-v290-overlay-close]');
      if (close) {
        if (close.textContent !== '✕') close.textContent = '✕';
        close.setAttribute('aria-label', '關閉放大逐字稿');
      }
    }
  }

  let timer = 0;
  const schedule = () => {
    clearTimeout(timer);
    timer = window.setTimeout(polish, 40);
  };
  new MutationObserver(schedule).observe(document.body, { childList:true, subtree:true });
  window.addEventListener('resize', schedule);
  polish();
})();