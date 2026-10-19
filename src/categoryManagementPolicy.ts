const CATEGORY_POLICY_STYLE_ID = 'echostars-category-management-policy';
const DELETE_CONFIRM_WINDOW_MS = 6000;

function installUploadCategoryPolicyStyle() {
  if (document.getElementById(CATEGORY_POLICY_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = CATEGORY_POLICY_STYLE_ID;
  style.textContent = `
    .upload-modal-overlay button[title="修改標籤名稱"],
    .upload-modal-overlay button[title="刪除此標籤"],
    .audio-form-document button[title="修改標籤名稱"],
    .audio-form-document button[title="刪除此標籤"] {
      display: none !important;
    }
  `;
  document.head.appendChild(style);
}

function enforceUploadCategorySelectionOnly(root: ParentNode = document) {
  root.querySelectorAll<HTMLInputElement>(
    '.upload-modal-overlay input[placeholder^="輸入新標籤名稱"], .audio-form-document input[placeholder^="輸入新標籤名稱"]'
  ).forEach(input => {
    const row = input.parentElement;
    if (row) row.style.setProperty('display', 'none', 'important');
  });

  root.querySelectorAll<HTMLElement>('.upload-modal-overlay span, .audio-form-document span').forEach(span => {
    const text = span.textContent?.trim() || '';
    if (text.includes('右側按鈕可編輯或刪除標籤')) {
      span.textContent = '僅可選取既有分類；新增、修改、刪除請至後台管理中心 › 分類標籤';
    }
  });
}

function resetCategoryDeleteButton(button: HTMLButtonElement) {
  const label = button.querySelector<HTMLElement>('[data-category-delete-confirm-label]');
  label?.remove();
  button.classList.remove('ring-2', 'ring-rose-500', 'bg-rose-100', 'dark:bg-rose-950');
  button.title = button.dataset.categoryDeleteOriginalTitle || '刪除標籤';
  delete button.dataset.categoryDeleteConfirmUntil;
  delete button.dataset.categoryDeleteOriginalTitle;
}

function resetOtherDeleteButtons(active?: HTMLButtonElement) {
  document.querySelectorAll<HTMLButtonElement>('button[data-category-delete-confirm-until]').forEach(button => {
    if (button !== active) resetCategoryDeleteButton(button);
  });
}

function armCategoryDeleteButton(button: HTMLButtonElement) {
  resetOtherDeleteButtons(button);
  button.dataset.categoryDeleteOriginalTitle = button.title || '刪除標籤';
  button.dataset.categoryDeleteConfirmUntil = String(Date.now() + DELETE_CONFIRM_WINDOW_MS);
  button.title = '再次點擊確認刪除';
  button.classList.add('ring-2', 'ring-rose-500', 'bg-rose-100', 'dark:bg-rose-950');

  if (!button.querySelector('[data-category-delete-confirm-label]')) {
    const label = document.createElement('span');
    label.dataset.categoryDeleteConfirmLabel = '1';
    label.textContent = '再次確認';
    label.className = 'ml-1 text-[10px] font-black whitespace-nowrap';
    button.appendChild(label);
  }

  window.setTimeout(() => {
    const until = Number(button.dataset.categoryDeleteConfirmUntil || 0);
    if (until > 0 && Date.now() >= until) resetCategoryDeleteButton(button);
  }, DELETE_CONFIRM_WINDOW_MS + 50);
}

function installAdminCategoryDeleteGuard() {
  document.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const button = target.closest<HTMLButtonElement>('button[title="刪除標籤"], button[title="再次點擊確認刪除"]');
    if (!button || button.closest('.upload-modal-overlay,.audio-form-document')) return;

    const until = Number(button.dataset.categoryDeleteConfirmUntil || 0);
    if (until > Date.now()) {
      // Second click: remove the visual warning and let React's original
      // onClick continue to the real DELETE request.
      resetCategoryDeleteButton(button);
      return;
    }

    // First click: stop before React's delegated handler. No API request occurs.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    armCategoryDeleteButton(button);
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') resetOtherDeleteButtons();
  });
}

installUploadCategoryPolicyStyle();
enforceUploadCategorySelectionOnly();
installAdminCategoryDeleteGuard();

const categoryPolicyObserver = new MutationObserver(mutations => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node instanceof Element) enforceUploadCategorySelectionOnly(node);
    }
  }
});

categoryPolicyObserver.observe(document.documentElement, {
  childList: true,
  subtree: true
});
