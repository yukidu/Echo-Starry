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

function getOriginalCategoryButton(toolbar: HTMLElement) {
  return Array.from(toolbar.querySelectorAll<HTMLButtonElement>('.sort-toolbar-item > button'))
    .find(button => (button.textContent || '').replace(/\s+/g, '').startsWith('分類')) || null;
}

function findOriginalCategoryOption(toolbar: HTMLElement, category: string) {
  const trigger = getOriginalCategoryButton(toolbar);
  return Array.from(toolbar.querySelectorAll<HTMLButtonElement>('button'))
    .find(button => button !== trigger && (button.textContent || '').trim() === category) || null;
}

function delay(ms: number) {
  return new Promise<void>(resolve => window.setTimeout(resolve, ms));
}

async function ensureOriginalCategoryOption(category: string, generation: number) {
  const toolbar = getOriginalToolbar();
  if (!toolbar) return false;

  for (let openAttempt = 0; openAttempt < 3; openAttempt += 1) {
    if (generation !== selectionGeneration) return false;
    if (findOriginalCategoryOption(toolbar, category)) return true;

    const trigger = getOriginalCategoryButton(toolbar);
    if (!trigger) return false;
    trigger.click();

    for (let waitAttempt = 0; waitAttempt < 20; waitAttempt += 1) {
      if (generation !== selectionGeneration) return false;
      if (findOriginalCategoryOption(toolbar, category)) return true;
      await delay(25);
    }
  }

  return Boolean(findOriginalCategoryOption(toolbar, category));
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

  // v145 originally opened the hidden React dropdown and then tried to find the
  // requested option with timers. After the first category change, React list
  // rerenders can race those timers and leave the proxy toolbar stuck on one
  // category. Pause this click, make the real React option exist first, then
  // replay the exact v145 click. Its original handler can now select the option
  // synchronously and update its own label state without a race.
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
