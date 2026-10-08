const V138_ADMIN_CLEANUP_STYLE_ID = 'echostars-v138-admin-tab-cleanup';

const cleanAdminText = (value: string | null | undefined) => (value || '').replace(/\s+/g, ' ').trim();

function installAdminCleanupStyle() {
  if (document.getElementById(V138_ADMIN_CLEANUP_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = V138_ADMIN_CLEANUP_STYLE_ID;
  style.textContent = `
    [data-v138-retired-admin-tab="1"] { display: none !important; }
  `;
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

    const looksLikeAdminPanel =
      buttonTexts.includes('數據中心') ||
      buttonTexts.includes('會員') ||
      buttonTexts.includes('分類標籤') ||
      buttonTexts.includes('網友關鍵字') ||
      buttonTexts.includes('私秘音檔') ||
      buttonTexts.includes('權限表');

    if (looksLikeAdminPanel) return candidate;
    candidate = candidate.parentElement;
  }

  return heading.closest<HTMLElement>('.app-modal-overlay');
}

function removeMovedAndRetiredAdminTabs() {
  const panel = findAdminPanel();
  if (!panel) return;

  panel.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
    const text = cleanAdminText(button.textContent);
    if (text === '音檔' || text === '顯示') {
      button.dataset.v138RetiredAdminTab = '1';
      button.setAttribute('aria-hidden', 'true');
      button.tabIndex = -1;
    }
  });
}

installAdminCleanupStyle();
removeMovedAndRetiredAdminTabs();

let cleanupQueued = false;
const observer = new MutationObserver(() => {
  if (cleanupQueued) return;
  cleanupQueued = true;
  queueMicrotask(() => {
    cleanupQueued = false;
    removeMovedAndRetiredAdminTabs();
  });
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true
});

window.addEventListener('pageshow', removeMovedAndRetiredAdminTabs);
