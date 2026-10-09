const THEME_LABELS = new Set(['淺色／暗色切換', '開燈', '關燈', '開燈/關燈', '開燈／關燈']);
let syncFrame = 0;

function desiredThemeActionLabel() {
  return document.documentElement.classList.contains('dark') ? '開燈' : '關燈';
}

function patchThemeActionLabel() {
  const nextLabel = desiredThemeActionLabel();
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.mobile-menu-row button'));

  for (const button of buttons) {
    const label = button.querySelector<HTMLElement>('span.min-w-0.flex-1');
    const text = label?.textContent?.trim() || '';
    if (!label || !THEME_LABELS.has(text)) continue;

    if (label.textContent !== nextLabel) label.textContent = nextLabel;
    button.setAttribute('aria-label', nextLabel);
    button.setAttribute('title', nextLabel);
    return;
  }
}

function queueSync() {
  if (syncFrame) return;
  syncFrame = window.requestAnimationFrame(() => {
    syncFrame = 0;
    patchThemeActionLabel();
  });
}

queueSync();
window.addEventListener('pageshow', queueSync);

const observer = new MutationObserver(queueSync);
observer.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['class'],
  childList: true,
  subtree: true
});
