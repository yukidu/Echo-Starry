const ADMIN_CLEANUP_STYLE_ID = 'echostars-v139-admin-tab-cleanup';

const cleanAdminText = (value: string | null | undefined) => (value || '').replace(/\s+/g, ' ').trim();

function installAdminCleanupStyle() {
  if (document.getElementById(ADMIN_CLEANUP_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = ADMIN_CLEANUP_STYLE_ID;
  style.textContent = `[data-v139-moved-audio-tab="1"] { display: none !important; }`;
  document.head.appendChild(style);
}

function findAdminPanel(): HTMLElement | null {
  const heading = Array.from(document.querySelectorAll<HTMLElement>('h1,h2,h3,span'))
    .find(element => cleanAdminText(element.textContent) === '後台管理中心');
  if (!heading) return null;

  let candidate: HTMLElement | null = heading;
  while (candidate) {
    const buttonTexts = Array.from(candidate.querySelectorAll<HTMLButtonElement>('button'))
      .map(button => cleanAdminText(button.textContent));
    if (
      buttonTexts.includes('數據中心') ||
      buttonTexts.includes('會員') ||
      buttonTexts.includes('分類標籤') ||
      buttonTexts.includes('網友關鍵字') ||
      buttonTexts.includes('私秘音檔') ||
      buttonTexts.includes('權限表')
    ) return candidate;
    candidate = candidate.parentElement;
  }
  return null;
}

function removeMovedAudioTab() {
  const panel = findAdminPanel();
  if (!panel) return;
  panel.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
    if (cleanAdminText(button.textContent) === '音檔') {
      button.dataset.v139MovedAudioTab = '1';
      button.setAttribute('aria-hidden', 'true');
      button.tabIndex = -1;
    }
  });
}

installAdminCleanupStyle();
removeMovedAudioTab();

let cleanupQueued = false;
const observer = new MutationObserver(() => {
  if (cleanupQueued) return;
  cleanupQueued = true;
  queueMicrotask(() => {
    cleanupQueued = false;
    removeMovedAudioTab();
  });
});
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('pageshow', removeMovedAudioTab);
