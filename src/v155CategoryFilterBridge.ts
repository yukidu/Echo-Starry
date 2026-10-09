const CATEGORY_MENU_SELECTOR = '[data-v145-menu="category"]';
const ORIGINAL_CATEGORY_TRIGGER_SELECTOR = [
  '.sort-toolbar.v145-original-sort-engine button[title="點擊展開分類選單"]',
  '.sort-toolbar button[title="點擊展開分類選單"]'
].join(', ');

function getOriginalCategoryButton() {
  return document.querySelector<HTMLButtonElement>(ORIGINAL_CATEGORY_TRIGGER_SELECTOR);
}

function ensureV145LegacyCategoryMarker() {
  const trigger = getOriginalCategoryButton();
  if (!trigger) return false;

  const compactText = (trigger.textContent || '').replace(/\s+/g, '');
  if (compactText.startsWith('分類')) return true;

  let marker = trigger.querySelector<HTMLElement>('[data-v155-category-marker="1"]');
  if (!marker) {
    marker = document.createElement('span');
    marker.dataset.v155CategoryMarker = '1';
    marker.hidden = true;
    marker.setAttribute('aria-hidden', 'true');
    trigger.prepend(marker);
  }
  marker.textContent = '分類';
  return true;
}

window.addEventListener('click', event => {
  const target = event.target as Element | null;
  const option = target?.closest<HTMLButtonElement>(`${CATEGORY_MENU_SELECTOR} button`);
  if (!option) return;

  // The original React category trigger changes its visible text from "分類"
  // to the chosen category after the first selection. v145 still locates that
  // trigger by text, so its second selection could no longer find the button.
  // Identify the live React trigger by its stable title attribute and inject a
  // hidden compatibility marker before v145's normal click handler runs.
  // The marker is never visible, adds no observer/timer, and is recreated on
  // each selection if React has rerendered the trigger.
  ensureV145LegacyCategoryMarker();
}, true);
