const CATEGORY_MENU_SELECTOR = '[data-v145-menu="category"]';
const ORIGINAL_TOOLBAR_SELECTOR = '.sort-toolbar.v145-original-sort-engine';

let replayingCategoryClick = false;
let selectionGeneration = 0;

function categoryFromLabel(rawLabel: string) {
  const label = rawLabel.replace(/\s+/g, ' ').trim();
  return label === '全部分類' ? '全部' : label;
}

function getOriginalToolbar() {
  return document.querySelector<HTMLElement>(ORIGINAL_TOOLBAR_SELECTOR)
    || document.querySelector<HTMLElement>('.sort-toolbar');
}

function getOriginalCategoryButton() {
  const toolbar = getOriginalToolbar();
  if (!toolbar) return null;
  return Array.from(toolbar.querySelectorAll<HTMLButtonElement>('.sort-toolbar-item > button'))
    .find(button => (button.textContent || '').replace(/\s+/g, '').startsWith('分類')) || null;
}

function findOriginalCategoryOption(category: string) {
  const toolbar = getOriginalToolbar();
  if (!toolbar) return null;
  const trigger = Array.from(toolbar.querySelectorAll<HTMLButtonElement>('.sort-toolbar-item > button'))
    .find(button => (button.textContent || '').replace(/\s+/g, '').startsWith('分類')) || null;
  return Array.from(toolbar.querySelectorAll<HTMLButtonElement>('button'))
    .find(button => button !== trigger && (button.textContent || '').trim() === category) || null;
}

function delay(ms: number) {
  return new Promise<void>(resolve => window.setTimeout(resolve, ms));
}

async function ensureOriginalCategoryOption(category: string, generation: number) {
  // Important: never keep a toolbar DOM reference across React renders.
  // Opening the original category dropdown can replace that toolbar node.
  // Re-query the live React DOM every single attempt instead.
  for (let openAttempt = 0; openAttempt < 3; openAttempt += 1) {
    if (generation !== selectionGeneration) return false;
    if (findOriginalCategoryOption(category)) return true;

    const trigger = getOriginalCategoryButton();
    if (!trigger) return false;
    trigger.click();

    for (let waitAttempt = 0; waitAttempt < 20; waitAttempt += 1) {
      if (generation !== selectionGeneration) return false;
      if (findOriginalCategoryOption(category)) return true;
      await delay(25);
    }
  }

  return Boolean(findOriginalCategoryOption(category));
}

function findCurrentCustomOption(category: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>(`${CATEGORY_MENU_SELECTOR} button`))
    .find(button => categoryFromLabel(button.textContent || '') === category) || null;
}

window.addEventListener('click', event => {
  if (replayingCategoryClick) return;
  const target = event.target as Element | null;
  const option = target?.closest<HTMLButtonElement>(`${CATEGORY_MENU_SELECTOR} button`);
  if (!option) return;

  const category = categoryFromLabel(option.textContent || '');
  if (!category) return;

  // v145 used a timer while holding a React toolbar node that can become stale
  // as soon as the dropdown opens. Pause the custom click, prepare the option
  // against the *current* toolbar node, then replay v145's normal click once.
  event.preventDefault();
  event.stopImmediatePropagation();

  const generation = ++selectionGeneration;
  void ensureOriginalCategoryOption(category, generation).then(ready => {
    if (!ready || generation !== selectionGeneration) {
      console.warn('[v155] Category option could not be prepared:', category);
      return;
    }

    const currentOption = findCurrentCustomOption(category) || option;
    replayingCategoryClick = true;
    try {
      currentOption.click();
    } finally {
      replayingCategoryClick = false;
    }
  });
}, true);
