let v145GuestCtaTimer = 0;

function v145IsGuestMode() {
  try { return !localStorage.getItem('sq_current_user_v1'); }
  catch { return true; }
}

function v145OpenRegistrationFromWindowCapture() {
  if (!v145IsGuestMode()) return;
  if (v145GuestCtaTimer) window.clearInterval(v145GuestCtaTimer);

  let attempts = 0;
  const tryOpen = () => {
    const identity = document.querySelector<HTMLButtonElement>('.navbar-menu-identity');
    if (identity) {
      if (v145GuestCtaTimer) window.clearInterval(v145GuestCtaTimer);
      v145GuestCtaTimer = 0;
      identity.click();
      return;
    }

    const login = Array.from(document.querySelectorAll<HTMLButtonElement>('.navbar-menu-footer-button'))
      .find(button => button.textContent?.trim() === '登入');
    if (login) {
      if (v145GuestCtaTimer) window.clearInterval(v145GuestCtaTimer);
      v145GuestCtaTimer = 0;
      login.click();
      return;
    }

    const hamburger = document.querySelector<HTMLButtonElement>('button[data-main-menu="hamburger"]');
    if (hamburger?.getAttribute('aria-expanded') !== 'true') hamburger?.click();

    attempts += 1;
    if (attempts >= 18) {
      if (v145GuestCtaTimer) window.clearInterval(v145GuestCtaTimer);
      v145GuestCtaTimer = 0;
    }
  };

  tryOpen();
  if (!v145GuestCtaTimer && attempts > 0 && attempts < 18) {
    v145GuestCtaTimer = window.setInterval(tryOpen, 80);
  }
}

/*
 * v144 已在 window capture 階段攔截 CTA 並 stopPropagation。
 * 因此 v145 修復必須也掛在 window capture；同一個 window 節點上的後續 listener
 * 仍會執行，才能可靠開啟既有 React 註冊／登入畫面。
 */
window.addEventListener('click', event => {
  const target = event.target as Element | null;
  if (!target?.closest('.v141-member-teaser-unlock')) return;
  event.preventDefault();
  v145OpenRegistrationFromWindowCapture();
}, true);
