function requestV161Sync() {
  window.setTimeout(() => window.dispatchEvent(new Event('pageshow')), 0);
}

document.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  if (target.closest('.mobile-menu-panel button, [data-quick-action-id="upload"], button[title="跳轉編輯音檔視窗介面"]')) {
    requestV161Sync();
  }
}, true);
